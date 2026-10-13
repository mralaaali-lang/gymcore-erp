import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  getTodayAttendance,
  lookupMembersForCheckIn,
  manualCheckInById,
  manualCheckInByPhone,
  qrCheckIn,
  type CheckInMemberHit,
} from '../../services/api';
import { Activity, Camera, Scan } from 'lucide-react';

// ====================================================================
// §35ب — the unified check-in card. ONE field that accepts whatever the
// receptionist actually has: a scanned barcode/QR pass, a typed phone,
// a name (with live suggestions from /api/attendance/lookup), or a pasted
// member UUID code. Camera decoding runs on jsQR (§35ت) — a pure-JS QR
// decoder that works in every browser with camera access, replacing the
// earlier BarcodeDetector path that desktop Chrome does not enable by
// default (it produced a "browser unsupported" dead-end for the user).
// Deliberately continuous: a success clears the field and keeps the card
// open with a session counter, because the front desk processes a queue,
// not a single visitor.
// Used TWICE on purpose: first card of the dashboard and the top card of
// /admin/attendance — one component so both stay identical.
// ====================================================================

interface Feedback { ok: boolean; text: string }

/** A pasted/scanned member pass is base64 of a JSON with a signature —
 *  anything else the user types is treated as name/phone/code text. */
function looksLikeQrToken(raw: string): boolean {
  if (!/^[A-Za-z0-9+/=]{60,}$/.test(raw)) return false;
  try {
    const parsed = JSON.parse(atob(raw)) as { member_id?: string; signature?: string };
    return !!(parsed && parsed.member_id && parsed.signature);
  } catch {
    return false;
  }
}

