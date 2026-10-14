import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { createPayment, listMembers, listPayments } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { formatDate, fmtNum, formatTime } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { PrimaryAction, SecondaryAction, StatCard, Panel, EmptyState } from '../../components/dashboard';
import Spinner from '../../components/ui/Spinner';
import {
  Plus, ShoppingCart, CalendarPlus, FileText, X,
  Wallet, Banknote, HandCoins, Smartphone, Receipt,
} from 'lucide-react';

// ====================================================================
// §43 — payments screen (مقبوضات فقط). Built on the exact attendance
// pattern (§35ب): quick actions + a real «تسجيل دفعة» modal (orange) +
// PDF export → four summary cards computed over the FILTERED date range
// → from/to/method filter bar with تطبيق → the payments log table,
// newest on top. Every number comes from GET /api/finance/payments
// (server-side range aggregates in the gym timezone — nothing is
// client-reduced, nothing is decorative).
// ====================================================================

// The seven methods the screen knows. Real usage today is cash/transfer/
// vodafone; the rest are wired and waiting — the server enum
// (createPaymentSchema) accepts exactly these values (§43).
const PAYMENT_METHODS = ['cash', 'card', 'instapay', 'bank', 'visa', 'vodafone_cash', 'wallet'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  cash: { ar: 'نقدي', en: 'Cash' },
  card: { ar: 'بطاقة', en: 'Card' },
  instapay: { ar: 'انستاباي', en: 'InstaPay' },
  bank: { ar: 'تحويل', en: 'Transfer' },
  bank_transfer: { ar: 'تحويل', en: 'Transfer' }, // legacy seed value — same label
  visa: { ar: 'فيزا', en: 'Visa' },
  vodafone_cash: { ar: 'فودافون كاش', en: 'Vodafone Cash' },
  wallet: { ar: 'تطبيق', en: 'App' },
};

interface PaymentRow {
  id: string;
  created_at: string;
  amount: string | number;
  description: string | null;
  payment_method: string | null;
  member_name: string | null;
  member_phone: string | null;
}

