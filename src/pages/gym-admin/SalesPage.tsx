import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSales,
  createSale,
  listProducts,
  listMembers,
  getFinanceSummary,
  type ProductData,
  type MemberResponse,
} from '../../services/api';
import StatsGrid from '../../components/shared/StatsGrid';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';

interface SaleRow {
  id: string; member_name?: string; staff_name?: string;
  total_amount: number; payment_method: string; created_at: string;
}
/**
 * §46 POS touch grid — the cart is a `{ product_id: quantity }` map, so a tile
 * tap is the ONLY way a line enters the invoice. The old model kept an array of
 * blank `<select>` rows (`items`), which meant an empty row could be submitted
 * away but never filled by touch, and every row re-listed all products.
 */
interface CartLine {
  product: ProductData; quantity: number;
}

// §34ج — 'Settings' tab removed: nothing behind it but a "قيد التطوير" card.
const POS_TABS = ['Create Sale', 'Sales', 'Products', 'Report'] as const;
type PosTab = typeof POS_TABS[number];
const TAB_LABEL: Record<PosTab, { en: string; ar: string }> = {
  'Create Sale': { en: 'Create Sale', ar: 'إنشاء فاتورة' },
  'Sales': { en: 'Sales', ar: 'المبيعات' },
  'Products': { en: 'Products', ar: 'المنتجات' },
  'Report': { en: 'Report', ar: 'التقارير' },
};
const TAB_ICONS: Record<PosTab, string> = {
  'Create Sale': 'add_shopping_cart',
  'Sales': 'point_of_sale',
  'Products': 'inventory',
  'Report': 'bar_chart',
};

const paymentMethods = [
  { value: 'cash', labelAr: 'نقدي', labelEn: 'Cash' },
  { value: 'card', labelAr: 'بطاقة', labelEn: 'Card' },
  { value: 'wallet', labelAr: 'محفظة', labelEn: 'Wallet' },
];

/**
 * POS shell classes (Chalk & Brass, `src/components/dashboard/tokens.ts`).
 * A POS terminal is a touch surface, so every control here keeps a ≥48px target
 * at ALL breakpoints — that is the §46 brief. Text density still follows the
 * §34و rule (16px on mobile, 14px on desktop). No literal colour is used: the
 * only old-palette control left on this tab is the shared `<Button>` itself,
 * which the deferred shell codemod retints for every screen at once.
 */
const posFieldClass =
  'w-full min-h-[48px] rounded-shell border border-input bg-card px-4 py-2.5 text-base text-foreground placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-ring md:text-sm';
const posTileClass =
  'flex min-h-[52px] flex-col justify-between gap-1.5 rounded-shell border border-hairline bg-card px-3 py-2.5 text-start transition-colors duration-150 hover:border-brass-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:opacity-40 disabled:hover:border-hairline';
const posStepperClass =
  'grid min-h-[48px] min-w-[48px] place-items-center rounded-shell border border-hairline bg-card text-foreground transition-colors duration-150 hover:border-brass-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';

