import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { createExpense, listExpenseCategories, listExpenses } from '../../services/api';
import { currencySymbol, formatMoney } from '../../utils/currency';
import { formatDate, fmtNum, formatTime } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import Spinner from '../../components/ui/Spinner';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import Modal from '../../components/shared/Modal';
import {
  Plus,
  FileText,
  Wallet,
  Bank as Banknote,
  HandCoins,
  Receipt
} from '@phosphor-icons/react';

// ====================================================================
// §44 — expenses screen. Same shell as the payments screen (§43):
// quick actions + «إضافة مصروف» + PDF → four TIME-based cards → from/to
// filter (no method filter here — expenses leave the register as cash)
// → the expenses log, newest on top, amounts with a minus and in red.
// Cards and rows all come from GET /api/finance/expenses (server-side
// range aggregates in the gym timezone — nothing client-reduced).
// ====================================================================

interface ExpenseRow {
  id: string;
  created_at: string;
  amount: string | number;
  description: string | null;
  category_name: string | null;
  staff_name: string | null;
}

/** Local-time YYYY-MM-DD (same rule as the payments screen). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAGE_LIMIT = 100;

// §44 — the nine canonical buckets come from expense_categories (migration
// 070 seeds them per gym); the modal reads them live, never hardcodes.
const QUICK_ADD_ACCENT = 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';

export default function ExpensesPage() {
  const { language, role, gymProfile } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  const firstOfMonth = localDateStr(new Date()).slice(0, 8) + '01';
  const today = localDateStr(new Date());

  // Draft inputs vs applied filter — nothing queries until تطبيق (§44 spec).
  const [draftFrom, setDraftFrom] = useState(firstOfMonth);
  const [draftTo, setDraftTo] = useState(today);
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: firstOfMonth, to: today });
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);

  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const { data: expRes, isLoading } = useApiQuery<{ data: ExpenseRow[]; pagination?: any; stats?: any }>(
    ['expenses-screen', applied.from, applied.to, String(page)],
    () => listExpenses({ page, limit: PAGE_LIMIT, from: applied.from, to: applied.to }),
  );
  const rows = expRes?.data ?? [];
  const pagination = expRes?.pagination ?? {};
  const stats = expRes?.stats ?? {};
  const totalPages: number = pagination.total_pages || 1;

  const { data: categoriesRes } = useApiQuery(['expense-categories'], () => listExpenseCategories(), { enabled: showModal });
  const categories: { id: string; name: string }[] = categoriesRes?.data ?? [];

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      showToast(rtl ? 'تم إضافة المصروف' : 'Expense added', 'success');
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['expenses-screen'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: () => showToast(rtl ? 'فشل إضافة المصروف' : 'Could not add the expense', 'error'),
  });

  // بلا `sortable`: `/api/finance/expenses` بيقبل page/from/to بس، فمفيش ترتيب
  // حقيقي يعرض عليه (نفس قاعدة جدول المدفوعات والمبيعات).
  const columns: TableColumn<ExpenseRow>[] = [
    {
      id: 'created_at',
      label: rtl ? 'التاريخ' : 'Date',
      value: (r) => r.created_at,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.created_at)}</span>,
    },
    {
      id: 'category_name',
      label: rtl ? 'التصنيف' : 'Category',
      value: (r) => r.category_name,
      cell: (r) => (
        <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-table-head">
          {r.category_name || '—'}
        </span>
      ),
    },
    {
      id: 'description',
      label: rtl ? 'الوصف' : 'Description',
      value: (r) => r.description,
      cell: (r) => (
        <span className="block max-w-[280px] truncate" title={r.description || undefined}>
          {r.description || '—'}
        </span>
      ),
    },
    {
      id: 'staff_name',
      label: rtl ? 'الموظف' : 'Staff',
      value: (r) => r.staff_name,
      cell: (r) => <span>{r.staff_name || '—'}</span>,
    },
    {
      id: 'amount',
      label: rtl ? 'المبلغ' : 'Amount',
      numeric: true,
      value: (r) => Number(r.amount),
      cell: (r) => <span className="font-bold whitespace-nowrap text-destructive">−{money(r.amount)}</span>,
    },
  ];

  // §44 — PDF prints exactly the sheet currently on screen (payments rule).
  const exportPdf = () => {
    const ok = printDocument({
      title: rtl ? `سجل المصروفات ${applied.from} → ${applied.to}` : `Expenses log ${applied.from} → ${applied.to}`,
      innerHtml: `
        <h1>${escapeHtml(rtl ? 'سجل المصروفات' : 'Expenses Log')} — ${escapeHtml(`${applied.from} ← ${applied.to}`)}</h1>
        <p class="muted">${escapeHtml(rtl ? 'العدد' : 'Count')}: ${fmtNum(Number(pagination.total || 0))} ·
          ${escapeHtml(rtl ? 'الإجمالي' : 'Total')}: ${escapeHtml(money(stats.range_sum))} ·
          ${escapeHtml(rtl ? 'تاريخ التصدير' : 'Exported')}: ${escapeHtml(`${today} ${formatTime(new Date().toISOString())}`)}</p>
        ${rows.length === 0 ? `<p class="muted">${escapeHtml(rtl ? 'لا توجد مصروفات في هذا النطاق' : 'No expenses in this range')}</p>` : `
        <table>
          <thead><tr>
            <th>#</th><th>${escapeHtml(rtl ? 'التاريخ' : 'Date')}</th>
            <th>${escapeHtml(rtl ? 'التصنيف' : 'Category')}</th><th>${escapeHtml(rtl ? 'الوصف' : 'Description')}</th>
            <th>${escapeHtml(rtl ? 'الموظف' : 'Staff')}</th><th>${escapeHtml(rtl ? 'المبلغ' : 'Amount')}</th>
          </tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr>
              <td>${(page - 1) * PAGE_LIMIT + i + 1}</td>
              <td>${escapeHtml(formatDate(r.created_at))}</td>
              <td>${escapeHtml(r.category_name || '—')}</td>
              <td>${escapeHtml(r.description || '—')}</td>
              <td>${escapeHtml(r.staff_name || '—')}</td>
              <td>-${escapeHtml(money(r.amount))}</td>
            </tr>`).join('')}
          </tbody>
        </table>`}`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* §35ث — title/subtitle live in the top bar; the quick actions
          (مشترك/بيع/حصة) were removed by owner request — PDF + add remain. */}
      <div className="flex flex-wrap items-center gap-2">
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
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl px-4 py-2 shadow-sm transition min-h-[44px]"
            >
              <Plus size={16} />
              {rtl ? 'إضافة مصروف' : 'Add Expense'}
            </button>
          )}
        </div>

      {/* Four TIME-based cards (§44 spec — unlike payments these are not
          per-method): range total + count, today, month, average. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          icon={Wallet}
          label={rtl ? 'إجمالي الفترة' : 'Range total'}
          value={money(stats.range_sum ?? 0)}
          sub={`(${fmtNum(Number(stats.range_count ?? 0))} ${rtl ? 'عملية' : 'records'})`}
          accent="rose"
        />
        <StatCard icon={Banknote} label={rtl ? 'مصروفات اليوم' : "Today's expenses"} value={money(stats.today_sum ?? 0)} accent="amber" />
        <StatCard icon={HandCoins} label={rtl ? 'مصروفات الشهر' : "This month's expenses"} value={money(stats.month_sum ?? 0)} accent="sky" />
        <StatCard icon={Receipt} label={rtl ? 'متوسط المصروف' : 'Average expense'} value={money(stats.range_avg ?? 0)} accent="violet" />
      </div>

      {/* Filter bar — from / to + apply (page red). No method filter (§44). */}
      <Panel icon={Receipt} accent="cyan" title={rtl ? 'الفلاتر' : 'Filters'}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'من تاريخ' : 'From date'}</label>
            <input
              type="date"
              value={draftFrom}
              max={draftTo}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
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
              className="h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
            />
          </div>
          <button
            onClick={() => {
              setApplied({ from: draftFrom, to: draftTo });
              setPage(1);
            }}
            className="h-11 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition min-h-[44px]"
          >
            {rtl ? 'تطبيق' : 'Apply'}
          </button>
          <span className="text-xs text-gray-400 pb-1">{applied.from} ← {applied.to}</span>
        </div>
      </Panel>

      {/* The expenses log — newest first, count in the title, amounts
          displayed with a minus in red (money leaving the gym). */}
      <Panel icon={Receipt} accent="rose" title={`${rtl ? 'سجل المصروفات' : 'Expenses Log'} (${fmtNum(Number(pagination.total ?? 0))})`}>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            accent="gray"
            title={rtl ? 'لا توجد مصروفات في الفترة المحددة' : 'No expenses in the selected range'}
            description={rtl ? 'غيّر الفلاتر أو أضِف مصروفًا جديدًا.' : 'Change the filters, or add a new expense.'}
            actions={role === 'gym-admin' ? (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl px-4 py-2 shadow-sm transition min-h-[44px]"
              >
                <Plus size={16} />
                {rtl ? 'إضافة مصروف' : 'Add Expense'}
              </button>
            ) : undefined}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={rows}
              bare
              footer={
                totalPages > 1 ? (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPage((v) => Math.max(1, v - 1))}
                      disabled={page <= 1}
                      className="min-h-[44px] rounded-shell border border-hairline bg-card px-4 py-1.5 text-sm font-medium text-table-fg hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {rtl ? 'السابق' : 'Prev'}
                    </button>
                    <span className="text-xs text-table-head">
                      {rtl ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
                      disabled={page >= totalPages}
                      className="min-h-[44px] rounded-shell border border-hairline bg-card px-4 py-1.5 text-sm font-medium text-table-fg hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {rtl ? 'التالي' : 'Next'}
                    </button>
                  </div>
                ) : undefined
              }
            />
          </>
        )}
      </Panel>

      {/* §44 — centered «إضافة مصروف» modal (owner rule: centered popups). */}
      {showModal && (
        <AddExpenseModal
          rtl={rtl}
          categories={categories}
          currencyLabel={currencySymbol(gymProfile?.currency)}
          saving={createMutation.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      )}
    </div>
  );
}

