import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { createDebt, listDebts, listMembers, payDebt, getSettings } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { formatDate, fmtNum } from '../../utils/date';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import Spinner from '../../components/ui/Spinner';
import {
  Plus,
  X,
  MagnifyingGlass as Search,
  ArrowsClockwise as RefreshCw,
  Bank as Banknote,
  ChatText as MessageSquare,
  Receipt,
  CurrencyGbp as EgyptianPound,
  CalendarCheck as CalendarClock,
  ShoppingCart,
  Users
} from '@phosphor-icons/react';
// wa.me normalization lives in the shared member-contact component
// (same pattern reused by the absent-members report).
import { toWhatsAppNumber } from '../../components/members/MemberContact';

// ====================================================================
// §45 — member-debts collection screen. The full cycle lives on this one
// page: WhatsApp reminder (مطالبة) → settle in full or partially (تحصيل),
// without the receptionist ever leaving the screen. Four cards come from
// the server (unpaid aggregates — nothing is re-added client-side, §34ث),
// filters are name/phone + kind + status with صريح «بحث», and the debt
// kind/status are DERIVED server-side: member_debts has no kind column
// and «سداد جزئي» is simply paid>0 && remaining>0.
// ====================================================================

const DEBT_KINDS = ['subscription', 'sale', 'freeze', 'pt', 'other'] as const;
type DebtKind = (typeof DEBT_KINDS)[number];

const KIND_LABELS: Record<DebtKind, { ar: string; en: string }> = {
  subscription: { ar: 'اشتراك', en: 'Subscription' },
  sale: { ar: 'مبيعات', en: 'Sales' },
  freeze: { ar: 'تجميد', en: 'Freeze' },
  pt: { ar: 'برايفت', en: 'Private' },
  other: { ar: 'أخرى', en: 'Other' },
};

const KIND_BADGE: Record<DebtKind, string> = {
  subscription: 'bg-violet-50 text-violet-700',
  sale: 'bg-amber-50 text-amber-700',
  freeze: 'bg-gray-100 text-gray-600',
  pt: 'bg-sky-50 text-sky-700',
  other: 'bg-gray-100 text-gray-600',
};

// Status is derived on the server: pending = nothing paid yet,
// partial = some paid with a remaining balance (§45).
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  partial: 'bg-sky-100 text-sky-700',
};

interface DebtRow {
  id: string;
  created_at: string;
  due_date: string;
  original_amount: string | number;
  remaining_amount: string | number;
  paid_amount: string | number;
  reason: string | null;
  member_name: string | null;
  member_phone: string | null;
  debt_kind: DebtKind;
  payment_status: 'pending' | 'partial';
}

const PAGE_LIMIT = 100;

