import { useState } from 'react';
import { formatDate } from '../../utils/date';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listBillingPlans, listInvoices,
  createBillingPlan, updateBillingPlan, deleteBillingPlan,
  setPlanDiscount, togglePlanDiscount, deletePlanDiscount,
  listCoupons, createCoupon, updateCoupon, toggleCoupon, deleteCoupon,
  initiateFawryPayment,
  listAddons, createAddon, updateAddon, deleteAddon,
  listGymAddons, grantGymAddon, cancelGymAddon,
  listPlatformGyms,
  type BillingPlan, type BillingPlanInput, type BillingInvoice, type PlanModules,
  type BillingCoupon, type CouponInput, type CouponType, type CouponTier,
  type BillingAddon, type GymAddon, type PlatformGym,
} from '../../services/api';
import {
  FloppyDisk, Plus, MagnifyingGlass, CheckCircle, Calendar, Trash, ArrowSquareOut,
  Ticket, Bank, PuzzlePiece, PencilSimple, Tag, Flame, Archive, ArrowClockwise, Percent, Info,
} from '@phosphor-icons/react';
import PageLoader from '../../components/shared/PageLoader';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import Modal from '../../components/shared/Modal';

// §46 — محرك الفواتير: كتالوج الباقات قابل للتحرير بالكامل (إضافة/تعديل/حذف)،
// والخصم له طبقة مستقلة (تفعيل/تعديل/حذف)، والكوبونات على الصيغة القانونية
// 043 (type/value/starts_at/expires_at) لا أعمدة 022 الميتة.

const CURRENCY_SYMBOL = 'ج.م';
const VAT_RATE = 0.14;

/**
 * النماذج تعيش داخل Modal body وأزرار الحفظ في Modal footer، فتُربط الواجهة
 * بالمُزر via `id`. ثابت مشترك يمنع التنافر بين الطرفين.
 */
const COUPON_FORM_ID = 'billing-engine-coupon-form';
const PLAN_FORM_ID = 'billing-engine-plan-form';
const DISCOUNT_FORM_ID = 'billing-engine-plan-discount-form';
const ADDON_FORM_ID = 'billing-engine-addon-form';
const GRANT_FORM_ID = 'billing-engine-grant-form';

/** رسالة الخطأ الحقيقية من السيرفر إن وجدت، وإلا بديل محلي موصوف. */
function apiMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || fallback;
}

// ── shell vocabulary (كل لون من tokens.css) ─────────────────────
const PANEL_CLASS = 'overflow-hidden rounded-shell border border-hairline bg-card';
const FIELD_CLASS =
  'w-full rounded-shell border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-ink-faint focus:ring-2 focus:ring-ring disabled:bg-surface-container-low disabled:text-muted-foreground';
const LABEL_CLASS = 'mb-1.5 block text-xs font-semibold text-muted-foreground';
const HINT_CLASS = 'mt-1 text-xs text-ink-faint';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-shell bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 rounded-shell border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brass-soft disabled:opacity-50';
const BTN_DANGER =
  'inline-flex items-center justify-center gap-1.5 rounded-shell border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50';
const BTN_ICON =
  'inline-flex h-9 w-9 items-center justify-center rounded-shell border border-input text-muted-foreground transition-colors hover:border-brass-soft hover:text-foreground disabled:opacity-40';
const PILL = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold';

const STATUS_CLASS: Record<string, string> = {
  paid: 'bg-series-3/10 text-series-3',
  pending: 'bg-series-1/10 text-series-1',
  overdue: 'bg-series-6/10 text-series-6',
  cancelled: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  paid: { ar: 'مدفوعة', en: 'Paid' },
  pending: { ar: 'معلّقة', en: 'Pending' },
  overdue: { ar: 'متأخرة', en: 'Overdue' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
};

/**
 * مفاتيح `features.modules` التي تخرج فعليًا من `gym_effective_features()`
 * وتصل للصالات في حِزمة المصادقة — لذا كل مفتاح هنا يتحكم في شيء حقيقي.
 */
const MODULE_KEYS: Array<{ key: keyof PlanModules; ar: string; en: string }> = [
  { key: 'dashboard', ar: 'لوحة التحكم', en: 'Dashboard' },
  { key: 'attendance', ar: 'تسجيل الحضور', en: 'Attendance' },
  { key: 'products', ar: 'المنتجات ونقاط البيع', en: 'Products & POS' },
  { key: 'inventory', ar: 'المخزون', en: 'Inventory' },
  { key: 'class_booking', ar: 'حجز الكباتن', en: 'Class booking' },
  { key: 'training', ar: 'إدارة المدربين', en: 'Training' },
  { key: 'daily_reports', ar: 'التقرير اليومي', en: 'Daily reports' },
  { key: 'marketing', ar: 'التسويق والعروض', en: 'Marketing' },
  { key: 'whatsapp', ar: 'ربط واتساب', en: 'WhatsApp' },
  { key: 'white_label', ar: 'تخصيص باسم المنشأة', en: 'White-label' },
];

const TIER_OPTIONS: Array<{ value: CouponTier; ar: string; en: string }> = [
  { value: 'basic', ar: 'أساسية', en: 'Basic' },
  { value: 'premium', ar: 'متقدمة', en: 'Premium' },
  { value: 'enterprise', ar: 'شاملة', en: 'Enterprise' },
];

// أعمدة numeric في PostgreSQL تصل كنص — أي حساب عليها لازم يقطّر عبر Number.
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
/** لقطة حقل سعر في النموذج: فارغ = الحقل محذون فعلًا في قاعدة البيانات. */
const priceToField = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? '' : String(num(v));
const fieldToPrice = (s: string): number | null => (s.trim() === '' ? null : num(s));
const toLines = (s: string): string[] => s.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20);
const isoDay = (v: string | null | undefined): string => (v ? String(v).slice(0, 10) : '');

type Tab = 'plans' | 'addons' | 'invoices' | 'coupons' | 'payments';

interface PlanFormState {
  name: string; name_ar: string; badge: string; badge_ar: string;
  list_monthly: string; list_yearly: string;
  disc_monthly: string; disc_yearly: string;
  discount_active: boolean;
  max_staff: string; max_members: string; max_gyms: string;
  modules: PlanModules;
  highlights: string; highlights_en: string;
  is_active: boolean;
}

const EMPTY_PLAN_FORM: PlanFormState = {
  name: '', name_ar: '', badge: '', badge_ar: '',
  list_monthly: '', list_yearly: '', disc_monthly: '', disc_yearly: '',
  discount_active: false,
  max_staff: '5', max_members: '100', max_gyms: '1',
  modules: {},
  highlights: '', highlights_en: '',
  is_active: true,
};

interface DiscountFormState {
  list_monthly: string; list_yearly: string;
  disc_monthly: string; disc_yearly: string;
  active: boolean;
}

interface CouponFormState {
  code: string; description: string; type: CouponType; value: string;
  max_uses: string; min_order_amount: string; max_discount_amount: string;
  min_plan_tier: '' | CouponTier; starts_at: string; expires_at: string;
  is_active: boolean;
}

const EMPTY_COUPON_FORM: CouponFormState = {
  code: '', description: '', type: 'percentage', value: '10',
  max_uses: '', min_order_amount: '', max_discount_amount: '',
  min_plan_tier: '', starts_at: '', expires_at: '',
  is_active: true,
};