// ── Add-expense modal (§44 spec: amount+جنيه suffix, today's date, one of
//    the nine categories, optional description + quick-add category chips) ──
// Exported for reuse: the cashbox screen opens THIS SAME modal (single source).
export function AddExpenseModal({
  rtl,
  categories,
  currencyLabel,
  saving,
  onClose,
  onSubmit,
}: {
  rtl: boolean;
  categories: { id: string; name: string }[];
  currencyLabel: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: { amount: number; description?: string; category_id?: string | null; date?: string }) => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDateStr(new Date()));
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const todayMax = localDateStr(new Date());

  const canSubmit = Number(amount) > 0;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      amount: Number(amount),
      description: description.trim() || undefined,
      category_id: categoryId || null,
      // only send when it is NOT today — today lets the server stamp
      // its own honest created_at (§44).
      date: date !== todayMax ? date : undefined,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      dir={rtl ? 'rtl' : 'ltr'}
      disableDismiss={saving}
      title={rtl ? 'إضافة مصروف' : 'Add Expense'}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
          >
            {rtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={!canSubmit || saving}
            className="min-h-[48px] px-5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold transition"
          >
            {saving ? (rtl ? 'جاري الحفظ…' : 'Saving…') : (rtl ? 'حفظ المصروف' : 'Save expense')}
          </button>
        </>
      }
    >
      <form
        onSubmit={submit}
        className="space-y-4"
      >
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'المبلغ' : 'Amount'} *</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full h-11 px-3 pe-14 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
              />
              {/* §44 — the currency unit sits inside the field itself. */}
              <span className="absolute inset-y-0 end-3 flex items-center text-sm font-semibold text-gray-400 pointer-events-none">
                {rtl ? currencyLabel : ''}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'التاريخ' : 'Date'}</label>
              <input
                type="date"
                value={date}
                max={todayMax}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'التصنيف' : 'Category'}</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
              >
                <option value="">{rtl ? 'بدون تصنيف' : 'No category'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'الوصف' : 'Description'}</label>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={rtl ? 'وصف المصروف...' : 'Expense description...'}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none resize-none"
            />
          </div>

          {/* §44 — quick-add row: the same live categories as one-tap chips
              (reception records an expense in ~3 seconds: tap, type, save). */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">{rtl ? 'إضافة سريعة' : 'Quick add'}</p>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition min-h-[36px] ${
                    categoryId === c.id ? 'bg-red-600 text-white border-red-600' : QUICK_ADD_ACCENT
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

      </form>
    </Modal>
  );
}
