import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../../context/GymBrandContext';
import { listSessions, revokeSession, revokeAllOtherSessions } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import Spinner from '../../../components/ui/Spinner';
import PageLoader from '../../../components/shared/PageLoader';
import StatusBadge from '../../../components/ui/StatusBadge';
import type { UserSession } from '../../../services/api';

function parseBrowser(ua: string | null): string {
  if (!ua) return '-';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  return ua.split('/')[0] || '-';
}

function parseOS(ua: string | null): string {
  if (!ua) return '-';
  if (ua.includes('Windows NT')) return 'Windows';
  if (ua.includes('Mac OS X')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return '-';
}

function formatTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function SessionsTab() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [revokingAll, setRevokingAll] = useState(false);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: listSessions,
    refetchInterval: 30_000,
  });

  const revokeMut = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      showToast(rtl ? 'تم إنهاء الجلسة' : 'Session revoked', 'success');
    },
    onError: () => showToast(rtl ? 'فشل إنهاء الجلسة' : 'Failed to revoke session', 'error'),
  });

  const revokeAllMut = useMutation({
    mutationFn: revokeAllOtherSessions,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      showToast(
        rtl ? `تم إنهاء ${data.revoked} جلسة` : `${data.revoked} session(s) revoked`,
        'success'
      );
      setRevokingAll(false);
    },
    onError: () => {
      showToast(rtl ? 'فشل إنهاء الجلسات' : 'Failed to revoke sessions', 'error');
      setRevokingAll(false);
    },
  });

  if (isLoading) return <PageLoader variant="skeleton" rows={3} />;

  const list: UserSession[] = sessions || [];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {rtl ? 'إدارة الجلسات النشطة' : 'Active Sessions'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {rtl
              ? `لديك ${list.length} جلسة نشطة`
              : `You have ${list.length} active session(s)`}
          </p>
        </div>
        {list.length > 1 && (
          <button
            onClick={() => { setRevokingAll(true); revokeAllMut.mutate(); }}
            disabled={revokingAll}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            {revokingAll ? (
              <Spinner />
            ) : (
              rtl ? 'إنهاء الكل' : 'Revoke All Others'
            )}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <span className="material-symbols-outlined text-5xl mb-3 block opacity-40">devices</span>
          <p>{rtl ? 'لا توجد جلسات نشطة' : 'No active sessions'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((session) => {
            const isCurrent = session === list[0];
            const browser = parseBrowser(session.user_agent);
            const os = parseOS(session.user_agent);
            return (
              <div
                key={session.id}
                className={`flex items-center justify-between p-4 rounded-3xl border shadow-sm transition ${
                  isCurrent
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    isCurrent ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <span className="material-symbols-outlined text-xl">
                      {os === 'Windows' ? 'desktop_windows' :
                       os === 'macOS' ? 'laptop_mac' :
                       os === 'Linux' ? 'laptop' :
                       os === 'Android' ? 'phone_android' :
                       os === 'iOS' ? 'phone_iphone' : 'devices'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 truncate max-w-[200px]">
                        {browser} — {os}
                      </span>
                      {isCurrent && (
                        <StatusBadge status={rtl ? 'هذه الجلسة' : 'Current'} variant="success" />
                      )}
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">language</span>
                        {session.ip_address || '-'}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        {rtl ? 'آخر نشاط: ' : ''}{formatTime(session.last_active_at, language)}
                      </span>
                      {session.device_name && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">devices</span>
                          {session.device_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    onClick={() => revokeMut.mutate(session.token_jti)}
                    disabled={revokeMut.isPending}
                    className="shrink-0 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 transition flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">block</span>
                    {rtl ? 'إنهاء الجلسة' : 'Revoke'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