export default function BillingEngine() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = (en: string, ar: string) => isRtl ? ar : en;

  const [activeTab, setActiveTab] = useState<Tab>('plans');
  // القرار (2026-10-17): أرقام الكتالوج سنوية — فالعرض الافتراضي السنوي.
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // ── Queries ──────────────────────────────────────────
  const plansQuery = useApiQuery(
    ['billing-plans', showArchived ? 'with-archived' : 'live'],
    () => listBillingPlans({ includeArchived: showArchived }),
    { staleTime: 30_000 },
  );
  const invoicesQuery = useApiQuery(['billing-invoices'], () => listInvoices({ limit: 50 }), { staleTime: 15_000 });
  const couponsQuery = useApiQuery(['billing-coupons'], listCoupons, { staleTime: 15_000 });

  const plans: BillingPlan[] = plansQuery.data?.data ?? [];
  const invoices: BillingInvoice[] = invoicesQuery.data?.data ?? [];
  const coupons: BillingCoupon[] = couponsQuery.data?.data ?? [];

  const activePlans = plans.filter((p) => p.is_active);
  const archivedPlans = plans.filter((p) => !p.is_active);

  // ── §46 باقة: نموذج الإنشاء/التعديل ──────────────────
  const [planModal, setPlanModal] = useState<'new' | BillingPlan | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(EMPTY_PLAN_FORM);
  const [planError, setPlanError] = useState('');
  const patchPlanForm = (p: Partial<PlanFormState>) => setPlanForm((f) => ({ ...f, ...p }));

  // ── §46 خصم الباقة: نموذج السعرين ────────────────────
  const [discountModal, setDiscountModal] = useState<BillingPlan | null>(null);
  const [discountForm, setDiscountForm] = useState<DiscountFormState>({
    list_monthly: '', list_yearly: '', disc_monthly: '', disc_yearly: '', active: true,
  });
  const [discountError, setDiscountError] = useState('');

  // ── §46 كوبون: إنشاء/تعديل ───────────────────────────
  const [couponModal, setCouponModal] = useState<'new' | BillingCoupon | null>(null);
  const [couponForm, setCouponForm] = useState<CouponFormState>(EMPTY_COUPON_FORM);
  const [couponError, setCouponError] = useState('');
  const patchCouponForm = (p: Partial<CouponFormState>) => setCouponForm((f) => ({ ...f, ...p }));

  // ── Fawry payment modal state ────────────────────────
  const [showFawryModal, setShowFawryModal] = useState(false);
  const [fawryInvoice, setFawryInvoice] = useState<BillingInvoice | null>(null);
  const [fawryResult, setFawryResult] = useState<{ ref: string; url: string } | null>(null);

  // ── §36 add-ons state ────────────────────────────────
  const addonsQuery = useApiQuery(['billing-addons'], listAddons, { staleTime: 15_000 });
  const gymsQuery = useApiQuery(['platform-gyms', 'addons-brief'], listPlatformGyms, { staleTime: 60_000 });
  const [addonGymId, setAddonGymId] = useState('');
  const gymAddonsQuery = useApiQuery(
    ['gym-addons', addonGymId],
    () => listGymAddons(addonGymId),
    { enabled: !!addonGymId, staleTime: 10_000 },
  );
  const addons: BillingAddon[] = addonsQuery.data?.data ?? [];
  const allGyms: PlatformGym[] = gymsQuery.data?.data ?? [];
  const gymAddons: GymAddon[] = gymAddonsQuery.data?.data ?? [];

  const [addonModal, setAddonModal] = useState<'new' | BillingAddon | null>(null);
  const [acode, setAcode] = useState('');
  const [aname, setAname] = useState('');
  const [anameAr, setAnameAr] = useState('');
  const [akeys, setAkeys] = useState('');
  const [limitColumn, setLimitColumn] = useState('');
  const [limitAmount, setLimitAmount] = useState(0);
  const [aMonthly, setAMonthly] = useState(0);
  const [aYearly, setAYearly] = useState(0);
  const [addonError, setAddonError] = useState('');

  const [grantModal, setGrantModal] = useState(false);
  const [grantAddonId, setGrantAddonId] = useState('');
  const [grantCycle, setGrantCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [grantPrice, setGrantPrice] = useState<number | ''>('');
  const [grantExpires, setGrantExpires] = useState('');
  const [grantNotes, setGrantNotes] = useState('');
  const [grantError, setGrantError] = useState('');

  const asKeys = (v: BillingAddon['module_keys']): string[] => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(String(v)); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  const resetAddonForm = () => {
    setAcode(''); setAname(''); setAnameAr(''); setAkeys('');
    setLimitColumn(''); setLimitAmount(0); setAMonthly(0); setAYearly(0); setAddonError('');
  };

  const openEditAddon = (a: BillingAddon) => {
    setAcode(a.code); setAname(a.name); setAnameAr(a.name_ar);
    setAkeys(asKeys(a.module_keys).join(', '));
    setLimitColumn(a.limit_column || ''); setLimitAmount(a.limit_amount || 0);
    setAMonthly(Number(a.price_monthly)); setAYearly(Number(a.price_yearly)); setAddonError('');
    setAddonModal(a);
  };

  const addonPayload = () => ({
    code: acode.trim().toLowerCase().replace(/\s+/g, '_'),
    name: aname.trim(),
    name_ar: anameAr.trim(),
    module_keys: akeys.split(',').map((s) => s.trim()).filter(Boolean),
    limit_column: limitColumn || null,
    limit_amount: limitColumn ? limitAmount : null,
    price_monthly: aMonthly,
    price_yearly: aYearly,
  });

  const saveAddonMutation = useMutation({
    mutationFn: (editing: BillingAddon | 'new') => {
      const body = addonPayload();
      return editing === 'new' ? createAddon(body) : updateAddon(editing.id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-addons'] });
      showToast(t('Addon saved', 'تم حفظ الإضافة'), 'success');
      setAddonModal(null);
      resetAddonForm();
    },
    onError: (err: unknown) => setAddonError(apiMessage(err, t('Failed to save addon', 'فشل حفظ الإضافة'))),
  });

  const deleteAddonMutation = useMutation({
    mutationFn: (id: string) => deleteAddon(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['billing-addons'] });
      queryClient.invalidateQueries({ queryKey: ['gym-addons'] });
      showToast(res.data.soft_deleted
        ? t('Addon has live assignments — disabled instead of deleting', 'عليها إسنادات سارية: عُطّلت بدل الحذف')
        : t('Addon deleted', 'تم حذف الإضافة'), 'success');
    },
    onError: () => showToast(t('Failed to delete addon', 'فشل حذف الإضافة'), 'error'),
  });

  const toggleAddonMutation = useMutation({
    mutationFn: (a: BillingAddon) => updateAddon(a.id, { is_active: !a.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-addons'] });
      showToast(t('Addon updated', 'تم تحديث الإضافة'), 'success');
    },
    onError: () => showToast(t('Failed to update addon', 'فشل تحديث الإضافة'), 'error'),
  });

  const grantAddonMutation = useMutation({
    mutationFn: () => {
      if (!addonGymId || !grantAddonId) throw new Error('no selection');
      return grantGymAddon(addonGymId, {
        addon_id: grantAddonId,
        cycle: grantCycle,
        price_charged: grantPrice === '' ? undefined : Number(grantPrice),
        expires_at: grantExpires || null,
        notes: grantNotes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-addons', addonGymId] });
      queryClient.invalidateQueries({ queryKey: ['billing-addons'] });
      showToast(t('Addon granted to gym', 'تم إسناد الإضافة للصالة'), 'success');
      setGrantModal(false);
      setGrantAddonId(''); setGrantPrice(''); setGrantExpires(''); setGrantNotes(''); setGrantError('');
    },
    onError: (err: unknown) => setGrantError(apiMessage(err, t('Failed to grant addon', 'فشل إسناد الإضافة'))),
  });

  const cancelAddonMutation = useMutation({
    mutationFn: (assignmentId: string) => cancelGymAddon(addonGymId, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-addons', addonGymId] });
      queryClient.invalidateQueries({ queryKey: ['billing-addons'] });
      showToast(t('Assignment cancelled', 'تم إلغاء الإسناد'), 'success');
    },
    onError: () => showToast(t('Failed to cancel assignment', 'فشل إلغاء الإسناد'), 'error'),
  });

  // ── Mutations: الباقات (§46) ─────────────────────────
  /** أي تعديل على الكتالوج يمس شاشات الإبرام/الصالات أيضًا. */
  const invalidateCatalog = () => {
    queryClient.invalidateQueries({ queryKey: ['billing-plans'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'plans'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'contracts'] });
    queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] });
  };

  const savePlanMutation = useMutation({
    mutationFn: (editing: BillingPlan | 'new') => {
      const body = planPayload();
      return editing === 'new' ? createBillingPlan(body) : updateBillingPlan(editing.id, body);
    },
    onSuccess: () => {
      invalidateCatalog();
      showToast(t('Plan saved', 'تم حفظ الباقة'), 'success');
      setPlanModal(null);
    },
    onError: (err: unknown) => setPlanError(apiMessage(err, t('Failed to save plan', 'فشل حفظ الباقة'))),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (plan: BillingPlan) => deleteBillingPlan(plan.id),
    onSuccess: (res) => {
      invalidateCatalog();
      const d = res.data;
      showToast(
        d.deactivated
          ? (res.message || t('Plan has live contracts — deactivated instead of deleted', 'الباقة عليها عقود سارية: عُطّلت بدل الحذف'))
          : t('Plan deleted', 'تم حذف الباقة'),
        d.deactivated ? 'info' : 'success',
      );
    },
    onError: (err: unknown) => showToast(apiMessage(err, t('Failed to delete plan', 'فشل حذف الباقة')), 'error'),
  });

  const reactivatePlanMutation = useMutation({
    mutationFn: (plan: BillingPlan) => updateBillingPlan(plan.id, { is_active: true }),
    onSuccess: () => {
      invalidateCatalog();
      showToast(t('Plan re-activated', 'تم تنشيط الباقة'), 'success');
    },
    onError: (err: unknown) => showToast(apiMessage(err, t('Failed to activate plan', 'فشل تنشيط الباقة')), 'error'),
  });

  const saveDiscountMutation = useMutation({
    mutationFn: (plan: BillingPlan) => setPlanDiscount(plan.id, {
      list_price_monthly: fieldToPrice(discountForm.list_monthly),
      list_price_yearly: fieldToPrice(discountForm.list_yearly),
      discounted_price_monthly: fieldToPrice(discountForm.disc_monthly),
      discounted_price_yearly: fieldToPrice(discountForm.disc_yearly),
      active: discountForm.active,
    }),
    onSuccess: () => {
      invalidateCatalog();
      showToast(t('Discount saved', 'تم حفظ الخصم'), 'success');
      setDiscountModal(null);
    },
    onError: (err: unknown) => setDiscountError(apiMessage(err, t('Failed to save discount', 'فشل حفظ الخصم'))),
  });

  const toggleDiscountMutation = useMutation({
    mutationFn: (plan: BillingPlan) => togglePlanDiscount(plan.id),
    onSuccess: (res) => {
      invalidateCatalog();
      showToast(
        res.data.discount_active
          ? t('Discount activated — plans now charge the discounted price', 'فُعّل الخصم: السعر المحمّل بقى السعر المخفّض')
          : t('Discount paused — plans charge the full price again', 'عُطّل الخصم: السعر المحمّل رجع للسعر الكامل'),
        'success',
      );
    },
    onError: (err: unknown) => showToast(apiMessage(err, t('Failed to change discount state', 'فشل تغيير حالة الخصم')), 'error'),
  });

  const deleteDiscountMutation = useMutation({
    mutationFn: (plan: BillingPlan) => deletePlanDiscount(plan.id),
    onSuccess: () => {
      invalidateCatalog();
      showToast(t('Discount removed — plan is back to its full price', 'حُذف الخصم ورجعت الباقة لسعرها الكامل'), 'success');
    },
    onError: (err: unknown) => showToast(apiMessage(err, t('Failed to remove discount', 'فشل حذف الخصم')), 'error'),
  });

  // ── Mutations: الكوبونات ─────────────────────────────
  const saveCouponMutation = useMutation({
    mutationFn: (editing: BillingCoupon | 'new') => {
      const body = couponPayload();
      return editing === 'new' ? createCoupon(body) : updateCoupon(editing.id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-coupons'] });
      showToast(t('Coupon saved', 'تم حفظ الكوبون'), 'success');
      setCouponModal(null);
    },
    onError: (err: unknown) => setCouponError(apiMessage(err, t('Failed to save coupon', 'فشل حفظ الكوبون'))),
  });

  const toggleCouponMutation = useMutation({
    mutationFn: (coupon: BillingCoupon) => toggleCoupon(coupon.id, { active: !coupon.is_active }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['billing-coupons'] });
      showToast(
        res.data.is_active
          ? t('Coupon activated', `فُعّل الكوبون ${res.data.code}`)
          : t('Coupon deactivated', `عُطّل الكوبون ${res.data.code}`),
        'success',
      );
    },
    onError: (err: unknown) => showToast(apiMessage(err, t('Failed to change coupon state', 'فشل تغيير حالة الكوبون')), 'error'),
  });

  const deleteCouponMutation = useMutation({
    mutationFn: (coupon: BillingCoupon) => deleteCoupon(coupon.id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['billing-coupons'] });
      const d = res.data;
      showToast(
        d.deactivated
          ? (d.message || t('Coupon is used on invoices — deactivated instead of deleted', 'الكوبون مستخدم في فواتير: عُطّل بدل الحذف'))
          : (d.message || t('Coupon deleted', 'تم حذف الكوبون')),
        d.deactivated ? 'info' : 'success',
      );
    },
    onError: (err: unknown) => showToast(apiMessage(err, t('Failed to delete coupon', 'فشل حذف الكوبون')), 'error'),
  });

  const fawryMutation = useMutation({
    mutationFn: (payload: Parameters<typeof initiateFawryPayment>[0]) => initiateFawryPayment(payload),
    onSuccess: (res) => {
      setFawryResult({ ref: res.data.fawry_ref_number, url: res.data.payment_url });
      queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      showToast(t('Redirected to Fawry payment', 'تم تحويلك إلى بوابة الدفع فوري'), 'success');
    },
    onError: () => showToast(t('Failed to connect to Fawry', 'فشل الاتصال ببوابة فوري'), 'error'),
  });

  // ── Openers ──────────────────────────────────────────
  const openNewPlan = () => {
    setPlanForm(EMPTY_PLAN_FORM);
    setPlanError('');
    setPlanModal('new');
  };

  const openEditPlan = (p: BillingPlan) => {
    const mods = (p.features && !Array.isArray(p.features) ? p.features.modules : undefined) ?? {};
    setPlanForm({
      name: p.name ?? '',
      name_ar: p.name_ar ?? '',
      badge: p.badge ?? '',
      badge_ar: p.badge_ar ?? '',
      list_monthly: priceToField(p.list_price_monthly ?? p.price_monthly),
      list_yearly: priceToField(p.list_price_yearly ?? p.price_yearly),
      disc_monthly: priceToField(p.discounted_price_monthly),
      disc_yearly: priceToField(p.discounted_price_yearly),
      discount_active: Boolean(p.discount_active),
      max_staff: String(num(p.max_staff)),
      max_members: String(num(p.max_members)),
      max_gyms: String(num(p.max_gyms)),
      modules: { ...mods },
      highlights: (p.highlights ?? []).join('\n'),
      highlights_en: (p.highlights_en ?? []).join('\n'),
      is_active: p.is_active,
    });
    setPlanError('');
    setPlanModal(p);
  };

  const openDiscountModal = (p: BillingPlan) => {
    setDiscountForm({
      list_monthly: priceToField(p.list_price_monthly ?? p.price_monthly),
      list_yearly: priceToField(p.list_price_yearly ?? p.price_yearly),
      disc_monthly: priceToField(p.discounted_price_monthly),
      disc_yearly: priceToField(p.discounted_price_yearly),
      active: Boolean(p.discount_active),
    });
    setDiscountError('');
    setDiscountModal(p);
  };

  const openNewCoupon = () => {
    setCouponForm(EMPTY_COUPON_FORM);
    setCouponError('');
    setCouponModal('new');
  };

  const openEditCoupon = (c: BillingCoupon) => {
    setCouponForm({
      code: c.code ?? '',
      description: c.description ?? '',
      type: c.type === 'fixed_amount' ? 'fixed_amount' : 'percentage',
      value: priceToField(c.value),
      max_uses: c.max_uses === null || c.max_uses === undefined ? '' : String(num(c.max_uses)),
      min_order_amount: priceToField(c.min_order_amount),
      max_discount_amount: priceToField(c.max_discount_amount),
      min_plan_tier: (c.min_plan_tier ?? '') as '' | CouponTier,
      starts_at: isoDay(c.starts_at),
      expires_at: isoDay(c.expires_at),
      is_active: c.is_active,
    });
    setCouponError('');
    setCouponModal(c);
  };

  // ── Payload builders (كل حقول النموذج تُرسل: الفارغ = null = مسح) ──
  function planPayload(): BillingPlanInput {
    return {
      name: planForm.name.trim(),
      name_ar: planForm.name_ar.trim(),
      badge: planForm.badge.trim() || null,
      badge_ar: planForm.badge_ar.trim() || null,
      list_price_monthly: fieldToPrice(planForm.list_monthly),
      list_price_yearly: fieldToPrice(planForm.list_yearly),
      discounted_price_monthly: fieldToPrice(planForm.disc_monthly),
      discounted_price_yearly: fieldToPrice(planForm.disc_yearly),
      discount_active: planForm.discount_active,
      max_staff: num(planForm.max_staff),
      max_members: num(planForm.max_members),
      max_gyms: num(planForm.max_gyms),
      features: { modules: planForm.modules },
      highlights: toLines(planForm.highlights),
      highlights_en: toLines(planForm.highlights_en),
      is_active: planForm.is_active,
    };
  }

  /** نفس قواعد السيرفر قبل الإرسال: رسالة عربية بدل 400 صامتة. */
  function planProblem(): string | null {
    if (!planForm.name.trim() && !planForm.name_ar.trim()) {
      return t('The plan needs a name (Arabic or English)', 'الباقة لازم لها اسم (عربي أو إنجليزي)');
    }
    if (planModal === 'new' && !planForm.list_monthly.trim() && !planForm.list_yearly.trim()) {
      return t('A new plan needs at least a full price (monthly or yearly)', 'الباقة الجديدة لازم لها سعر كامل (شهري أو سنوي) على الأقل');
    }
    const limits: Array<[string, string]> = [
      [planForm.max_staff, t('staff limit', 'حد الموظفين')],
      [planForm.max_members, t('members limit', 'حد الأعضاء')],
      [planForm.max_gyms, t('branches limit', 'حد الفروع')],
    ];
    for (const [raw, label] of limits) {
      if (raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < -1) {
        return t(`${label} must be -1 (unlimited) or a positive number`, `${label}: -1 بلا حد أو رقم`);
      }
    }
    if (!planForm.discount_active) return null;
    if (!planForm.disc_monthly.trim() && !planForm.disc_yearly.trim()) {
      return t('An active discount needs an "now" price', 'الخصم المفعّل لازم يكون له «السعر الآن»');
    }
    const notLower = (list: string, disc: string) =>
      disc.trim() !== '' && list.trim() !== '' && num(disc) >= num(list);
    if (notLower(planForm.list_monthly, planForm.disc_monthly) || notLower(planForm.list_yearly, planForm.disc_yearly)) {
      return t('The discounted price must be below the full price', 'السعر بعد الخصم لازم يكون أقل من السعر قبل الخصم');
    }
    return null;
  }

  function couponPayload(): CouponInput {
    return {
      code: couponForm.code.trim().toUpperCase(),
      description: couponForm.description.trim() || null,
      type: couponForm.type,
      value: num(couponForm.value),
      max_uses: couponForm.max_uses.trim() === '' ? null : num(couponForm.max_uses),
      min_order_amount: couponForm.min_order_amount.trim() === '' ? null : num(couponForm.min_order_amount),
      max_discount_amount: couponForm.max_discount_amount.trim() === '' ? null : num(couponForm.max_discount_amount),
      min_plan_tier: couponForm.min_plan_tier || null,
      starts_at: couponForm.starts_at || null,
      expires_at: couponForm.expires_at || null,
      is_active: couponForm.is_active,
    };
  }

  function couponProblem(): string | null {
    if (couponForm.code.trim().length < 3) return t('Coupon code needs 3 characters or more', 'رمز الكوبون ٣ حروف على الأقل');
    const v = num(couponForm.value);
    if (couponForm.value.trim() === '' || v <= 0) return t('Discount value must be greater than zero', 'قيمة الخصم لازم تكون أكبر من صفر');
    if (couponForm.type === 'percentage' && v > 100) return t('Percentage must be between 0 and 100', 'النسبة بين ٠ و١٠٠');
    if (couponForm.starts_at && couponForm.expires_at && couponForm.expires_at <= couponForm.starts_at) {
      return t('The end date must be after the start date', 'تاريخ الانتهاء لازم يكون بعد البداية');
    }
    return null;
  }

  function discountProblem(): string | null {
    const anyPrice = [discountForm.list_monthly, discountForm.list_yearly, discountForm.disc_monthly, discountForm.disc_yearly]
      .some((s) => s.trim() !== '');
    if (!anyPrice) return t('Enter at least one price', 'أدخل سعرًا واحدًا على الأقل');
    if (discountForm.active && !discountForm.disc_monthly.trim() && !discountForm.disc_yearly.trim()) {
      return t('An active discount needs an "now" price', 'الخصم المفعّل لازم يكون له «السعر الآن»');
    }
    const notLower = (list: string, disc: string) =>
      disc.trim() !== '' && list.trim() !== '' && num(disc) >= num(list);
    if (notLower(discountForm.list_monthly, discountForm.disc_monthly) || notLower(discountForm.list_yearly, discountForm.disc_yearly)) {
      return t('The discounted price must be below the full price', 'السعر بعد الخصم لازم يكون أقل من السعر قبل الخصم');
    }
    return null;
  }

  const handleFawryPayment = (invoice: BillingInvoice) => {
    setFawryInvoice(invoice);
    setFawryResult(null);
    setShowFawryModal(true);
    if (invoice.gym_id) {
      fawryMutation.mutate({ gym_id: invoice.gym_id, amount: invoice.amount, invoice_id: invoice.id });
    }
  };

  // Postgres numeric columns arrive as strings — coerce before math, otherwise
  // `amount + vat` becomes string concatenation ("1500.00210.00000000000003").
  const formatCurrency = (amount: number | string) => {
    const n = Number(amount) || 0;
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SYMBOL}`;
  };

  const calcWithVAT = (amount: number | string) => {
    const base = Number(amount) || 0;
    const vat = base * VAT_RATE;
    return { subtotal: base, vat, total: base + vat };
  };

  /** "-1 = بلا حد" متعارف عليه في billing_plans/planGuard. */
  const limitLabel = (v: number | string) => (num(v) < 0 ? t('Unlimited', 'بلا حد') : num(v).toLocaleString('en-US'));

  const activeInvoices = invoices.filter((i) => !invoiceSearch || i.gym_name?.toLowerCase().includes(invoiceSearch.toLowerCase()));

  // ── Tab Definitions ──────────────────────────────────
  const tabs = [
    { key: 'plans' as Tab, labelAr: 'الباقات', labelEn: 'Plans', icon: 'credit-card' },
    { key: 'addons' as Tab, labelAr: 'الوحدات والإضافات', labelEn: 'Add-ons', icon: 'extension' },
    { key: 'invoices' as Tab, labelAr: 'الفواتير', labelEn: 'Invoices', icon: 'receipt' },
    { key: 'coupons' as Tab, labelAr: 'كوبونات الخصم', labelEn: 'Coupons', icon: 'ticket' },
    { key: 'payments' as Tab, labelAr: 'بوابة الدفع', labelEn: 'Payments', icon: 'bank' },
  ];

  // ── Render: Plans (§46 — كتالوج قابل للتحرير) ─────────
  const renderPlanCard = (plan: BillingPlan) => {
    const chargedKey = billingCycle === 'monthly' ? 'price_monthly' : 'price_yearly';
    const listKey = billingCycle === 'monthly' ? 'list_price_monthly' : 'list_price_yearly';
    const charged = num(plan[chargedKey]);
    const full = plan[listKey];
    const struck = Boolean(plan.discount_active) && full != null && num(full) > charged;
    const hasDiscountLayer = plan.discounted_price_monthly != null || plan.discounted_price_yearly != null;
    const highlights = (isRtl ? plan.highlights : (plan.highlights_en?.length ? plan.highlights_en : plan.highlights)) ?? [];
    const { subtotal, vat, total } = calcWithVAT(charged);
    const busy = toggleDiscountMutation.isPending && toggleDiscountMutation.variables?.id === plan.id;
    const mods = plan.features && !Array.isArray(plan.features) ? plan.features.modules : undefined;
    const enabledModules = MODULE_KEYS.filter((m) => mods?.[m.key]).map((m) => (isRtl ? m.ar : m.en));

    return (
      <article
        key={plan.id}
        className={`flex flex-col overflow-hidden rounded-shell border border-hairline bg-card ${plan.is_active ? '' : 'opacity-70'}`}
      >
        {plan.badge ? (
          <div className="border-b border-brass-soft bg-series-1/10 px-4 py-1.5 text-center text-xs font-bold text-series-1">
            {isRtl ? (plan.badge_ar || plan.badge) : (plan.badge || plan.badge_ar)}
          </div>
        ) : null}

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                {(isRtl ? plan.name_ar : plan.name) || plan.name}
              </h3>
              <p className="mt-0.5 font-mono text-xs text-ink-faint" dir="ltr">{plan.name}</p>
            </div>
            <span className={`${PILL} ${plan.is_active ? 'bg-series-3/10 text-series-3' : 'bg-muted text-muted-foreground'}`}>
              {plan.is_active ? t('Live', 'سارية') : t('Archived', 'مؤرشفة')}
            </span>
          </div>

          {/* سلّم السعر: كامل مشطوب ثم السعر المحمّل الآن */}
          <div>
            {struck ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t('Instead of', 'بدلاً من')}</span>
                <span dir="ltr" className="font-mono line-through">{formatCurrency(num(full))}</span>
              </div>
            ) : null}
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-foreground" dir="ltr">
                {formatCurrency(charged)}
              </span>
              <span className="text-sm text-muted-foreground">
                {billingCycle === 'monthly' ? t('/month', '/شهر') : t('/year', '/سنة')}
              </span>
            </div>
            {struck ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`${PILL} bg-primary/10 text-primary`}>
                  <Flame size={12} weight="fill" />
                  <span>{t('Now', 'الآن')}</span>
                </span>
                {plan.discount_percent ? (
                  <span className={`${PILL} border border-brass-soft text-brass`}>
                    <Percent size={11} />
                    {plan.discount_percent}%
                  </span>
                ) : null}
              </div>
            ) : null}
            {billingCycle === 'yearly' && num(plan.annual_discount_percent ?? 0) > 0 ? (
              <p className={HINT_CLASS}>
                {t(
                  `Yearly saves ${plan.annual_discount_percent}% over 12 monthly payments`,
                  `التحويل السنوي يوفّر ${plan.annual_discount_percent}% من ١٢ دفعة شهرية`,
                )}
              </p>
            ) : null}
          </div>

          {/* نقاط الظهور على الكارت — نص حقيقي من highlights */}
          <ul className="space-y-1.5">
            {highlights.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-series-3" />
                <span>{line}</span>
              </li>
            ))}
            {highlights.length === 0 ? (
              <li className="text-sm text-ink-faint">{t('No display bullets yet — add them in Edit', 'لا نقاط عرض بعد — أضفها من «تعديل»')}</li>
            ) : null}
          </ul>

          <dl className="grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
            {[
              [t('Staff', 'موظفون'), limitLabel(plan.max_staff)],
              [t('Members', 'أعضاء'), limitLabel(plan.max_members)],
              [t('Branches', 'فروع'), limitLabel(plan.max_gyms)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-ink-faint">{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-foreground" dir="ltr">{value}</dd>
              </div>
            ))}
          </dl>

          {enabledModules.length > 0 ? (
            <p className="text-xs leading-relaxed text-ink-faint">
              {t('Modules', 'الوحدات')}: {enabledModules.join(' · ')}
            </p>
          ) : null}
        </div>

        <div className="border-t border-hairline bg-surface-container-low px-5 py-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('Subtotal', 'المجموع')}: <span dir="ltr" className="font-mono">{formatCurrency(subtotal)}</span></span>
            <span>{t('VAT 14%', 'ضريبة ١٤٪')}: <span dir="ltr" className="font-mono">{formatCurrency(vat)}</span></span>
          </div>
          <div className="mt-1 flex justify-between text-sm font-bold text-foreground">
            <span>{t('Total', 'الإجمالي')}</span>
            <span dir="ltr" className="font-mono">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* الإجراءات: الباقة + طبقة الخصم كل واحدة بحركاتها */}
        <div className="space-y-2 border-t border-hairline px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openEditPlan(plan)} className={BTN_SECONDARY}>
              <PencilSimple size={15} />
              <span>{t('Edit', 'تعديل')}</span>
            </button>

            {!hasDiscountLayer ? (
              <button type="button" onClick={() => openDiscountModal(plan)} className={BTN_SECONDARY}>
                <Tag size={15} />
                <span>{t('Add discount', 'إضافة خصم')}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || deleteDiscountMutation.isPending || saveDiscountMutation.isPending}
                onClick={() => toggleDiscountMutation.mutate(plan)}
                className={`${BTN_SECONDARY} ${plan.discount_active ? 'border-primary/40 text-primary' : ''}`}
              >
                <span className={`inline-flex h-2 w-2 rounded-full ${plan.discount_active ? 'bg-primary' : 'bg-series-7'}`} />
                <span>{plan.discount_active ? t('Pause discount', 'إيقاف الخصم') : t('Activate discount', 'تفعيل الخصم')}</span>
              </button>
            )}

            {plan.is_active ? (
              <button
                type="button"
                title={t('Delete plan', 'حذف الباقة')}
                disabled={deletePlanMutation.isPending}
                onClick={() => {
                  const label = (isRtl ? plan.name_ar : plan.name) || plan.name;
                  if (window.confirm(t(`Delete plan "${label}"? Plans with live contracts are deactivated instead.`, `حذف الباقة «${label}»؟ الباقة عليها عقد سارٍ تُعطّل بدل الحذف.`))) {
                    deletePlanMutation.mutate(plan);
                  }
                }}
                className={`${BTN_ICON} ms-auto border-destructive/30 text-destructive hover:bg-destructive/10`}
              >
                <Trash size={16} />
              </button>
            ) : (
              <button
                type="button"
                disabled={reactivatePlanMutation.isPending}
                onClick={() => reactivatePlanMutation.mutate(plan)}
                className={`${BTN_SECONDARY} ms-auto`}
              >
                <ArrowClockwise size={15} />
                <span>{t('Re-activate', 'تنشيط')}</span>
              </button>
            )}
          </div>

          {hasDiscountLayer ? (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" onClick={() => openDiscountModal(plan)} className={`${BTN_SECONDARY} !px-2 !py-1 !text-xs`}>
                <FloppyDisk size={13} />
                <span>{t('Edit discount', 'تعديل الخصم')}</span>
              </button>
              <button
                type="button"
                disabled={deleteDiscountMutation.isPending}
                onClick={() => {
                  if (window.confirm(t('Delete this discount? The plan returns to its full price.', 'حذف هذا الخصم؟ الباقة ترجع لسعرها الكامل.'))) {
                    deleteDiscountMutation.mutate(plan);
                  }
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-destructive transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <Trash size={13} />
                <span>{t('Delete discount', 'حذف الخصم')}</span>
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  const renderPlans = () => (
    <div className="space-y-6">
      {/* شريط الأدوات: الدورة + archived + إضافة */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 rounded-shell border border-hairline bg-card px-4 py-2.5">
            <span className={`text-sm ${billingCycle === 'monthly' ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {t('Monthly', 'شهري')}
            </span>
            <Toggle checked={billingCycle === 'yearly'} onChange={(v) => setBillingCycle(v ? 'yearly' : 'monthly')} label="" />
            <span className={`text-sm ${billingCycle === 'yearly' ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {t('Yearly', 'سنوي')}
            </span>
          </div>

          {archivedPlans.length > 0 ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span>{t(`Show archived (${archivedPlans.length})`, `عرض المؤرشفة (${archivedPlans.length})`)}</span>
            </label>
          ) : null}
        </div>

        <button type="button" onClick={openNewPlan} className={BTN_PRIMARY}>
          <Plus size={16} />
          <span>{t('New plan', 'إضافة باقة')}</span>
        </button>
      </div>

      {plansQuery.isLoading ? (
        <PageLoader variant="skeleton" />
      ) : activePlans.length === 0 ? (
        <div className={`${PANEL_CLASS} p-8 text-center`}>
          <p className="text-sm text-muted-foreground">
            {t('No live plans in the catalog — create one to make it available for signing.',
               'لا باقات سارية في الكتالوج — أُنشئ واحدة حتى تظهر في إبرام العقود.')}
          </p>
          <button type="button" onClick={openNewPlan} className={`${BTN_PRIMARY} mt-4`}>
            <Plus size={16} />
            <span>{t('New plan', 'إضافة باقة')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {activePlans.map(renderPlanCard)}
        </div>
      )}

      {showArchived && archivedPlans.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <Archive size={16} />
            <span>{t('Archived plans — kept for their live contracts, cannot be signed', 'باقات مؤرشفة — محفوظة لعقودها السارية ولا تُبرَم عليها عقود جديدة')}</span>
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {archivedPlans.map(renderPlanCard)}
          </div>
        </section>
      ) : null}
    </div>
  );

  // ── Render: Invoices ──────────────────────────────────
  const renderInvoices = () => (
    <div className="space-y-4">
      <div className="flex max-w-sm items-center gap-3 rounded-shell border border-hairline bg-card px-4 py-2.5">
        <MagnifyingGlass size={18} className="text-ink-faint" />
        <input
          type="text"
          value={invoiceSearch}
          onChange={(e) => setInvoiceSearch(e.target.value)}
          placeholder={t('Search by gym name...', 'بحث باسم الصالة...')}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-ink-faint"
        />
      </div>

      <div className={PANEL_CLASS}>
        {invoicesQuery.isLoading ? (
          <PageLoader variant="skeleton" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-low text-table-head">
                  <th className="p-4 text-start text-xs font-semibold">{t('Gym', 'الصالة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Plan', 'الباقة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Amount', 'المبلغ')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('VAT', 'الضريبة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Status', 'الحالة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Period', 'الفترة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Actions', 'الإجراءات')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {activeInvoices.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{t('No invoices', 'لا توجد فواتير')}</td></tr>
                )}
                {activeInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-container-low">
                    <td className="p-4 font-medium">{inv.gym_name}</td>
                    <td className="p-4 text-muted-foreground">{inv.plan_name || '—'}</td>
                    <td className="p-4 font-mono" dir="ltr">{formatCurrency(inv.amount)}</td>
                    <td className="p-4 font-mono text-sm text-muted-foreground" dir="ltr">{formatCurrency(num(inv.amount) * VAT_RATE)}</td>
                    <td className="p-4">
                      <span className={`${PILL} ${STATUS_CLASS[inv.status] || STATUS_CLASS.pending}`}>
                        {STATUS_LABELS[inv.status]?.[isRtl ? 'ar' : 'en'] || inv.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1" dir="ltr">
                        <Calendar size={12} />
                        {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                      </div>
                    </td>
                    <td className="p-4">
                      {inv.status === 'pending' && (
                        <button
                          type="button"
                          disabled={fawryMutation.isPending}
                          onClick={() => handleFawryPayment(inv)}
                          className={BTN_SECONDARY}
                        >
                          {t('Pay via Fawry', 'دفع عبر فوري')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Coupons (§46 — قائمة وتحكم كامل) ──────────
  const couponDiscountText = (c: BillingCoupon) => {
    if (c.type === 'percentage') {
      const cap = c.max_discount_amount != null && num(c.max_discount_amount) > 0
        ? ` (${t('max', 'بحد أقصى')} ${formatCurrency(c.max_discount_amount)})`
        : '';
      return `${num(c.value)}%${cap}`;
    }
    return formatCurrency(c.value);
  };

  const renderCoupons = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('Total coupons', 'إجمالي الكوبونات')}: <span dir="ltr" className="font-mono">{coupons.length}</span>
        </p>
        <button type="button" onClick={openNewCoupon} className={BTN_PRIMARY}>
          <Plus size={16} />
          <span>{t('Add coupon', 'إضافة كوبون')}</span>
        </button>
      </div>

      <div className={PANEL_CLASS}>
        {couponsQuery.isLoading ? (
          <PageLoader variant="skeleton" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low text-table-head">
                  <th className="p-4 text-start text-xs font-semibold">{t('Code', 'الكود')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Description', 'الوصف')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Discount', 'الخصم')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Used', 'المستخدم')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Valid from', 'نافذة الصلاحية')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Status', 'الحالة')}</th>
                  <th className="p-4 text-end text-xs font-semibold">{t('Actions', 'الإجراءات')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {coupons.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{t('No coupons', 'لا توجد كوبونات')}</td></tr>
                )}
                {coupons.map((c) => (
                  <tr key={c.id} className={`hover:bg-surface-container-low ${c.is_active ? '' : 'opacity-60'}`}>
                    <td className="p-4">
                      <span className="rounded-shell bg-surface-container px-2 py-1 font-mono font-bold text-foreground" dir="ltr">{c.code}</span>
                    </td>
                    <td className="p-4 text-muted-foreground">{c.description || '—'}</td>
                    <td className="p-4 font-mono" dir="ltr">{couponDiscountText(c)}</td>
                    <td className="p-4 font-mono text-muted-foreground" dir="ltr">
                      {num(c.used_count)} / {c.max_uses == null ? t('∞', 'بلا حد') : num(c.max_uses)}
                    </td>
                    <td className="p-4 text-xs text-muted-foreground" dir="ltr">
                      {c.starts_at ? formatDate(c.starts_at) : '—'} → {c.expires_at ? formatDate(c.expires_at) : t('Open-ended', 'بلا نهاية')}
                    </td>
                    <td className="p-4">
                      <span className={`${PILL} ${c.is_active ? 'bg-series-3/10 text-series-3' : 'bg-muted text-muted-foreground'}`}>
                        {c.is_active ? t('Active', 'نشط') : t('Disabled', 'معطّل')}
                      </span>
                      {num(c.min_order_amount) > 0 ? (
                        <div className="mt-1 text-xs text-ink-faint">
                          {t('min', 'حد أدنى')} <span dir="ltr" className="font-mono">{formatCurrency(c.min_order_amount)}</span>
                        </div>
                      ) : null}
                      {c.min_plan_tier ? (
                        <div className="text-xs text-ink-faint">
                          {t('plan', 'الباقة')}: {TIER_OPTIONS.find((o) => o.value === c.min_plan_tier)?.[isRtl ? 'ar' : 'en'] ?? c.min_plan_tier}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" title={t('Edit', 'تعديل')} onClick={() => openEditCoupon(c)} className={BTN_ICON}>
                          <PencilSimple size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={toggleCouponMutation.isPending}
                          title={c.is_active ? t('Disable', 'تعطيل') : t('Enable', 'تفعيل')}
                          onClick={() => toggleCouponMutation.mutate(c)}
                          className={`${BTN_ICON} ${c.is_active ? 'text-series-3' : ''}`}
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('Delete', 'حذف')}
                          disabled={deleteCouponMutation.isPending}
                          onClick={() => {
                            if (window.confirm(t(`Delete coupon ${c.code}? Used coupons are deactivated instead.`, `حذف الكوبون ${c.code}؟ المستخدم منه يُعطّل بدل الحذف.`))) {
                              deleteCouponMutation.mutate(c);
                            }
                          }}
                          className={`${BTN_ICON} border-destructive/30 text-destructive hover:bg-destructive/10`}
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Payments (Fawry) ──────────────────────────
  const renderPayments = () => (
    <div className="space-y-6">
      <div className="rounded-shell border border-hairline bg-card p-5 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-shell bg-primary/10">
            <Bank size={22} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{t('Fawry Payment Gateway', 'بوابة الدفع الإلكتروني — فوري')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('Pay via Fawry — fastest payment method in Egypt', 'ادفع عبر فوري — أسرع وأسهل طريقة دفع في مصر')}
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-shell bg-surface-container-low p-4 text-sm">
          {[
            t('Accepts: mobile wallets, credit cards, Fawry Cash', 'مقبول: المحافظ الإلكترونية، بطاقات الائتمان، فوري كاش'),
            t('Transaction fee: 2.5% + 1.50 EGP', 'رسوم المعاملة: 2.5% + 1.50 ج.م (قابلة للتعديل)'),
            t('Settlement: within 24 business hours', 'التسوية: خلال 24 ساعة عمل'),
          ].map((line) => (
            <div key={line} className="flex items-start gap-2">
              <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-series-3" />
              <span className="text-muted-foreground">{line}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          {t('To start a payment, go to the Invoices tab and click "Pay via Fawry" next to the desired invoice.',
             'لبدء عملية دفع، اذهب إلى تبويب «الفواتير» واضغط «دفع عبر فوري» بجانب الفاتورة المطلوبة.')}
        </p>

        <p className="mt-4 flex items-start gap-2 rounded-shell border border-brass-soft bg-series-1/10 px-3 py-2 text-xs font-semibold text-series-1">
          <Info size={14} className="mt-0.5 shrink-0" weight="fill" />
          <span>
            {t('Integration status: the gateway runs in simulation on this build — `initiateFawryPayment` returns a reference without contacting Fawry, so no real amount is collected.',
               'حالة التكامل: البوابة شغّالة بالمحاكاة في هذا البناء — مرجع الدفع يتولد دون الاتصال بفوري، فلا يُحصَّل أي مبلغ فعلي.')}
          </span>
        </p>
      </div>
    </div>
  );

  // ── Fawry Payment Modal ──────────────────────────────
  const renderFawryModal = () => {
    if (!showFawryModal || !fawryInvoice) return null;
    return (
      <Modal
        open
        onClose={() => { if (!fawryMutation.isPending) { setShowFawryModal(false); setFawryResult(null); } }}
        size="md"
        disableDismiss={fawryMutation.isPending}
        title={
          <span className="flex items-center gap-2">
            <Bank size={20} className="text-primary" />
            <span>{t('Fawry Payment', 'الدفع عبر فوري')}</span>
          </span>
        }
        footer={
          fawryResult ? (
            <>
              <button type="button" onClick={() => { setShowFawryModal(false); setFawryResult(null); }} className={BTN_SECONDARY}>
                {t('Close', 'إغلاق')}
              </button>
              <a href={fawryResult.url} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
                <ArrowSquareOut size={16} />
                {t('Open Fawry', 'فتح بوابة فوري')}
              </a>
            </>
          ) : null
        }
      >
        {fawryMutation.isPending ? (
          <div className="flex flex-col items-center py-8">
            <PageLoader variant="skeleton" />
            <p className="mt-3 text-sm text-muted-foreground">{t('Connecting to Fawry...', 'جاري الاتصال ببوابة فوري...')}</p>
          </div>
        ) : fawryResult ? (
          <div className="py-2">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle size={22} weight="fill" className="text-series-3" />
              <p className="font-bold text-foreground">{t('Payment created', 'تم إنشاء عملية الدفع')}</p>
            </div>
            <dl className="space-y-2 rounded-shell border border-hairline bg-surface-container-low p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('Reference', 'رقم المرجع')}</dt>
                <dd className="font-mono font-bold text-foreground" dir="ltr">{fawryResult.ref}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('Amount', 'المبلغ')}</dt>
                <dd className="font-mono font-bold text-foreground" dir="ltr">{formatCurrency(fawryInvoice.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('Gym', 'الصالة')}</dt>
                <dd className="font-semibold text-foreground">{fawryInvoice.gym_name}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    );
  };

  // ── §46 Plan modal (وسطي) ────────────────────────────
  const renderPlanModal = () => {
    if (!planModal) return null;
    const isNew = planModal === 'new';
    const yearlyHint = planForm.list_yearly.trim() && planForm.list_monthly.trim()
      && num(planForm.list_yearly) !== num(planForm.list_monthly) * 10;
    return (
      <Modal
        open
        onClose={() => setPlanModal(null)}
        size="xl"
        className="max-w-3xl"
        disableDismiss={savePlanMutation.isPending}
        title={
          <span className="flex items-center gap-2">
            <Tag size={20} className="text-primary" />
            <span>{isNew ? t('New plan', 'إضافة باقة') : t('Edit plan', 'تعديل الباقة')}</span>
          </span>
        }
        description={t(
          'The charged price is always the live one: with a discount active it is the "now" price, otherwise the full price.',
          'السعر المحمّل هو دائمًا الظاهر في الإبرام: مع تفعيل الخصم بقى «الآن»، وبلا تفعيل بقى السعر الكامل.',
        )}
        footer={
          <>
            <button type="button" onClick={() => setPlanModal(null)} className={BTN_SECONDARY}>
              {t('Cancel', 'إلغاء')}
            </button>
            <button type="submit" form={PLAN_FORM_ID} disabled={savePlanMutation.isPending} className={BTN_PRIMARY}>
              {savePlanMutation.isPending ? t('Saving...', 'جارٍ الحفظ...') : t('Save plan', 'حفظ الباقة')}
            </button>
          </>
        }
      >
        <form
          id={PLAN_FORM_ID}
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = planProblem();
            if (problem) { setPlanError(problem); return; }
            setPlanError('');
            savePlanMutation.mutate(planModal);
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>{t('Arabic name', 'الاسم بالعربية')}</label>
              <input type="text" value={planForm.name_ar} onChange={(e) => patchPlanForm({ name_ar: e.target.value })}
                className={FIELD_CLASS} placeholder={t('Basic plan', 'الباقة الأساسية')} />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('English name', 'الاسم بالإنجليزية')}</label>
              <input type="text" value={planForm.name} onChange={(e) => patchPlanForm({ name: e.target.value })}
                className={FIELD_CLASS} placeholder="Basic" dir="ltr" disabled={!isNew} />
              {!isNew ? <p className={HINT_CLASS}>{t('Used by the tier mirror — changing it changes plan_tier mapping', 'مستخدم في مرآة التير — تغييره يغيّر ربط gym_plan_tier')}</p> : null}
            </div>
          </div>

          {/* ── الأسعار ── */}
          <fieldset className="space-y-3 rounded-shell border border-hairline p-4">
            <legend className="px-1 text-xs font-bold text-muted-foreground">{t('Pricing', 'التسعير')}</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS}>{t('Full price — monthly', 'السعر الكامل — شهري')}</label>
                <input type="number" min={0} step="0.01" value={planForm.list_monthly}
                  onChange={(e) => patchPlanForm({ list_monthly: e.target.value })}
                  className={FIELD_CLASS} dir="ltr" placeholder="0" />
              </div>
              <div>
                <label className={LABEL_CLASS}>{t('Full price — yearly', 'السعر الكامل — سنوي')}</label>
                <input type="number" min={0} step="0.01" value={planForm.list_yearly}
                  onChange={(e) => patchPlanForm({ list_yearly: e.target.value })}
                  className={FIELD_CLASS} dir="ltr" placeholder="0" />
                {yearlyHint ? (
                  <p className={HINT_CLASS}>
                    {t('House rule: yearly = monthly × 10 (two months free)', 'قاعدة البيت: السنوي = الشهري × ١٠ (شهرين مجانًا)')}
                  </p>
                ) : null}
              </div>
              <div>
                <label className={LABEL_CLASS}>{t('Discounted "now" — monthly', 'السعر الآن (بعد الخصم) — شهري')}</label>
                <input type="number" min={0} step="0.01" value={planForm.disc_monthly}
                  onChange={(e) => patchPlanForm({ disc_monthly: e.target.value })}
                  className={FIELD_CLASS} dir="ltr" placeholder={t('empty = no discount', 'فاضي = بلا خصم')} />
              </div>
              <div>
                <label className={LABEL_CLASS}>{t('Discounted "now" — yearly', 'السعر الآن (بعد الخصم) — سنوي')}</label>
                <input type="number" min={0} step="0.01" value={planForm.disc_yearly}
                  onChange={(e) => patchPlanForm({ disc_yearly: e.target.value })}
                  className={FIELD_CLASS} dir="ltr" placeholder={t('empty = no discount', 'فاضي = بلا خصم')} />
              </div>
            </div>
            <Toggle
              checked={planForm.discount_active}
              onChange={(v) => patchPlanForm({ discount_active: v })}
              label={t('Discount active (the plan charges the "now" price)', 'الخصم مفعّل (الباقة تُحمَّل بسعر «الآن»)')}
            />
          </fieldset>

          {/* ── الشريط والحدود ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>{t('Badge (Arabic)', 'شريط على الكارت (عربي)')}</label>
              <input type="text" value={planForm.badge_ar} onChange={(e) => patchPlanForm({ badge_ar: e.target.value })}
                className={FIELD_CLASS} placeholder="⭐ الأكثر طلباً ⭐" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Badge (English)', 'شريط على الكارت (إنجليزي)')}</label>
              <input type="text" value={planForm.badge} onChange={(e) => patchPlanForm({ badge: e.target.value })}
                className={FIELD_CLASS} placeholder="Most popular" dir="ltr" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {([
              ['max_staff', t('Staff', 'موظفون')],
              ['max_members', t('Members', 'أعضاء')],
              ['max_gyms', t('Branches', 'فروع')],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className={LABEL_CLASS}>{label}</label>
                <input type="number" min={-1} step="1" value={planForm[key]}
                  onChange={(e) => patchPlanForm({ [key]: e.target.value } as Partial<PlanFormState>)}
                  className={FIELD_CLASS} dir="ltr" />
                <p className={HINT_CLASS}>{t('-1 = unlimited', '-1 = بلا حد')}</p>
              </div>
            ))}
          </div>

          {/* ── الوحدات ── */}
          <fieldset className="rounded-shell border border-hairline p-4">
            <legend className="px-1 text-xs font-bold text-muted-foreground">
              {t('Modules (read by planGuard / gym_effective_features)', 'الوحدات (يقرأها planGuard عبر gym_effective_features)')}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODULE_KEYS.map((m) => {
                const on = Boolean(planForm.modules[m.key]);
                return (
                  <label key={m.key} className={`flex cursor-pointer items-center gap-2 rounded-shell border px-2.5 py-2 text-xs transition-colors ${on ? 'border-primary/40 bg-primary/5 text-foreground' : 'border-input text-muted-foreground hover:border-brass-soft'}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => patchPlanForm({ modules: { ...planForm.modules, [m.key]: !on } })}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{isRtl ? m.ar : m.en}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* ── نقاط الظهور ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>{t('Bullets on the card (Arabic, one per line)', 'نقاط الكارت (عربي، سطر لكل ميزة)')}</label>
              <textarea rows={5} value={planForm.highlights} onChange={(e) => patchPlanForm({ highlights: e.target.value })}
                className={FIELD_CLASS} dir="rtl" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Bullets (English, one per line)', 'نقاط الكارت (إنجليزي، سطر لكل ميزة)')}</label>
              <textarea rows={5} value={planForm.highlights_en} onChange={(e) => patchPlanForm({ highlights_en: e.target.value })}
                className={FIELD_CLASS} dir="ltr" />
            </div>
          </div>

          <Toggle
            checked={planForm.is_active}
            onChange={(v) => patchPlanForm({ is_active: v })}
            label={t('Active — available for signing new contracts', 'نشطة — متاحة لإبرام عقود جديدة')}
          />

          {planError ? <p className="rounded-shell bg-destructive/10 px-3 py-2 text-sm text-destructive">{planError}</p> : null}
        </form>
      </Modal>
    );
  };

  // ── §46 Discount modal ───────────────────────────────
  const renderDiscountModal = () => {
    if (!discountModal) return null;
    const label = (isRtl ? discountModal.name_ar : discountModal.name) || discountModal.name;
    return (
      <Modal
        open
        onClose={() => setDiscountModal(null)}
        size="md"
        disableDismiss={saveDiscountMutation.isPending}
        title={
          <span className="flex items-center gap-2">
            <Tag size={20} className="text-primary" />
            <span>{t('Discount', 'الخصم')} — {label}</span>
          </span>
        }
        description={t(
          'The full price appears struck through; the "now" price is what gets charged when the discount is active.',
          'السعر الكامل يظهر مشطوبًا، و«الآن» هو المحمَّل وقت تفعيل الخصم.',
        )}
        footer={
          <>
            <button type="button" onClick={() => setDiscountModal(null)} className={BTN_SECONDARY}>
              {t('Cancel', 'إلغاء')}
            </button>
            <button type="submit" form={DISCOUNT_FORM_ID} disabled={saveDiscountMutation.isPending} className={BTN_PRIMARY}>
              {saveDiscountMutation.isPending ? t('Saving...', 'جارٍ الحفظ...') : t('Save discount', 'حفظ الخصم')}
            </button>
          </>
        }
      >
        <form
          id={DISCOUNT_FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = discountProblem();
            if (problem) { setDiscountError(problem); return; }
            setDiscountError('');
            saveDiscountMutation.mutate(discountModal);
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t('Before discount — monthly', 'بدلاً من — شهري')}</label>
              <input type="number" min={0} step="0.01" value={discountForm.list_monthly}
                onChange={(e) => setDiscountForm((f) => ({ ...f, list_monthly: e.target.value }))}
                className={FIELD_CLASS} dir="ltr" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Before discount — yearly', 'بدلاً من — سنوي')}</label>
              <input type="number" min={0} step="0.01" value={discountForm.list_yearly}
                onChange={(e) => setDiscountForm((f) => ({ ...f, list_yearly: e.target.value }))}
                className={FIELD_CLASS} dir="ltr" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Now — monthly', 'الآن — شهري')}</label>
              <input type="number" min={0} step="0.01" value={discountForm.disc_monthly}
                onChange={(e) => setDiscountForm((f) => ({ ...f, disc_monthly: e.target.value }))}
                className={FIELD_CLASS} dir="ltr" placeholder={t('empty = none', 'فاضي = بلا خصم')} />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Now — yearly', 'الآن — سنوي')}</label>
              <input type="number" min={0} step="0.01" value={discountForm.disc_yearly}
                onChange={(e) => setDiscountForm((f) => ({ ...f, disc_yearly: e.target.value }))}
                className={FIELD_CLASS} dir="ltr" placeholder={t('empty = none', 'فاضي = بلا خصم')} />
            </div>
          </div>
          <Toggle
            checked={discountForm.active}
            onChange={(v) => setDiscountForm((f) => ({ ...f, active: v }))}
            label={t('Activate this discount now', 'تفعيل الخصم الآن')}
          />
          {discountError ? <p className="rounded-shell bg-destructive/10 px-3 py-2 text-sm text-destructive">{discountError}</p> : null}
        </form>
      </Modal>
    );
  };

  // ── §46 Coupon modal (إنشاء/تعديل، وسطي) ─────────────
  const renderCouponModal = () => {
    if (!couponModal) return null;
    const isNew = couponModal === 'new';
    return (
      <Modal
        open
        onClose={() => setCouponModal(null)}
        size="lg"
        disableDismiss={saveCouponMutation.isPending}
        title={
          <span className="flex items-center gap-2">
            <Ticket size={20} className="text-primary" />
            <span>{isNew ? t('Add discount coupon', 'إضافة كوبون خصم') : t('Edit coupon', 'تعديل الكوبون')}</span>
          </span>
        }
        description={t(
          'Coupons discount an order/invoice at checkout; the plan ladder discount is separate.',
          'الكوبون يخصم على الفاتورة/الطلب؛ خصم الباقة (قبل/بعد) طبقة منفصلة.',
        )}
        footer={
          <>
            <button type="button" onClick={() => setCouponModal(null)} className={BTN_SECONDARY}>
              {t('Cancel', 'إلغاء')}
            </button>
            <button type="submit" form={COUPON_FORM_ID} disabled={saveCouponMutation.isPending} className={BTN_PRIMARY}>
              <FloppyDisk size={16} />
              {saveCouponMutation.isPending ? t('Saving...', 'جارٍ الحفظ...') : t('Save coupon', 'حفظ الكوبون')}
            </button>
          </>
        }
      >
        <form
          id={COUPON_FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = couponProblem();
            if (problem) { setCouponError(problem); return; }
            setCouponError('');
            saveCouponMutation.mutate(couponModal);
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>{t('Coupon code', 'رمز الكوبون')}</label>
              <input type="text" value={couponForm.code}
                onChange={(e) => patchCouponForm({ code: e.target.value.toUpperCase() })}
                className={`${FIELD_CLASS} font-mono`} dir="ltr" placeholder="SAVE20" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Description', 'الوصف')}</label>
              <input type="text" value={couponForm.description}
                onChange={(e) => patchCouponForm({ description: e.target.value })}
                className={FIELD_CLASS} placeholder={t('20% off the Advanced plan', 'خصم ٢٠٪ على الباقة المتقدمة')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>{t('Discount type', 'نوع الخصم')}</label>
              <select value={couponForm.type}
                onChange={(e) => patchCouponForm({ type: e.target.value as CouponType })}
                className={FIELD_CLASS}>
                <option value="percentage">{t('Percentage', 'نسبة مئوية')}</option>
                <option value="fixed_amount">{t('Fixed amount', 'قيمة ثابتة')}</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Value', 'القيمة')}</label>
              <input type="number" min={0} step="0.01" value={couponForm.value}
                onChange={(e) => patchCouponForm({ value: e.target.value })}
                className={FIELD_CLASS} dir="ltr" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Max uses', 'أقصى استخدام')}</label>
              <input type="number" min={1} step="1" value={couponForm.max_uses}
                onChange={(e) => patchCouponForm({ max_uses: e.target.value })}
                className={FIELD_CLASS} dir="ltr" placeholder={t('empty = unlimited', 'فاضي = بلا حد')} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>{t('Minimum order amount', 'الحد الأدنى للطلب')}</label>
              <input type="number" min={0} step="0.01" value={couponForm.min_order_amount}
                onChange={(e) => patchCouponForm({ min_order_amount: e.target.value })}
                className={FIELD_CLASS} dir="ltr" placeholder="0" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Maximum discount amount', 'الحد الأقصى للخصم')}</label>
              <input type="number" min={0} step="0.01" value={couponForm.max_discount_amount}
                onChange={(e) => patchCouponForm({ max_discount_amount: e.target.value })}
                className={FIELD_CLASS} dir="ltr"
                disabled={couponForm.type !== 'percentage'}
                placeholder={couponForm.type === 'percentage' ? t('empty = uncapped', 'فاضي = بلا سقف') : t('percentage only', 'للنسبة فقط')} />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Minimum plan', 'الحد الأدنى للباقة')}</label>
              <select value={couponForm.min_plan_tier}
                onChange={(e) => patchCouponForm({ min_plan_tier: e.target.value as '' | CouponTier })}
                className={FIELD_CLASS}>
                <option value="">{t('All plans', 'جميع الباقات')}</option>
                {TIER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{isRtl ? o.ar : o.en}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>{t('Valid from', 'صالح من')}</label>
              <input type="date" value={couponForm.starts_at}
                onChange={(e) => patchCouponForm({ starts_at: e.target.value })}
                className={FIELD_CLASS} dir="ltr" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Valid until', 'صالح حتى')}</label>
              <input type="date" value={couponForm.expires_at}
                onChange={(e) => patchCouponForm({ expires_at: e.target.value })}
                className={FIELD_CLASS} dir="ltr" />
            </div>
          </div>

          <Toggle
            checked={couponForm.is_active}
            onChange={(v) => patchCouponForm({ is_active: v })}
            label={t('Active', 'نشط')}
          />

          {couponError ? <p className="rounded-shell bg-destructive/10 px-3 py-2 text-sm text-destructive">{couponError}</p> : null}
        </form>
      </Modal>
    );
  };

  // ── Render: §36 Add-ons ──────────────────────────────
  const renderAddons = () => (
    <div className="space-y-6">
      <div className={PANEL_CLASS}>
        <div className="flex items-center justify-between border-b border-hairline p-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('Add-ons Catalog', 'كتالوج الإضافات')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('Units sold on top of plans (store, reports, seats…)', 'وحدات تُباع فوق الباقة: متجر/تقارير/مقاعد…')}</p>
          </div>
          <button onClick={() => { resetAddonForm(); setAddonModal('new'); }} className={BTN_PRIMARY}>
            <Plus size={16} /> {t('New add-on', 'إضافة جديدة')}
          </button>
        </div>
        {addonsQuery.isLoading ? (
          <div className="p-8 text-center text-ink-faint">{t('Loading…', 'جارٍ التحميل…')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low text-table-head">
                  <th className="p-4 text-start text-xs font-semibold">{t('Addon', 'الإضافة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Unlocks', 'تُفعّل')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Monthly', 'شهري')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Yearly', 'سنوي')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Live gyms', 'صالات سارية')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Status', 'الحالة')}</th>
                  <th className="p-4 text-end text-xs font-semibold">{t('Actions', 'إجراءات')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {addons.map((a) => (
                  <tr key={a.id} className={a.is_active ? '' : 'opacity-50'}>
                    <td className="p-4">
                      <div className="font-semibold text-foreground">{isRtl ? a.name_ar : a.name}</div>
                      <div className="font-mono text-xs text-ink-faint" dir="ltr">{a.code}</div>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {asKeys(a.module_keys).length > 0
                        ? asKeys(a.module_keys).join(', ')
                        : a.limit_column
                          ? `+${a.limit_amount} ${a.limit_column === 'max_members' ? t('members', 'عضو') : t('staff', 'موظف')}`
                          : '—'}
                    </td>
                    <td className="p-4 font-mono" dir="ltr">{formatCurrency(a.price_monthly)}</td>
                    <td className="p-4 font-mono" dir="ltr">{num(a.price_yearly) > 0 ? formatCurrency(a.price_yearly) : '—'}</td>
                    <td className="p-4 font-mono text-muted-foreground" dir="ltr">{a.live_assignments ?? 0}</td>
                    <td className="p-4">
                      <span className={`${PILL} ${a.is_active ? 'bg-series-3/10 text-series-3' : 'bg-muted text-muted-foreground'}`}>
                        {a.is_active ? t('Active', 'مفعّلة') : t('Disabled', 'معطّلة')}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => toggleAddonMutation.mutate(a)} title={a.is_active ? t('Disable', 'تعطيل') : t('Enable', 'تفعيل')}
                          className={`${BTN_ICON} ${a.is_active ? 'text-series-3' : ''}`}>
                          <CheckCircle size={16} />
                        </button>
                        <button onClick={() => openEditAddon(a)} title={t('Edit', 'تعديل')} className={BTN_ICON}>
                          <PencilSimple size={16} />
                        </button>
                        <button onClick={() => { if (window.confirm(t('Delete this addon?', 'حذف هذه الإضافة؟'))) deleteAddonMutation.mutate(a.id); }}
                          title={t('Delete', 'حذف')}
                          className={`${BTN_ICON} border-destructive/30 text-destructive hover:bg-destructive/10`}>
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={PANEL_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('Gym Assignments', 'إسنادات الصالات')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('Grant an addon to a gym with an optional discounted price', 'أسنِد إضافة لصالة بسعر مخفّض اختياري')}</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={addonGymId} onChange={(e) => setAddonGymId(e.target.value)}
              className={`${FIELD_CLASS} w-auto min-w-52`}>
              <option value="">{t('Choose a gym…', 'اختر صالة…')}</option>
              {allGyms.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.plan_tier}</option>)}
            </select>
            <button onClick={() => { setGrantError(''); setGrantModal(true); }} disabled={!addonGymId} className={BTN_PRIMARY}>
              <Plus size={16} /> {t('Grant add-on', 'إسناد إضافة')}
            </button>
          </div>
        </div>
        {!addonGymId ? (
          <div className="p-8 text-center text-ink-faint">{t('Pick a gym to view its addons', 'اختر صالة لعرض إضافاتها')}</div>
        ) : gymAddonsQuery.isLoading ? (
          <div className="p-8 text-center text-ink-faint">{t('Loading…', 'جارٍ التحميل…')}</div>
        ) : gymAddons.length === 0 ? (
          <div className="p-8 text-center text-ink-faint">{t('No addons granted to this gym yet', 'لا إضافات مُسنَدة لهذه الصالة بعد')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low text-table-head">
                  <th className="p-4 text-start text-xs font-semibold">{t('Addon', 'الإضافة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Price', 'السعر')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Cycle', 'الدورة')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Expires', 'الانتهاء')}</th>
                  <th className="p-4 text-start text-xs font-semibold">{t('Status', 'الحالة')}</th>
                  <th className="p-4 text-end text-xs font-semibold">{t('Actions', 'إجراءات')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {gymAddons.map((ga) => {
                  const expired = ga.expires_at && new Date(ga.expires_at) < new Date();
                  const catalog = addons.find((a) => a.id === ga.addon_id);
                  const listPrice = catalog ? Number(ga.cycle === 'yearly' ? catalog.price_yearly : catalog.price_monthly) : 0;
                  const discounted = listPrice > 0 && Number(ga.price_charged) < listPrice;
                  return (
                    <tr key={ga.id} className={ga.status === 'cancelled' ? 'opacity-50' : ''}>
                      <td className="p-4">
                        <div className="font-semibold text-foreground">{isRtl ? ga.name_ar : ga.name}</div>
                        <div className="font-mono text-xs text-ink-faint" dir="ltr">{ga.code}</div>
                      </td>
                      <td className="p-4 font-mono" dir="ltr">
                        {formatCurrency(ga.price_charged)}
                        {discounted && <span className={`${PILL} ms-2 border border-brass-soft text-brass`}>{t('discounted', 'مخفّض')}</span>}
                      </td>
                      <td className="p-4 text-muted-foreground">{ga.cycle === 'yearly' ? t('Yearly', 'سنوي') : t('Monthly', 'شهري')}</td>
                      <td className="p-4 text-muted-foreground"><span dir="ltr">{ga.expires_at ? formatDate(ga.expires_at) : t('Open-ended', 'بلا نهاية')}</span></td>
                      <td className="p-4">
                        {ga.status === 'cancelled'
                          ? <span className={`${PILL} bg-muted text-muted-foreground`}>{t('Cancelled', 'ملغاة')}</span>
                          : expired
                            ? <span className={`${PILL} bg-series-6/10 text-series-6`}>{t('Expired', 'منتهية')}</span>
                            : <span className={`${PILL} bg-series-3/10 text-series-3`}>{t('Active', 'سارية')}</span>}
                      </td>
                      <td className="p-4 text-end">
                        {ga.status === 'active' && (
                          <button onClick={() => { if (window.confirm(t('Cancel this assignment? The gym loses the unit immediately.', 'إلغاء هذا الإسناد؟ ستفقد الصالة الوحدة فورًا.'))) cancelAddonMutation.mutate(ga.id); }}
                            className={BTN_DANGER}>
                            {t('Cancel', 'إلغاء')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Addon catalog modal (وسطي) ───────────────
  const renderAddonModal = () => {
    if (!addonModal) return null;
    return (
      <Modal
        open
        onClose={() => setAddonModal(null)}
        size="md"
        disableDismiss={saveAddonMutation.isPending}
        title={
          <span className="flex items-center gap-2">
            <PuzzlePiece size={20} className="text-primary" />
            <span>{addonModal === 'new' ? t('New add-on', 'إضافة جديدة') : t('Edit add-on', 'تعديل الإضافة')}</span>
          </span>
        }
        footer={
          <>
            <button type="button" onClick={() => setAddonModal(null)} className={BTN_SECONDARY}>{t('Cancel', 'إلغاء')}</button>
            <button type="submit" form={ADDON_FORM_ID} disabled={saveAddonMutation.isPending} className={BTN_PRIMARY}>
              <FloppyDisk size={16} />
              {t('Save', 'حفظ')}
            </button>
          </>
        }
      >
        <form
          id={ADDON_FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!acode.trim() || !anameAr.trim()) {
              setAddonError(t('Code and Arabic name are required', 'الرمز والاسم العربي مطلوبان'));
              return;
            }
            setAddonError('');
            saveAddonMutation.mutate(addonModal);
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t('Code', 'الرمز')}</label>
              <input type="text" value={acode} onChange={(e) => setAcode(e.target.value)} disabled={addonModal !== 'new'}
                className={FIELD_CLASS} placeholder="store" dir="ltr" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('English name', 'الاسم بالإنجليزية')}</label>
              <input type="text" value={aname} onChange={(e) => setAname(e.target.value)} className={FIELD_CLASS} dir="ltr" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t('Arabic name', 'الاسم بالعربية')}</label>
            <input type="text" value={anameAr} onChange={(e) => setAnameAr(e.target.value)}
              className={FIELD_CLASS} placeholder={t('Store (POS & Inventory)', 'المتجر (نقاط بيع ومخزون)')} />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t('Module keys (comma separated)', 'مفاتيح الوحدات (بفاصلة)')}</label>
            <input type="text" value={akeys} onChange={(e) => setAkeys(e.target.value)}
              className={`${FIELD_CLASS} font-mono`} placeholder="products, inventory" dir="ltr" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t('Raises limit', 'ترفع حدًا')}</label>
              <select value={limitColumn} onChange={(e) => setLimitColumn(e.target.value)} className={FIELD_CLASS}>
                <option value="">{t('None', 'بدون')}</option>
                <option value="max_members">{t('Members', 'أعضاء')}</option>
                <option value="max_staff">{t('Staff', 'موظفون')}</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Amount', 'المقدار')}</label>
              <input type="number" min={0} value={limitAmount} onChange={(e) => setLimitAmount(parseInt(e.target.value) || 0)}
                disabled={!limitColumn} className={FIELD_CLASS} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t('Monthly price', 'السعر الشهري')}</label>
              <input type="number" min={0} step="0.01" value={aMonthly} onChange={(e) => setAMonthly(parseFloat(e.target.value) || 0)}
                className={FIELD_CLASS} dir="ltr" />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Yearly price', 'السعر السنوي')}</label>
              <input type="number" min={0} step="0.01" value={aYearly} onChange={(e) => setAYearly(parseFloat(e.target.value) || 0)}
                className={FIELD_CLASS} dir="ltr" />
            </div>
          </div>

          {addonError ? <p className="rounded-shell bg-destructive/10 px-3 py-2 text-sm text-destructive">{addonError}</p> : null}
        </form>
      </Modal>
    );
  };

  // ── Render: Grant modal (وسطي) ───────────────────────
  const renderGrantModal = () => {
    if (!grantModal) return null;
    const catalog = addons.filter((a) => a.is_active);
    const chosen = addons.find((a) => a.id === grantAddonId);
    const suggested = chosen ? Number(grantCycle === 'yearly' ? chosen.price_yearly : chosen.price_monthly) || Number(chosen.price) || 0 : 0;
    return (
      <Modal
        open
        onClose={() => setGrantModal(false)}
        size="md"
        disableDismiss={grantAddonMutation.isPending}
        title={
          <span className="flex items-center gap-2">
            <PuzzlePiece size={20} className="text-primary" />
            <span>{t('Grant add-on', 'إسناد إضافة')}</span>
          </span>
        }
        footer={
          <>
            <button type="button" onClick={() => setGrantModal(false)} className={BTN_SECONDARY}>{t('Cancel', 'إلغاء')}</button>
            <button type="submit" form={GRANT_FORM_ID} disabled={grantAddonMutation.isPending} className={BTN_PRIMARY}>
              <CheckCircle size={16} />
              {t('Grant', 'إسناد')}
            </button>
          </>
        }
      >
        <form
          id={GRANT_FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!grantAddonId) {
              setGrantError(t('Choose an addon', 'اختر الإضافة'));
              return;
            }
            setGrantError('');
            grantAddonMutation.mutate();
          }}
        >
          <div>
            <label className={LABEL_CLASS}>{t('Gym', 'الصالة')}</label>
            <div className="rounded-shell border border-hairline bg-surface-container-low px-3 py-2.5 text-sm font-semibold text-foreground">
              {allGyms.find((g) => g.id === addonGymId)?.name || '—'}
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t('Addon', 'الإضافة')}</label>
            <select value={grantAddonId} onChange={(e) => { setGrantAddonId(e.target.value); setGrantPrice(''); }} className={FIELD_CLASS}>
              <option value="">{t('Choose…', 'اختر…')}</option>
              {catalog.map((a) => <option key={a.id} value={a.id}>{isRtl ? a.name_ar : a.name} — {formatCurrency(a.price_monthly)}/{t('mo', 'شهر')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>{t('Cycle', 'الدورة')}</label>
              <select value={grantCycle} onChange={(e) => { setGrantCycle(e.target.value as 'monthly' | 'yearly'); setGrantPrice(''); }} className={FIELD_CLASS}>
                <option value="monthly">{t('Monthly', 'شهري')}</option>
                <option value="yearly">{t('Yearly', 'سنوي')}</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>
                {t('Price for this gym', 'السعر لهذه الصالة')}
                {suggested > 0 && <span className="font-normal text-ink-faint"> ({t('catalog', 'الكتالوج')}: {formatCurrency(suggested)})</span>}
              </label>
              <input type="number" min={0} step="0.01" placeholder={String(suggested || '')}
                value={grantPrice === '' ? '' : grantPrice} onChange={(e) => setGrantPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className={FIELD_CLASS} dir="ltr" />
            </div>
          </div>
          {grantPrice !== '' && suggested > 0 && Number(grantPrice) < suggested && (
            <p className="rounded-shell border border-brass-soft bg-series-1/10 px-3 py-2 text-xs font-semibold text-series-1">
              {t('Discounted below catalog price', 'سعر مخفّض تحت سعر الكتالوج')} ({formatCurrency(suggested - Number(grantPrice))} {t('off', 'خصم')})
            </p>
          )}
          <div>
            <label className={LABEL_CLASS}>{t('Expires (optional)', 'تاريخ الانتهاء (اختياري)')}</label>
            <input type="date" value={grantExpires} onChange={(e) => setGrantExpires(e.target.value)} className={FIELD_CLASS} dir="ltr" />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t('Notes', 'ملاحظة')}</label>
            <input type="text" value={grantNotes} onChange={(e) => setGrantNotes(e.target.value)}
              className={FIELD_CLASS} placeholder={t('Deal with the owner', 'اتفاق مع صاحب الصالة')} />
          </div>

          {grantError ? <p className="rounded-shell bg-destructive/10 px-3 py-2 text-sm text-destructive">{grantError}</p> : null}
        </form>
      </Modal>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('Billing Engine', 'محرك الفواتير')}
        subtitle={t('Catalog, plan discounts, coupons, invoices and payments', 'الكتالوج وخصومات الباقات والكوبونات والفواتير والمدفوعات')}
        icon="credit-card"
      />

      <UnifiedTabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
        variant="pills"
        className="mb-6"
      />

      {activeTab === 'plans' && renderPlans()}
      {activeTab === 'addons' && renderAddons()}
      {activeTab === 'invoices' && renderInvoices()}
      {activeTab === 'coupons' && renderCoupons()}
      {activeTab === 'payments' && renderPayments()}

      {renderPlanModal()}
      {renderDiscountModal()}
      {renderCouponModal()}
      {renderFawryModal()}
      {renderAddonModal()}
      {renderGrantModal()}
    </div>
  );
}

/**
 * مفتاح تبديل من ألوان الـshell. المقبض يتحرك في اتجاه النص: `ltr:translate-x`
 * و`rtl:-translate-x` — ماديًا نفس المسافة في الاتجاهين (خطأ الكود القديم أنه
 * كان يترجم لليمين دائمًا فيصفّر عند `start` في RTL).
 */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`relative block h-6 w-11 shrink-0 rounded-full border transition-colors after:absolute after:inset-y-1 after:start-1 after:h-4 after:w-4 after:rounded-full after:bg-card after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-checked:border-primary peer-checked:bg-primary peer-checked:after:ltr:translate-x-5 peer-checked:after:rtl:-translate-x-5 ${checked ? 'border-primary bg-primary' : 'border-input bg-surface-container-high'}`}
      />
      {label ? <span className="text-sm text-foreground">{label}</span> : null}
    </label>
  );
}