export default function CheckInCard({ className = '', listTo }: { className?: string; listTo?: string }) {
  const { language, role } = useApp();
  const rtl = language === 'ar';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const canCheckIn = role === 'gym-admin' || role === 'reception';

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Feedback | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastTokenRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  // Live suggestions — name / phone / member-UUID matches from the server.
  const q = query.trim();
  const isToken = looksLikeQrToken(q);
  const { data: hits } = useApiQuery<CheckInMemberHit[]>(
    ['attendance', 'lookup', q],
    () => lookupMembersForCheckIn(q),
    { staleTime: 10_000, enabled: canCheckIn && q.length >= 2 && !isToken }
  );
  const candidates = hits ?? [];
  const showList = canCheckIn && q.length >= 2 && candidates.length > 0 && !isToken;

  // متواجدون الآن — open sessions right now (server lazy-closes >1h ghosts).
  const { data: today } = useApiQuery(
    ['gym', 'attendance', 'today'],
    () => getTodayAttendance(),
    { staleTime: 10_000, refetchInterval: 30_000 }
  );
  const todayRecords = today?.records ?? [];
  const presentCount = todayRecords.filter(
    (r) => !(r as { check_out_time?: string | null }).check_out_time
  ).length;
  const todayCount = todayRecords.length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gym', 'attendance', 'today'] });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
    queryClient.invalidateQueries({ queryKey: ['nav', 'badges'] });
  };

  const succeed = (name?: string) => {
    setLast({
      ok: true,
      text: name
        ? (rtl ? `✓ مرحبًا ${name} — تم تسجيل الحضور` : `✓ Welcome ${name} — checked in`)
        : (rtl ? '✓ تم تسجيل الحضور' : '✓ Checked in'),
    });
    setSessionCount((c) => c + 1);
    setQuery('');
    setHighlight(0);
    invalidate();
  };

  const fail = (text: string) => setLast({ ok: false, text });

  const errorFrom = (e: unknown, fallback: string): string =>
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

  /** Register a specific member found via lookup. */
  const checkInMember = async (c: CheckInMemberHit) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await manualCheckInById(c.id);
      if (res?.success) succeed(c.full_name);
      else fail(res?.error || (rtl ? 'فشل تسجيل الحضور' : 'Check-in failed'));
    } catch (e) {
      fail(errorFrom(e, rtl ? 'فشل تسجيل الحضور' : 'Check-in failed'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Submit whatever is in the field: QR token → /qr, picked/unique
   *  candidate → manual by id, digits → manual by phone. */
  const submitQuery = async () => {
    const raw = query.trim();
    if (!raw || busyRef.current) return;
    if (looksLikeQrToken(raw)) {
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await qrCheckIn(raw);
        if (res?.success) succeed();
        else fail(res?.error || (rtl ? 'رفض السيرفر التسجيل' : 'Server rejected check-in'));
      } catch (e) {
        fail(errorFrom(e, rtl ? 'فشل تسجيل الحضور' : 'Check-in failed'));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      return;
    }
    const picked = candidates[highlight] ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (picked) {
      await checkInMember(picked);
      return;
    }
    if (/^[+0-9\s-]{7,}$/.test(raw)) {
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await manualCheckInByPhone(raw);
        if (res?.success) succeed();
        else fail(res?.error || (rtl ? 'لم يُعثر على عضو بهذا الرقم' : 'No member with this phone'));
      } catch (e) {
        fail(errorFrom(e, rtl ? 'لم يُعثر على عضو بهذا الرقم' : 'No member with this phone'));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      return;
    }
    fail(rtl ? 'اختر العضو من القائمة أو جرّب رقم الهاتف' : 'Pick the member from the list, or try a phone number');
  };

  // ── Camera: continuous BarcodeDetector loop with 3s token dedupe ──
  const stopCamera = () => {
    if (loopRef.current !== null) { window.clearTimeout(loopRef.current); loopRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };
  useEffect(() => stopCamera, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scanToken = async (raw: string) => {
    const token = raw.trim();
    if (!token || busyRef.current) return;
    const now = Date.now();
    if (lastTokenRef.current.token === token && now - lastTokenRef.current.at < 3000) return;
    lastTokenRef.current = { token, at: now };
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await qrCheckIn(token);
      if (res?.success) succeed();
      else fail(res?.error || (rtl ? 'رفض السيرفر التسجيل' : 'Server rejected check-in'));
    } catch (e) {
      fail(errorFrom(e, rtl ? 'فشل تسجيل الحضور' : 'Check-in failed'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraOn(true);
      // video mounts on the next render — wait one frame before attaching.
      await new Promise((r) => window.setTimeout(r, 0));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      // §35ت — jsQR decodes frames in pure JS: no BarcodeDetector flag needed.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = async () => {
        const video = videoRef.current;
        if (!streamRef.current || !video || !ctx) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.min(1, 360 / video.videoWidth);
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (found?.data) await scanToken(found.data);
          } catch { /* transient frame errors are expected */ }
        }
        loopRef.current = window.setTimeout(tick, 300);
      };
      loopRef.current = window.setTimeout(tick, 300);
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOn(false);
      setCameraError(rtl
        ? 'تعذر فتح الكاميرا — تحقق من إذن الكاميرا، أو استخدم الإدخال اليدوي.'
        : 'Camera unavailable — check permission, or use manual entry.');
    }
  };

  return (
    <section
      aria-label={rtl ? 'تسجيل الحضور والانصراف' : 'Check in / check out'}
      className={`bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 relative ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Activity size={19} className="text-emerald-600" />
            {rtl ? 'تسجيل الحضور والانصراف' : 'Check In / Check Out'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {rtl
              ? 'امسح الباركود أو أدخل كود العضو أو رقم الهاتف أو الاسم'
              : 'Scan a barcode/pass, or enter the member code, phone, or name'}
          </p>
        </div>

        {/* §35ت — «حضور اليوم» lives inside the card on the left (the old
            standalone dashboard panel and the presence circle are gone). */}
        <div className="shrink-0 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center min-w-[150px]">
          <p className="text-[11px] font-bold text-emerald-700">{rtl ? 'حضور اليوم' : 'Checked in today'}</p>
          <div className="flex items-end justify-center gap-4 mt-1.5">
            <div>
              <p className="text-2xl font-extrabold text-emerald-700 tabular-nums leading-none">{todayCount}</p>
              <p className="text-[10px] font-semibold text-emerald-600 mt-1">{rtl ? 'حضور' : 'visits'}</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-violet-700 tabular-nums leading-none">{presentCount}</p>
              <p className="text-[10px] font-semibold text-violet-600 mt-1">{rtl ? 'متواجدون الآن' : 'inside now'}</p>
            </div>
          </div>
          {listTo && (
            <button
              onClick={() => navigate(listTo)}
              className="mt-2 text-xs font-semibold text-emerald-700 hover:underline"
            >
              {rtl ? 'عرض القائمة' : 'View full list'}
            </button>
          )}
        </div>
      </div>

      {canCheckIn ? (
        <>
          <div className="relative mt-4">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlight(0); setLast(null); }}
                onKeyDown={(e) => {
                  if (showList && e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, candidates.length - 1)); }
                  else if (showList && e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
                  else if (e.key === 'Enter') { e.preventDefault(); void submitQuery(); }
                }}
                placeholder={rtl ? 'باركود / كود / هاتف / اسم…' : 'Barcode / code / phone / name…'}
                dir="auto"
                aria-label={rtl ? 'بحث العضو لتسجيل الحضور' : 'Member lookup for check-in'}
                className="flex-1 h-12 md:h-11 px-4 text-base md:text-sm rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={cameraOn ? stopCamera : startCamera}
                aria-label={cameraOn ? (rtl ? 'إيقاف الكاميرا' : 'Stop camera') : (rtl ? 'مسح بالكاميرا' : 'Scan with camera')}
                className={`shrink-0 w-12 h-12 md:h-11 md:w-11 rounded-xl border font-bold flex items-center justify-center transition ${
                  cameraOn ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Camera size={20} />
              </button>
              <button
                type="button"
                onClick={() => void submitQuery()}
                disabled={busy || !q}
                className="shrink-0 h-12 md:h-11 px-5 rounded-xl bg-emerald-600 text-white text-base md:text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 min-w-[96px]"
              >
                {busy ? (rtl ? 'جارٍ التسجيل…' : 'Saving…') : (rtl ? 'حضور' : 'Check in')}
              </button>
            </div>

            {/* Live suggestions — clicking one registers that member directly */}
            {showList && (
              <ul className="absolute z-20 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg max-h-56 overflow-auto py-1">
                {candidates.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void checkInMember(c)}
                      className={`w-full text-start px-4 py-2.5 text-sm flex items-center justify-between gap-2 ${i === highlight ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                    >
                      <span className="font-medium text-gray-900 truncate">{c.full_name}</span>
                      <span className="shrink-0 text-xs text-gray-500 flex items-center gap-2" dir="ltr">
                        {c.phone_number && <span>{c.phone_number}</span>}
                        {c.is_blacklisted
                          ? <span className="text-rose-600 font-semibold">{rtl ? 'محظور' : 'blocked'}</span>
                          : c.sub_status && c.sub_status !== 'active'
                            ? <span className="text-rose-600 font-semibold">{rtl ? 'غير نشط' : c.sub_status}</span>
                            : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {cameraOn && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video ref={videoRef} playsInline muted className="mt-3 w-full max-h-72 rounded-2xl object-cover bg-black" />
          )}
          {cameraError && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-xl p-3">{cameraError}</p>}
        </>
      ) : (
        <p className="mt-4 text-sm text-gray-500 bg-gray-50 rounded-xl p-3 flex items-center gap-2">
          <Scan size={16} />
          {rtl ? 'تسجيل الحضور يتم من شاشة الاستقبال أو المدير.' : 'Check-in is done from the front desk or manager screen.'}
        </p>
      )}

      {/* Result line + continuous session counter */}
      <div className="mt-3 min-h-[24px] flex items-center justify-between gap-3 flex-wrap">
        {last ? (
          <p className={`text-sm font-semibold ${last.ok ? 'text-emerald-600' : 'text-rose-600'}`} role="status">{last.text}</p>
        ) : <span />}
        {canCheckIn && sessionCount > 0 && (
          <span className="text-xs font-bold text-gray-500 bg-gray-100 rounded-full px-3 py-1">
            {rtl ? `معالَج في هذه الجلسة: ${sessionCount}` : `Processed this session: ${sessionCount}`}
          </span>
        )}
      </div>
    </section>
  );
}