export default function SalesPage() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  // §35أ — honour any valid ?tab= on first mount (same pattern as the hubs pages).
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = POS_TABS.find(
    (t) => t.toLowerCase().replace(/\s+/g, '') === (searchParams.get('tab') ?? '').toLowerCase().replace(/[\s_-]/g, '')
  );
  const [activeTab, setActiveTab] = useState<PosTab>(initialTab ?? 'Create Sale');
  const [page, setPage] = useState(1);

  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cart, setCart] = useState<Record<string, number>>({});

  const { data: salesRes, isLoading } = useApiQuery<{ data: SaleRow[]; pagination: any }>(['sales', String(page)], () => listSales(page));
  const { data: summaryRes } = useApiQuery<any>(['finance-summary'], () => getFinanceSummary());
  const { data: productsRes } = useQuery({ queryKey: ['products-all'], queryFn: () => listProducts(), enabled: activeTab === 'Create Sale' || activeTab === 'Products' });
  const { data: membersRes } = useQuery({ queryKey: ['members-search', memberSearch], queryFn: () => listMembers({ search: memberSearch || undefined, limit: 10 }), enabled: activeTab === 'Create Sale' });

  const createMutation = useMutation({
    mutationFn: (data: { member_id?: string | null; items: { product_id: string; quantity: number }[]; payment_method?: string }) => createSale(data),
    onSuccess: () => {
      showToast(rtl ? 'تم إنشاء الفاتورة' : 'Invoice created', 'success');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: () => showToast(rtl ? 'فشل إنشاء الفاتورة' : 'Failed to create invoice', 'error'),
  });

  const resetForm = () => { setSelectedMemberId(''); setMemberSearch(''); setPaymentMethod('cash'); setCart({}); };
  const addProductToCart = (product: ProductData) =>
    setCart((c) => ({ ...c, [product.id]: (c[product.id] ?? 0) + 1 }));
  const decreaseProduct = (product: ProductData) =>
    setCart((c) => {
      const next = { ...c };
      const qty = (next[product.id] ?? 0) - 1;
      if (qty > 0) next[product.id] = qty; else delete next[product.id];
      return next;
    });
  const removeProduct = (productId: string) =>
    setCart((c) => {
      const next = { ...c };
      delete next[productId];
      return next;
    });

  const handleSubmit = () => {
    if (cartLines.length === 0) { showToast(rtl ? 'أضف منتجاً واحداً على الأقل' : 'Add at least one product', 'warning'); return; }
    createMutation.mutate({
      member_id: selectedMemberId || null,
      items: cartLines.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
      payment_method: paymentMethod,
    });
  };

  const sales = salesRes?.data || [];
  const pagination = salesRes?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.total / 20) : 1;
  // §34ث — monthly_sales used to be an order COUNT rendered as money; the server
  // now ships the real POS sum and the count separately.
  const monthlySalesSum = Number(summaryRes?.data?.monthly_sales_sum ?? 0);
  const monthlySalesCount = summaryRes?.data?.monthly_sales_count ?? 0;
  const monthlyExpenses = Number(summaryRes?.data?.monthly_expenses ?? 0);
  const products = productsRes?.data || [];

  // Cart lines are derived from the product list (the server order is kept, so a
  // tap never re-sorts the invoice), and prices always come from `ProductData` —
  // never from a row the cashier typed.
  const cartLines: CartLine[] = products
    .filter((p: ProductData) => (cart[p.id] ?? 0) > 0)
    .map((p: ProductData) => ({ product: p, quantity: cart[p.id] }));
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = cartLines.reduce((sum, line) => sum + line.quantity * line.product.selling_price, 0);

  // No `sortable` on any column: /api/finance/sales takes page/limit only, so a
  // header control here would re-order the twenty rows already loaded and pass
  // them off as the whole ledger sorted. It stays a plain, token-coloured table
  // until the endpoint gains an ORDER BY the client can ask for.
  const saleColumns: TableColumn<SaleRow>[] = [
    {
      id: '__n',
      label: rtl ? 'م' : '#',
      width: '3.5rem',
      numeric: true,
      cell: (_s, i) => (page - 1) * 20 + i + 1,
    },
    {
      id: 'member_name',
      key: 'member_name',
      label: rtl ? 'العضو' : 'Member',
      cell: (s) => <span className="font-medium text-foreground">{s.member_name || '—'}</span>,
    },
    { id: 'staff_name', key: 'staff_name', label: rtl ? 'الموظف' : 'Staff' },
    {
      id: 'total_amount',
      label: rtl ? 'الإجمالي' : 'Total',
      numeric: true,
      value: (s) => s.total_amount,
      cell: (s) => <span className="font-bold text-primary">{money(s.total_amount)}</span>,
    },
    {
      id: 'payment_method',
      label: rtl ? 'الدفع' : 'Payment',
      cell: (s) => {
        const pm = paymentMethods.find((x) => x.value === s.payment_method);
        return <StatusBadge status={pm ? (rtl ? pm.labelAr : pm.labelEn) : s.payment_method} variant="neutral" />;
      },
    },
    {
      id: 'created_at',
      label: rtl ? 'التاريخ' : 'Date',
      cell: (s) => <span dir="ltr" className="text-xs">{formatDate(s.created_at)}</span>,
    },
  ];

  const renderCreateSale = () => (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="space-y-3">
        <div>
          <label htmlFor="pos-member-search" className="mb-1.5 block text-sm font-medium text-muted-foreground">
            {rtl ? 'بحث عن عضو' : 'Search Member'}
          </label>
          <input id="pos-member-search" type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
            placeholder={rtl ? 'اسم العضو أو رقم الجوال...' : 'Member name or phone...'}
            className={posFieldClass} />
        </div>
        {membersRes?.members && membersRes.members.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-shell border border-hairline">
            {membersRes.members.map((m: MemberResponse) => (
              <button key={m.id} type="button" onClick={() => { setSelectedMemberId(m.id); setMemberSearch(m.full_name); }}
                aria-pressed={selectedMemberId === m.id}
                className={`flex min-h-[48px] w-full items-center justify-between gap-2 px-4 text-start transition-colors duration-150 hover:bg-accent/40 ${selectedMemberId === m.id ? 'bg-primary/10' : ''}`}>
                <span className="truncate text-base text-foreground md:text-sm">{m.full_name}</span>
                <span dir="ltr" className="shrink-0 text-sm tabular-nums text-muted-foreground">{m.phone_number}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-foreground">{rtl ? 'المنتجات' : 'Products'}</h3>
          {products.length > 0 && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {products.length} {rtl ? 'منتج' : 'products'}
            </span>
          )}
        </div>
        {products.length === 0 ? (
          <div className="rounded-shell border border-dashed border-hairline px-4 py-10 text-center">
            <span className="material-symbols-outlined mb-2 block text-3xl text-ink-faint">inventory</span>
            <p className="text-sm text-muted-foreground">
              {rtl ? 'لا توجد منتجات في الصالة بعد' : 'No products in this gym yet'}
            </p>
            <button type="button" onClick={() => navigate('/admin/products')}
              className="mt-3 min-h-[48px] rounded-shell border border-input bg-card px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-brass-soft">
              {rtl ? 'إضافة منتج' : 'Add a product'}
            </button>
          </div>
        ) : (
          <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pl-1 sm:grid-cols-3">
            {products.map((p: ProductData) => {
              const qty = cart[p.id] ?? 0;
              return (
                <button key={p.id} type="button" onClick={() => addProductToCart(p)}
                  aria-label={`${p.name} — ${money(p.selling_price)}`}
                  className={`${posTileClass} ${qty > 0 ? 'border-brass-soft' : ''}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-base font-semibold leading-snug text-foreground md:text-sm">{p.name}</span>
                    {qty > 0 && (
                      <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">
                        {qty}
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold tabular-nums text-foreground md:text-sm">{money(p.selling_price)}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{rtl ? 'مخزون' : 'Stock'} {p.stock_quantity}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-foreground">{rtl ? 'الفاتورة' : 'Invoice'}</h3>
          <span className="text-sm tabular-nums text-muted-foreground">
            {cartCount} {rtl ? 'قطعة' : 'items'}
          </span>
        </div>

        {cartLines.length === 0 ? (
          <p className="rounded-shell border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted-foreground">
            {rtl ? 'اضغط على منتج من الشبكة لإضافته' : 'Tap a product in the grid to add it'}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {cartLines.map((line) => (
              <li key={line.product.id} className="flex min-h-[56px] items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-foreground md:text-sm">{line.product.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {money(line.product.selling_price)} × {line.quantity}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => decreaseProduct(line.product)}
                    aria-label={rtl ? 'تقليل الكمية' : 'Decrease quantity'} className={posStepperClass}>
                    <span className="material-symbols-outlined text-lg">remove</span>
                  </button>
                  <span className="w-9 text-center text-base font-bold tabular-nums text-foreground md:text-sm">{line.quantity}</span>
                  <button type="button" onClick={() => addProductToCart(line.product)}
                    aria-label={rtl ? 'زيادة الكمية' : 'Increase quantity'} className={posStepperClass}>
                    <span className="material-symbols-outlined text-lg">add</span>
                  </button>
                </div>
                <span className="w-24 shrink-0 text-end text-base font-bold tabular-nums text-foreground md:text-sm">
                  {money(line.quantity * line.product.selling_price)}
                </span>
                <button type="button" onClick={() => removeProduct(line.product.id)}
                  aria-label={rtl ? 'حذف من الفاتورة' : 'Remove from invoice'} className={posStepperClass}>
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between rounded-shell border border-hairline bg-surface-container-low px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{rtl ? 'الإجمالي' : 'Total'}</span>
          <span className="text-xl font-bold tabular-nums text-primary">{money(totalAmount)}</span>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted-foreground">{rtl ? 'طريقة الدفع' : 'Payment Method'}</span>
          <div className="flex gap-2" role="group" aria-label={rtl ? 'طريقة الدفع' : 'Payment method'}>
            {paymentMethods.map((pm) => (
              <button key={pm.value} type="button" onClick={() => setPaymentMethod(pm.value)}
                aria-pressed={paymentMethod === pm.value}
                className={`min-h-[48px] flex-1 rounded-shell border px-3 text-base font-semibold transition-colors duration-150 md:text-sm ${
                  paymentMethod === pm.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-muted-foreground hover:border-brass-soft hover:text-foreground'
                }`}>
                {rtl ? pm.labelAr : pm.labelEn}
              </button>
            ))}
          </div>
        </div>

        <Button variant="primary" fullWidth className="min-h-[52px]" onClick={handleSubmit} disabled={createMutation.isPending}>
          {createMutation.isPending
            ? <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            : <span className="material-symbols-outlined text-lg">receipt_long</span>}
          {createMutation.isPending ? (rtl ? 'جاري الحفظ...' : 'Saving...') : (rtl ? 'إتمام البيع' : 'COMPLETE SALE')}
        </Button>
      </Card>
    </div>
  );

  const renderSalesList = () => (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{rtl ? 'إجمالي مبيعات الشهر' : 'Monthly Sales'}: <span className="font-bold text-emerald-600 text-lg">{money(monthlySalesSum)}</span>{monthlySalesCount > 0 && <span className="text-xs text-gray-400"> · {monthlySalesCount} {rtl ? 'فاتورة' : 'invoices'}</span>}</p>
      </div>
      {isLoading ? <PageLoader variant="skeleton" rows={5} /> : (
        <DataTable
          columns={saleColumns}
          data={sales}
          empty={rtl ? 'لا توجد مبيعات' : 'No sales found'}
          footer={
            totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-table-head">
                  {rtl ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                    {rtl ? 'السابق' : 'Previous'}
                  </Button>
                  <Button variant="outline" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                    {rtl ? 'التالي' : 'Next'}
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        />
      )}
    </>
  );

  const renderProducts = () => (
    <Card>
      <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'المنتجات' : 'Products'}</h3>
      {products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((p: ProductData) => (
            <div key={p.id} className="border border-gray-100 rounded-2xl p-4 hover:shadow-sm transition bg-gray-50">
              <p className="text-sm font-semibold text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500 mt-1">{rtl ? 'المخزون' : 'Stock'}: {p.stock_quantity}</p>
              <p className="text-sm font-bold text-emerald-600 mt-2">{money(p.selling_price)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500/60">
          <span className="material-symbols-outlined text-4xl block mb-2">inventory</span>
          <p className="text-sm">{rtl ? 'لا توجد منتجات' : 'No products'}</p>
        </div>
      )}
    </Card>
  );

  const renderReport = () => (
    <StatsGrid
      columns={3}
      stats={[
        // §34ث — all three figures share the same monthly window and come from
        // server aggregates (no client-side reduce, no count-minus-money math).
        { key: 'sales', label: rtl ? 'مبيعات الشهر' : 'Monthly Sales', value: money(monthlySalesSum), icon: 'point_of_sale', color: 'primary' },
        { key: 'expenses', label: rtl ? 'مصروفات الشهر' : 'Monthly Expenses', value: money(monthlyExpenses), icon: 'receipt_long', color: 'error' },
        { key: 'profit', label: rtl ? 'الفرق (مبيعات − مصروفات)' : 'Sales − Expenses', value: money(monthlySalesSum - monthlyExpenses), icon: 'payments', color: 'info' },
      ]}
    />
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      {/* §35ث — heading moved to the top bar */}

      <UnifiedTabs
        tabs={POS_TABS.map((tab) => ({
          key: tab,
          labelAr: TAB_LABEL[tab].ar,
          labelEn: TAB_LABEL[tab].en,
          icon: TAB_ICONS[tab],
        }))}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as PosTab)}
      />

      {activeTab === 'Create Sale' && renderCreateSale()}
      {activeTab === 'Sales' && renderSalesList()}
      {activeTab === 'Products' && renderProducts()}
      {activeTab === 'Report' && renderReport()}
    </div>
  );
}
