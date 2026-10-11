
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { listOffers } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

export default function SubscriptionManagement() {
  const { language } = useApp();
  const rtl = language === 'ar';

  const { data, isLoading, error } = useQuery({
    queryKey: ['offers'],
    queryFn: listOffers,
  });

  const offers = data?.data || [];

  const toggleActive = (_id: string, _current: boolean) => {
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <PageHeader
        title="الباقات والعروض"
        subtitle={rtl ? 'إدارة باقات الاشتراك والعروض' : 'Manage subscription plans and offers'}
        icon="local_offer"
      />

      {isLoading && <PageLoader message="جاري التحميل..." />}
      {error && <div className="text-center py-12 text-red-500 bg-white rounded-3xl border border-gray-100 shadow-sm">حدث خطأ أثناء تحميل الباقات</div>}
      {!isLoading && !error && offers.length === 0 && (
        <Card className="text-center py-12">
          <span className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-3xl text-gray-400">local_offer</span>
          </span>
          <p className="text-gray-400">لا توجد باقات أو عروض متاحة</p>
        </Card>
      )}

      {!isLoading && !error && offers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {offers.map((offer: any) => (
            <div
              key={offer.id}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-5 md:p-6" style={{ borderTop: `4px solid ${offer.is_active ? '#10b981' : '#e5e7eb'}` }}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-900">{offer.name}</h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={offer.is_active} onChange={() => toggleActive(offer.id, offer.is_active)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                  </label>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  {offer.duration ? `${offer.duration} ${rtl ? 'أشهر' : 'months'}` : ''}
                </p>
                <p className="text-3xl font-bold text-gray-900 mb-4">
                  {(offer.price || offer.total_price || 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">ر.س</span>
                </p>
                {offer.description && (
                  <p className="text-sm text-gray-500 mb-4">{offer.description}</p>
                )}
                {offer.features && Array.isArray(offer.features) && (
                  <ul className="space-y-2 mb-5">
                    {offer.features.map((f: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="material-symbols-outlined text-emerald-500 text-base">check_circle</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <StatusBadge status={offer.is_active ? 'مفعل' : 'غير مفعل'} variant={offer.is_active ? 'success' : 'neutral'} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
