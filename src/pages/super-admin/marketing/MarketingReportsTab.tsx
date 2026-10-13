import { useMemo } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { listCampaigns, getLoyaltySummary, listReferrals } from '../../../services/api';
import Chart from '../../../components/charts/Chart';
import {
  ChartBar, TrendUp, CurrencyDollar, Users,
} from '@phosphor-icons/react';

export default function MarketingReportsTab() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const t = (ar: string, en: string) => (isRtl ? ar : en);

  const campaignsQuery = useApiQuery(['marketing-campaigns'], listCampaigns, { staleTime: 30_000 });
  const loyaltyQuery = useApiQuery(['loyalty-summary'], getLoyaltySummary, { staleTime: 30_000 });
  const referralsQuery = useApiQuery(['referrals'], listReferrals, { staleTime: 30_000 });

  const campaigns = campaignsQuery.data?.data ?? [];
  const loyalty = loyaltyQuery.data?.data;
  const referrals = referralsQuery.data?.data ?? [];

  // Campaign metrics
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c: any) => c.status === 'active').length;
  const totalReach = campaigns.reduce((sum: number, c: any) => sum + (c.reach || 0), 0);
  const totalConversions = campaigns.reduce((sum: number, c: any) => sum + (c.conversions || 0), 0);

  // Campaign performance chart data
  const campaignChartData = useMemo(() => {
    const active = campaigns.filter((c: any) => c.status === 'active');
    return {
      categories: active.slice(0, 10).map((c: any) => c.name?.slice(0, 15) || ''),
      reach: active.slice(0, 10).map((c: any) => c.reach || 0),
      conversions: active.slice(0, 10).map((c: any) => c.conversions || 0),
    };
  }, [campaigns]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ChartBar size={16} className="text-blue-600" />
            <span className="text-xs text-gray-500/60">{t('إجمالي الحملات', 'Total Campaigns')}</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{totalCampaigns}</p>
          <p className="text-xs text-green-600 mt-1">+{activeCampaigns} {t('نشطة', 'active')}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendUp size={16} className="text-green-600" />
            <span className="text-xs text-gray-500/60">{t('إجمالي الوصول', 'Total Reach')}</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{totalReach.toLocaleString('en-US')}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CurrencyDollar size={16} className="text-amber-600" />
            <span className="text-xs text-gray-500/60">{t('معدل التحويل', 'Conversion Rate')}</span>
          </div>
          <p className="text-xl font-bold text-gray-900">
            {totalReach > 0 ? ((totalConversions / totalReach) * 100).toFixed(1) : 0}%
          </p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-purple-600" />
            <span className="text-xs text-gray-500/60">{t('الإحالات', 'Referrals')}</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{referrals.length}</p>
        </div>
      </div>

      {/* Campaign Performance Chart */}
      <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4">
          {t('أداء الحملات النشطة', 'Active Campaign Performance')}
        </h3>
        {campaignChartData.categories.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">
            {t('لا توجد حملات نشطة', 'No active campaigns')}
          </div>
        ) : (
          <Chart
            type="bar"
            height={280}
            categories={campaignChartData.categories}
            series={[
              { name: t('الوصول', 'Reach'), data: campaignChartData.reach },
              { name: t('التحويلات', 'Conversions'), data: campaignChartData.conversions },
            ]}
            colors={['#3b82f6', '#22c55e']}
            barRadius={4}
            showLegend
          />
        )}
      </div>

      {/* Loyalty Summary */}
      {loyalty && (
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            {t('ملخص برنامج الولاء', 'Loyalty Program Summary')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500/60">{t('إجمالي النقاط الممنوحة', 'Total Points Given')}</p>
              <p className="text-lg font-bold text-gray-900">{(loyalty as any).total_points_given?.toLocaleString('en-US') || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500/60">{t('النقاط المستخدمة', 'Points Used')}</p>
              <p className="text-lg font-bold text-gray-900">{(loyalty as any).total_points_used?.toLocaleString('en-US') || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500/60">{t('الأعضاء النشطون', 'Active Members')}</p>
              <p className="text-lg font-bold text-gray-900">{(loyalty as any).active_members?.toLocaleString('en-US') || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500/60">{t('معدل الاسترداد', 'Redemption Rate')}</p>
              <p className="text-lg font-bold text-gray-900">
                {(loyalty as any).total_points_given > 0
                  ? ((((loyalty as any).total_points_used || 0) / (loyalty as any).total_points_given) * 100).toFixed(1)
                  : 0}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