/** Local-time YYYY-MM-DD (same rule as the payments screen). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DebtsPage() {
  const { language, role, gymProfile } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  // Draft inputs vs applied filter — nothing queries until بحث (§45 spec).
  // kind يُقرأ من الرابط أول مرة (مديونية البرايفت تفتح ?kind=pt).
  const kindFromUrl = (): 'all' | DebtKind => {
    try {
      const k = new URLSearchParams(window.location.search).get('kind');
      return (DEBT_KINDS as readonly string[]).includes(k ?? '') ? (k as DebtKind) : 'all';
    } catch { return 'all'; }
  };
  const emptyFilter = { q: '', kind: 'all' as 'all' | DebtKind, status: 'all' as 'all' | 'pending' | 'partial' };
  const [draft, setDraft] = useState({ ...emptyFilter, kind: kindFromUrl() });
  const [applied, setApplied] = useState({ ...emptyFilter, kind: kindFromUrl() });
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<DebtRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: debtsRes, isLoading } = useApiQuery<{ data: DebtRow[]; pagination?: any; stats?: any }>(
    ['debts-screen', applied.q, applied.kind, applied.status, String(page)],
    () => listDebts({
      q: applied.q || undefined,
      kind: applied.kind,
      status: applied.status,
      page,
      limit: PAGE_LIMIT,
    }),
  );
  const rows = debtsRes?.data ?? [];
  const pagination = debtsRes?.pagination ?? {};
  const stats = debtsRes?.stats ?? {};
  const totalPages: number = pagination.total_pages || 1;

  const { data: membersRes } = useApiQuery(['members'], () => listMembers(), { enabled: showAdd });
  const members = membersRes?.members ?? [];

  // تذكير الواتساب يظهر/يختفي بمفتاح الإشعارات (الغياب = مفعّل)
  const { data: settingsRes } = useApiQuery(['settings'], getSettings, { staleTime: 5 * 60_000 });
  const waEnabled = (settingsRes?.data?.notify_debt_whatsapp ?? 'true') === 'true';

  const payMutation = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) => payDebt(id, amount, note),
    onSuccess: () => {
      showToast(rtl ? 'تم تسجيل السداد' : 'Payment recorded', 'success');
      setPaying(null);
      queryClient.invalidateQueries({ queryKey: ['debts-screen'] });
      queryClient.invalidateQueries({ queryKey: ['billing-payments'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['nav', 'badges'] });
    },
    onError: () => showToast(rtl ? 'فشل تسجيل السداد' : 'Could not record the payment', 'error'),
  });

  const addMutation = useMutation({
    mutationFn: createDebt,
    onSuccess: () => {
      showToast(rtl ? 'تم تسجيل الدين' : 'Debt recorded', 'success');
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ['debts-screen'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['nav', 'badges'] });
    },
    onError: () => showToast(rtl ? 'فشل تسجيل الدين' : 'Could not record the debt', 'error'),
  });

  // §45 — reminder goes to the member's own number with a dynamic Arabic
  // template carrying the exact owed line (kind/description/total/remaining)
  // and the gym's own name from the live brand profile.
  const sendReminder = (r: DebtRow) => {
    const intl = toWhatsAppNumber(r.member_phone || '');
    if (!intl) {
      showToast(rtl ? 'لا يوجد رقم هاتف لهذا العضو' : 'This member has no phone number', 'warning');
      return;
    }
    const msg = [
      `السلام عليكم أستاذ/ة ${r.member_name || ''} 🙏`,
      `نود تذكيركم بوجود مبلغ مستحق لدى ${gymProfile?.name || ''} —`,
      '📋 تفاصيل المستحقات:',
      `النوع: ${KIND_LABELS[r.debt_kind]?.[rtl ? 'ar' : 'en'] ?? '—'}`,
      `الوصف: ${r.reason || '—'}`,
      `الإجمالي: ${money(r.original_amount)}`,
      `المتبقي: ${money(r.remaining_amount)}`,
      'نرجو السداد في أقرب وقت. شكراً 🙏',
    ].join('\n');
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  const applyFilters = () => {
    setApplied({ ...draft });
    setPage(1);
  };
  const resetFilters = () => {
    setDraft(emptyFilter);
    setApplied(emptyFilter);
    setPage(1);
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* §35ث — title/subtitle live in the top bar; actions stay here (§45). */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">
            {rtl
              ? 'التذكير بالواتساب ثم السداد الكلي/الجزئي — دورة التحصيل كاملة من هذه الصفحة.'
              : 'WhatsApp reminder then full/partial settlement — the whole collection cycle on one page.'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {role === 'gym-admin' && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl px-4 py-2 shadow-sm transition min-h-[44px]"
            >
              <Plus size={16} />
              {rtl ? 'إضافة دين' : 'Add Debt'}
            </button>
          )}
        </div>
      </div>

      {/* Four summary cards — server-side aggregates over ALL unpaid debts;
          filters narrow the table only (§43 card rule). The fourth card is a
          COUNT, not money. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard icon={EgyptianPound} label={rtl ? 'إجمالي المستحق' : 'Total owed'} value={money(stats.total_due ?? 0)} accent="rose" />
        <StatCard icon={CalendarClock} label={rtl ? 'ديون اشتراكات' : 'Subscription debts'} value={money(stats.subscription_due ?? 0)} accent="violet" />
        <StatCard icon={ShoppingCart} label={rtl ? 'ديون مبيعات' : 'Sales debts'} value={money(stats.sale_due ?? 0)} accent="amber" />
        <StatCard icon={Users} label={rtl ? 'عدد الديون' : 'Debt count'} value={fmtNum(Number(stats.debt_count || 0))} accent="sky" />
      </div>

      {/* Filter bar — name/phone search + kind + status + explicit بحث. */}
      <Panel icon={Search} accent="cyan" title={rtl ? 'الفلاتر' : 'Filters'}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'بحث بالاسم أو الهاتف' : 'Search by name or phone'}</label>
            <input
              type="text"
              value={draft.q}
              maxLength={60}
              placeholder={rtl ? 'اسم العضو أو رقم الهاتف…' : 'Member name or phone…'}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyFilters(); } }}
              className="h-11 min-w-[220px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'نوع الدين' : 'Debt kind'}</label>
            <select
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as 'all' | DebtKind }))}
              className="h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            >
              <option value="all">{rtl ? 'الكل' : 'All'}</option>
              {DEBT_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k][rtl ? 'ar' : 'en']}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</label>
            <select
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as 'all' | 'pending' | 'partial' }))}
              className="h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            >
              <option value="all">{rtl ? 'الكل' : 'All'}</option>
              <option value="pending">{rtl ? 'قيد الانتظار' : 'Pending'}</option>
              <option value="partial">{rtl ? 'سداد جزئي' : 'Partially paid'}</option>
            </select>
          </div>
          <button
            onClick={applyFilters}
            className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition min-h-[44px]"
          >
            {rtl ? 'بحث' : 'Search'}
          </button>
          <button
            onClick={resetFilters}
            className="h-11 px-4 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold transition min-h-[44px] inline-flex items-center gap-1.5"
          >
            <RefreshCw size={15} />
            {rtl ? 'إعادة تعيين' : 'Reset'}
          </button>
        </div>
      </Panel>

      {/* The debts list — newest first, unpaid only; two row actions on the
          left (RTL): settle (green) + WhatsApp reminder. */}
      <Panel icon={Receipt} accent="emerald" title={`${rtl ? 'قائمة الديون' : 'Debts List'} (${fmtNum(Number(pagination.total ?? 0))})`}>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            accent="gray"
            title={rtl ? 'لا توجد ديون' : 'No debts'}
            description={rtl
              ? 'لا ديون مفتوحة بهذه الفلاتر — السداد الكامل يُخرج الدين من القائمة تلقائياً.'
              : 'No open debts with these filters — a fully settled debt leaves the list automatically.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'العضو' : 'Member'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'النوع' : 'Kind'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الوصف' : 'Description'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ' : 'Total'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المدفوع' : 'Paid'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المتبقي' : 'Remaining'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'Date'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{r.member_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${KIND_BADGE[r.debt_kind] ?? 'bg-gray-100 text-gray-600'}`}>
                          {KIND_LABELS[r.debt_kind]?.[rtl ? 'ar' : 'en'] ?? r.debt_kind}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[240px] truncate" title={r.reason || undefined}>{r.reason || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{money(r.original_amount)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{money(r.paid_amount)}</td>
                      <td className="px-4 py-3 font-bold text-red-600 whitespace-nowrap">{money(r.remaining_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[r.payment_status]}`}>
                          {r.payment_status === 'partial'
                            ? (rtl ? 'سداد جزئي' : 'Partially paid')
                            : (rtl ? 'قيد الانتظار' : 'Pending')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPaying(r)}
                            title={rtl ? 'سداد الدين' : 'Settle debt'}
                            aria-label={rtl ? 'سداد الدين' : 'Settle debt'}
                            className="w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                          >
                            <Banknote size={17} />
                          </button>
                          {waEnabled && (
                          <button
                            onClick={() => sendReminder(r)}
                            title={rtl ? 'تذكير واتساب' : 'WhatsApp reminder'}
                            aria-label={rtl ? 'تذكير واتساب' : 'WhatsApp reminder'}
                            className="w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-green-500 hover:bg-green-600 text-white shadow-sm transition"
                          >
                            <MessageSquare size={17} />
                          </button>
                          )}
                        </div>
                      </td>
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

      {/* §45 — centered settle modal (owner rule: centered popups). Amount
          arrives pre-filled with the FULL remaining but the field is editable:
          partial payment is officially supported and flips the row to
          «سداد جزئي» automatically. */}
      {paying && (
        <SettleDebtModal
          rtl={rtl}
          debt={paying}
          remainingLabel={money(paying.remaining_amount)}
          saving={payMutation.isPending}
          onClose={() => setPaying(null)}
          onSubmit={(amount, note) => payMutation.mutate({ id: paying.id, amount, note })}
        />
      )}

      {/* Manual debt — kept from the old billing Debts tab so the createDebt
          flow does not lose its only UI. */}
      {showAdd && (
        <AddDebtModal
          rtl={rtl}
          members={members}
          saving={addMutation.isPending}
          onClose={() => setShowAdd(false)}
          onSubmit={(payload) => addMutation.mutate(payload)}
        />
      )}
    </div>
  );
}

// ── Settle-debt modal ───────────────────────────────────────────────
function SettleDebtModal({
  rtl,
  debt,
  remainingLabel,
  saving,
  onClose,
  onSubmit,
}: {
  rtl: boolean;
  debt: DebtRow;
  remainingLabel: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (amount: number, note?: string) => void;
}) {
  const [amount, setAmount] = useState(String(debt.remaining_amount));
  const [note, setNote] = useState('');
  const canSubmit = Number(amount) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{rtl ? 'سداد الدين' : 'Settle Debt'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label={rtl ? 'إغلاق' : 'Close'}>
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit(Number(amount), note.trim() || undefined);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1">{rtl ? 'اسم العضو' : 'Member'}</label>
            <p className="h-11 px-3 flex items-center rounded-xl bg-gray-50 border border-gray-200 text-base font-bold text-gray-900">
              {debt.member_name || '—'}
            </p>
          </div>
          <p className="text-base font-bold text-red-600">
            {rtl ? `المبلغ المتبقي ${remainingLabel}` : `Remaining ${remainingLabel}`}
          </p>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">
              {rtl ? 'مبلغ السداد' : 'Payment amount'} *
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {rtl ? 'يمكنك سداد المبلغ كاملاً أو جزءه' : 'You may settle the full amount or part of it'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'ملاحظة' : 'Note'}</label>
            <textarea
              value={note}
              maxLength={500}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder={rtl ? 'ملاحظة اختيارية…' : 'Optional note…'}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-base text-gray-900 resize-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {rtl ? 'تأكيد السداد' : 'Confirm payment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-6 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition min-h-[44px]"
            >
              {rtl ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add-debt modal ──────────────────────────────────────────────────
function AddDebtModal({
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
  onSubmit: (payload: { member_id: string; amount: number; due_date: string; reason?: string }) => void;
}) {
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(localDateStr(new Date()));
  const [reason, setReason] = useState('');
  const canSubmit = !!memberId && Number(amount) > 0 && !!dueDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{rtl ? 'إضافة دين' : 'Add Debt'}</h2>
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
              due_date: dueDate,
              reason: reason.trim() || undefined,
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
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'تاريخ الاستحقاق' : 'Due date'} *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'الوصف / السبب' : 'Description / reason'}</label>
            <textarea
              value={reason}
              maxLength={500}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
              placeholder={rtl ? 'مثال: رصيد باقة شهري' : 'e.g. remaining balance — monthly plan'}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-base text-gray-900 resize-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {rtl ? 'حفظ الدين' : 'Save debt'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-6 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition min-h-[44px]"
            >
              {rtl ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