/** Local-time YYYY-MM-DD (same rule as the attendance screen). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAGE_LIMIT = 100;

export default function PaymentsPage() {
  const { language, role, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  const firstOfMonth = localDateStr(new Date()).slice(0, 8) + '01';
  const today = localDateStr(new Date());

  // Draft inputs vs applied filter — nothing queries until تطبيق (§43 spec).
  const [draftFrom, setDraftFrom] = useState(firstOfMonth);
  const [draftTo, setDraftTo] = useState(today);
  const [draftMethod, setDraftMethod] = useState<'all' | PaymentMethod>('all');
  const [applied, setApplied] = useState<{ from: string; to: string; method: 'all' | PaymentMethod }>({
    from: firstOfMonth, to: today, method: 'all',
  });
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);

  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const { data: payRes, isLoading } = useApiQuery<{ data: PaymentRow[]; pagination: any; stats?: any }>(
    ['payments-screen', applied.from, applied.to, applied.method, String(page)],
    () => listPayments({ page, limit: PAGE_LIMIT, from: applied.from, to: applied.to, method: applied.method === 'all' ? undefined : applied.method }),
  );
  const rows = payRes?.data ?? [];
  const pagination = payRes?.pagination ?? {};
  const stats = payRes?.stats ?? {};
  const totalPages: number = pagination.total_pages || 1;

  const { data: membersRes } = useApiQuery(['members'], () => listMembers(), { enabled: showModal });
  const members = membersRes?.members ?? [];

  const createMutation = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      showToast(rtl ? 'تم تسجيل الدفعة' : 'Payment recorded', 'success');
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['payments-screen'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payments'] });
      queryClient.invalidateQueries({ queryKey: ['nav', 'badges'] });
    },
    onError: () => showToast(rtl ? 'فشل تسجيل الدفعة' : 'Could not record the payment', 'error'),
  });

  const methodLabel = (m: string | null) =>
    m ? (METHOD_LABELS[m]?.[rtl ? 'ar' : 'en'] ?? m) : '—';

  // §43 — PDF prints exactly the sheet currently on screen (attendance rule).
  const exportPdf = () => {
    const ok = printDocument({
      title: rtl ? `سجل المدفوعات ${applied.from} → ${applied.to}` : `Payments log ${applied.from} → ${applied.to}`,
      innerHtml: `
        <h1>${escapeHtml(rtl ? 'سجل المدفوعات' : 'Payments Log')} — ${escapeHtml(`${applied.from} ← ${applied.to}`)}</h1>
        <p class="muted">${escapeHtml(rtl ? 'العدد' : 'Count')}: ${fmtNum(Number(pagination.total || 0))} ·
          ${escapeHtml(rtl ? 'الإجمالي' : 'Total')}: ${escapeHtml(money(stats.range_sum))} ·
          ${escapeHtml(rtl ? 'تاريخ التصدير' : 'Exported')}: ${escapeHtml(`${today} ${formatTime(new Date().toISOString())}`)}</p>
        ${rows.length === 0 ? `<p class="muted">${escapeHtml(rtl ? 'لا توجد مدفوعات في هذا النطاق' : 'No payments in this range')}</p>` : `
        <table>
          <thead><tr>
            <th>#</th><th>${escapeHtml(rtl ? 'التاريخ' : 'Date')}</th>
            <th>${escapeHtml(rtl ? 'العضو' : 'Member')}</th><th>${escapeHtml(rtl ? 'الهاتف' : 'Phone')}</th>
            <th>${escapeHtml(rtl ? 'المبلغ' : 'Amount')}</th><th>${escapeHtml(rtl ? 'الطريقة' : 'Method')}</th>
            <th>${escapeHtml(rtl ? 'ملاحظات' : 'Notes')}</th>
          </tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr>
              <td>${(page - 1) * PAGE_LIMIT + i + 1}</td>
              <td>${escapeHtml(formatDate(r.created_at))}</td>
              <td>${escapeHtml(r.member_name || '—')}</td>
              <td>${escapeHtml(r.member_phone || '—')}</td>
              <td>+${escapeHtml(money(r.amount))}</td>
              <td>${escapeHtml(methodLabel(r.payment_method))}</td>
              <td>${escapeHtml(r.description || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>`}`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  const todayPill = Number(stats.today_count || 0) > 0
    ? `+${fmtNum(Number(stats.today_count))} ${rtl ? 'عملية اليوم' : 'today'}`
    : undefined;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* §35ث — title/subtitle live in the top bar; actions stay here (§43):
          quick actions + orange «تسجيل دفعة» + PDF. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {role === 'gym-admin' && (
            <>
              <PrimaryAction onClick={() => navigate('/admin/members/add')}>
                <Plus size={16} /> {rtl ? 'مشترك' : 'Member'}
              </PrimaryAction>
              <SecondaryAction onClick={() => navigate('/admin/sales')}>
                <ShoppingCart size={16} /> {rtl ? 'بيع' : 'Sell'}
              </SecondaryAction>
              <SecondaryAction onClick={() => navigate('/admin/gym')}>
                <CalendarPlus size={16} /> {rtl ? 'حصة' : 'Class'}
              </SecondaryAction>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={exportPdf}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
          >
            <FileText size={15} />
            {rtl ? 'تصدير PDF' : 'Export PDF'}
          </button>
          {role === 'gym-admin' && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl px-4 py-2 shadow-sm transition min-h-[44px]"
            >
              <Plus size={16} />
              {rtl ? 'تسجيل دفعة' : 'Record Payment'}
            </button>
          )}
        </div>
      </div>

      {/* Four summary cards — RTL start at the right, computed over the
          applied DATE RANGE (the method filter never changes them). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard icon={Wallet} label={rtl ? 'إجمالي المدفوعات' : 'Total payments'} value={money(stats.range_sum ?? 0)} sub={todayPill} accent="emerald" />
        <StatCard icon={Banknote} label={rtl ? 'نقدي' : 'Cash'} value={money(stats.range_cash ?? 0)} accent="amber" />
        <StatCard icon={HandCoins} label={rtl ? 'تحويل' : 'Transfer'} value={money(stats.range_bank ?? 0)} accent="sky" />
        <StatCard icon={Smartphone} label={rtl ? 'فودافون كاش' : 'Vodafone Cash'} value={money(stats.range_vodafone ?? 0)} accent="rose" />
      </div>

      {/* Filter bar — from / to / method + apply (project emerald). */}
      <Panel icon={Receipt} accent="cyan" title={rtl ? 'الفلاتر' : 'Filters'}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'من تاريخ' : 'From date'}</label>
            <input
              type="date"
              value={draftFrom}
              max={draftTo}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'إلى تاريخ' : 'To date'}</label>
            <input
              type="date"
              value={draftTo}
              min={draftFrom}
              max={today}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'طريقة الدفع' : 'Method'}</label>
            <select
              value={draftMethod}
              onChange={(e) => setDraftMethod(e.target.value as 'all' | PaymentMethod)}
              className="h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            >
              <option value="all">{rtl ? 'كل الطرق' : 'All methods'}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{METHOD_LABELS[m][rtl ? 'ar' : 'en']}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setApplied({ from: draftFrom, to: draftTo, method: draftMethod });
              setPage(1);
            }}
            className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition min-h-[44px]"
          >
            {rtl ? 'تطبيق' : 'Apply'}
          </button>
          <span className="text-xs text-gray-400 pb-1">
            {applied.from} ← {applied.to}
            {applied.method !== 'all' ? ` · ${METHOD_LABELS[applied.method][rtl ? 'ar' : 'en']}` : ''}
          </span>
        </div>
      </Panel>

      {/* The payments log — newest first, count in the title, positive-only
          (this screen holds receipts; refunds/expenses live elsewhere). */}
      <Panel icon={Receipt} accent="emerald" title={`${rtl ? 'سجل المدفوعات' : 'Payments Log'} (${fmtNum(Number(pagination.total ?? 0))})`}>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            accent="gray"
            title={rtl ? 'لا توجد مدفوعات في هذا النطاق' : 'No payments in this range'}
            description={rtl ? 'غيّر الفلاتر أو سجّل دفعة جديدة من الزرار البرتقالي.' : 'Change the filters, or record a payment with the orange button.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'Date'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'العضو' : 'Member'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الهاتف' : 'Phone'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الطريقة' : 'Method'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'ملاحظات' : 'Notes'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3 font-medium">{r.member_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap" dir="ltr">{r.member_phone || '—'}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 whitespace-nowrap">+{money(r.amount)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-gray-100 text-gray-600 rounded-full px-2.5 py-1 text-xs font-semibold">
                          {methodLabel(r.payment_method)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[280px] truncate" title={r.description || undefined}>{r.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={() => setPage((v) => Math.max(1, v - 1))}
                  disabled={page <= 1}
                  className="min-h-[44px] px-4 py-1.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200"
                >
                  {rtl ? 'السابق' : 'Prev'}
                </button>
                <span className="text-xs text-gray-500">
                  {rtl ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
                </span>
                <button
                  onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
                  disabled={page >= totalPages}
                  className="min-h-[44px] px-4 py-1.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200"
                >
                  {rtl ? 'التالي' : 'Next'}
                </button>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* §43 — centered «تسجيل دفعة» modal (owner rule: centered popups). */}
      {showModal && (
        <RecordPaymentModal
          rtl={rtl}
          members={members}
          saving={createMutation.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      )}
    </div>
  );
}

// ── Record-payment modal ────────────────────────────────────────────
function RecordPaymentModal({
  rtl,
  members,
  saving,
  onClose,
  onSubmit,
}: {
  rtl: boolean;
  members: { id: string; full_name: string }[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: { member_id: string; amount: number; description?: string; payment_method?: string }) => void;
}) {
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');

  const canSubmit = !!memberId && Number(amount) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{rtl ? 'تسجيل دفعة' : 'Record Payment'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label={rtl ? 'إغلاق' : 'Close'}>
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({
              member_id: memberId,
              amount: Number(amount),
              payment_method: method,
              description: note.trim() || undefined,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'العضو' : 'Member'} *</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
              className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            >
              <option value="">{rtl ? 'اختر عضوًا…' : 'Select a member…'}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'المبلغ' : 'Amount'} *</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'طريقة الدفع' : 'Method'}</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{METHOD_LABELS[m][rtl ? 'ar' : 'en']}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'ملاحظات' : 'Notes'}</label>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={rtl ? 'مثال: دفعة اشتراك شهري' : 'e.g. monthly renewal'}
              className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="flex-1 min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold transition"
            >
              {saving ? (rtl ? 'جاري الحفظ…' : 'Saving…') : (rtl ? 'حفظ الدفعة' : 'Save payment')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition"
            >
              {rtl ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
