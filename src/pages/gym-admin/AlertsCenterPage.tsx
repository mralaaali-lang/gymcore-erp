import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getAlertsCenter, getSettings } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import Panel from '../../components/dashboard/Panel';
import PageLoader from '../../components/shared/PageLoader';
import { Banknote, CalendarClock, Clock, Package, Plus } from 'lucide-react';

// ====================================================================
// مركز الإنذار المبكر (/admin/notifications) — view تجميعية read-only.
// بلا إضافة/تعديل هنا: كل الجداول معروضة من صفحاتها (الديون + المخزون)
// مع أكشن واحد لكل صف، والكروت الأربعة هي نفسها الروابط (الضغط على
// الكارت ينزّل لجدوله). الأرقام كلها من GET /api/notifications/center،
// والعتبات من الإعدادات لا من الكود:
//   - انتهاء اليوم/قريبًا: alert_expiring_days (افتراضي 7)
//   - مستحقات: status='active' أي متبقي > 0
//   - مخزون: stock_quantity <= min_stock (يساوي الحد = منخفض)
// والعدد الكلي counts.total هو نفس مصدر شارة السايدبار.
// ====================================================================

type SectionKey = 'today' | 'soon' | 'unpaid' | 'stock';

export default function AlertsCenterPage() {
  const { language, gymProfile } = useApp();
  const rtl = language === 'ar';
  const navigate = useNavigate();
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const [active, setActive] = useState<SectionKey>('today');
  const refs = {
    today: useRef<HTMLDivElement>(null),
    soon: useRef<HTMLDivElement>(null),
    unpaid: useRef<HTMLDivElement>(null),
    stock: useRef<HTMLDivElement>(null),
  };

  const { data: res, isLoading, isError } = useApiQuery(
    ['alerts', 'center'],
    getAlertsCenter,
    { staleTime: 60_000 },
  );
  const center = res?.data;
  const counts = center?.counts ?? { today: 0, soon: 0, unpaid: 0, low_stock: 0, total: 0 };

  // مفاتيح تبويب الإشعارات: القسم المطفأ يُخفى هنا (والسيرفر يصفّره أصلًا)
  const { data: settingsRes } = useApiQuery(['settings'], getSettings, { staleTime: 5 * 60_000 });
  const showExpiring = (settingsRes?.data?.notify_expiring ?? 'true') === 'true';
  const showStock = (settingsRes?.data?.notify_low_stock ?? 'true') === 'true';

  const scrollTo = (key: SectionKey) => {
    setActive(key);
    refs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cards: {
    key: SectionKey;
    label: string;
    count: number;
    icon: typeof Banknote;
    bar: string;
    soft: string;
    solid: string;
    hidden?: boolean;
  }[] = [
    {
      key: 'today' as SectionKey,
      label: rtl ? 'ينتهي اليوم' : 'Expiring today',
      count: counts.today,
      icon: CalendarClock,
      bar: '#ef4444',
      soft: 'bg-red-50',
      solid: 'text-red-500',
      hidden: !showExpiring,
    },
    {
      key: 'soon' as SectionKey,
      label: rtl ? 'ينتهي قريباً' : 'Expiring soon',
      count: counts.soon,
      icon: Clock,
      bar: '#f59e0b',
      soft: 'bg-amber-50',
      solid: 'text-amber-600',
      hidden: !showExpiring,
    },
    {
      key: 'unpaid' as SectionKey,
      label: rtl ? 'مستحقات' : 'Unpaid dues',
      count: counts.unpaid,
      icon: Banknote,
      bar: '#f43f5e',
      soft: 'bg-rose-50',
      solid: 'text-rose-600',
    },
    {
      key: 'stock' as SectionKey,
      label: rtl ? 'مخزون منخفض' : 'Low stock',
      count: counts.low_stock,
      icon: Package,
      bar: '#f59e0b',
      soft: 'bg-amber-50',
      solid: 'text-amber-600',
      hidden: !showStock,
    },
  ].filter((c) => !c.hidden);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* الكروت الأربعة — كل كارت رابط لجدوله */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c) => {
          const Icon = c.icon;
          const isActive = active === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => scrollTo(c.key)}
              style={{ borderInlineStart: `4px solid ${isActive ? '#10b981' : c.bar}` }}
              className={`bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 text-start hover:shadow-md transition-all active:scale-[0.98] cursor-pointer min-h-[96px] ${
                isActive ? 'ring-2 ring-emerald-500/30' : ''
              }`}
            >
              <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${c.soft}`}>
                <Icon size={22} strokeWidth={1.75} className={c.solid} />
              </span>
              <span className="min-w-0">
                <span className="block font-extrabold text-gray-900 tabular-nums leading-tight text-2xl">
                  {c.count}
                </span>
                <span className="block font-medium text-gray-500 mt-0.5 truncate text-sm">{c.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {isLoading && <PageLoader variant="skeleton" rows={6} />}
      {isError && !isLoading && (
        <Panel icon={Package} accent="rose" title={rtl ? 'تعذّر التحميل' : 'Failed to load'}>
          <p className="text-sm text-red-500">{rtl ? 'فشل تحميل مركز الإنذار — حاول مجددًا' : 'Could not load the alerts center — try again'}</p>
        </Panel>
      )}

      {!isLoading && !isError && center && (
        <>
          {/* اشتراكات تنتهي اليوم / قريبًا — روابط لصفحة الاشتراكات */}
          {showExpiring && (
          <div ref={refs.today} className="scroll-mt-6">
            <Panel
              icon={CalendarClock}
              accent="rose"
              title={`${rtl ? 'ينتهي اليوم' : 'Expiring today'} (${counts.today})`}
              actions={
                <button
                  type="button"
                  onClick={() => navigate('/admin/subscriptions?status=ending_soon')}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  {rtl ? 'فتح الاشتراكات' : 'Open subscriptions'}
                </button>
              }
            >
              {(center.expiring_today ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  {rtl ? 'لا اشتراكات تنتهي اليوم' : 'No subscriptions expiring today'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {center.expiring_today.map((r) => (
                    <li key={r.member_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-gray-900 truncate">
                        {r.member_name}
                        {r.phone_number && <span className="text-gray-500 font-normal"> · {r.phone_number}</span>}
                      </span>
                      <span className="text-gray-500 shrink-0 text-xs">{formatDate(r.end_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          )}

          {showExpiring && (
          <div ref={refs.soon} className="scroll-mt-6">
            <Panel
              icon={Clock}
              accent="amber"
              title={`${rtl ? `ينتهي قريباً (خلال ${center.expiring_days} أيام)` : `Expiring soon (${center.expiring_days}d)`} (${counts.soon})`}
              actions={
                <button
                  type="button"
                  onClick={() => navigate('/admin/subscriptions?status=ending_soon')}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  {rtl ? 'فتح الاشتراكات' : 'Open subscriptions'}
                </button>
              }
            >
              {(center.expiring_soon ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  {rtl ? 'لا اشتراكات قريبة الانتهاء' : 'No subscriptions expiring soon'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {center.expiring_soon.map((r) => (
                    <li key={r.member_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-gray-900 truncate">
                        {r.member_name}
                        {r.phone_number && <span className="text-gray-500 font-normal"> · {r.phone_number}</span>}
                      </span>
                      <span className="text-gray-500 shrink-0 text-xs">
                        {formatDate(r.end_date)} · {rtl ? `متبقي ${r.days_left}` : `${r.days_left}d left`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          )}

          {/* مستحقات غير مدفوعة — نفس زرار التحصيل في الديون */}
          <div ref={refs.unpaid} className="scroll-mt-6">
            <Panel
              icon={Banknote}
              accent="rose"
              title={`${rtl ? 'مستحقات غير مدفوعة' : 'Unpaid dues'} (${counts.unpaid})`}
              actions={
                <button
                  type="button"
                  onClick={() => navigate('/admin/debts')}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  {rtl ? 'فتح الديون' : 'Open debts'}
                </button>
              }
            >
              {center.unpaid.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">{rtl ? 'لا مستحقات مفتوحة' : 'No open dues'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-gray-900">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'العضو' : 'Member'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ' : 'Total'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المدفوع' : 'Paid'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المتبقي' : 'Remaining'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'تحصيل' : 'Collect'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {center.unpaid.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="block font-medium whitespace-nowrap">{r.member_name || '—'}</span>
                            {r.phone_number && <span className="block text-xs text-gray-500" dir="ltr">{r.phone_number}</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{money(r.original_amount)}</td>
                          <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{money(r.paid_amount)}</td>
                          <td className="px-4 py-3 font-bold text-red-600 whitespace-nowrap">{money(r.remaining_amount)}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => navigate('/admin/debts')}
                              title={rtl ? 'تحصيل مباشر — تسجيل دفعة' : 'Collect — record a payment'}
                              aria-label={rtl ? 'تحصيل مباشر' : 'Collect'}
                              className="w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                            >
                              <Banknote size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {/* تنبيهات المخزون — نفس الشرط في الشارة: رصيد <= حد أدنى */}
          {showStock && (
          <div ref={refs.stock} className="scroll-mt-6">
            <Panel
              icon={Package}
              accent="amber"
              title={`${rtl ? 'تنبيهات المخزون' : 'Low-stock alerts'} (${counts.low_stock})`}
              actions={
                <button
                  type="button"
                  onClick={() => navigate('/admin/products?tab=purchases')}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  {rtl ? 'فتح المشتريات' : 'Open purchases'}
                </button>
              }
            >
              {center.low_stock.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">{rtl ? 'المخزون سليم' : 'Stock levels are fine'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-gray-900">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المنتج' : 'Product'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المخزون' : 'Stock'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحد الأدنى' : 'Min'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'شراء' : 'Restock'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {center.low_stock.map((p) => (
                        <tr key={p.id} className="border-t border-gray-100 bg-amber-50/60 hover:bg-amber-50 transition-colors">
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{p.name}</td>
                          <td className="px-4 py-3 tabular-nums">{p.stock_quantity}</td>
                          <td className="px-4 py-3 tabular-nums">{p.min_stock}</td>
                          <td className="px-4 py-3">
                            <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800">
                              {rtl ? 'منخفض' : 'Low'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => navigate('/admin/products?tab=purchases')}
                              title={rtl ? 'إضافة مخزون / شراء سريع' : 'Restock / quick purchase'}
                              aria-label={rtl ? 'إضافة مخزون' : 'Restock'}
                              className="w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                            >
                              {p.stock_quantity > 0 ? <Package size={17} /> : <Plus size={17} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
          )}

          <p className="text-xs text-gray-400">
            {rtl
              ? `العتبات من الإعدادات: «ينتهي قريبًا» خلال ${center.expiring_days} أيام (alert_expiring_days) · المستحقات أي دين نشط بمتبقي أكبر من صفر · المخزون منخفض عندما الرصيد أصغر من أو يساوي الحد الأدنى للمنتج.`
              : `Thresholds come from settings: expiring-soon within ${center.expiring_days} days (alert_expiring_days) · dues are any active debt with remaining > 0 · low stock means quantity <= product minimum.`}
          </p>
        </>
      )}
    </div>
  );
}
