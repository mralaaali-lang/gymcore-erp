import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getAIDashboard, getAIChurnPrediction, getAIPlanRecommendations, getAIRevenueForecast } from '../../services/api';
import type { AIChurnPrediction, AIPlanRecommendation, AIRevenueForecast, AIDashboardResponse } from '../../services/api';
import { WarningCircle, Lightbulb, TrendUp } from '@phosphor-icons/react';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-green-50 border-green-200 text-green-700',
  critical: 'bg-red-100 border-red-300 text-red-800',
};

const RISK_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
  critical: 'bg-red-200 text-red-800',
};

export default function AIAnalytics() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [activeTab, setActiveTab] = useState<'churn' | 'plans' | 'revenue'>('churn');

  // Load all data in parallel
  const dashboardQuery = useApiQuery(['ai-dashboard'], getAIDashboard, { staleTime: 60_000 });
  const dashboard: AIDashboardResponse | null = dashboardQuery.data?.data ?? null;

  const churnQuery = useApiQuery(['ai-churn'], getAIChurnPrediction, { staleTime: 60_000, enabled: activeTab === 'churn' });
  const plansQuery = useApiQuery(['ai-plans'], getAIPlanRecommendations, { staleTime: 60_000, enabled: activeTab === 'plans' });
  const revenueQuery = useApiQuery(['ai-revenue'], () => getAIRevenueForecast(3), { staleTime: 60_000, enabled: activeTab === 'revenue' });

  const churnData: AIChurnPrediction[] = churnQuery.data?.data ?? dashboard?.churn_prediction ?? [];
  const planData: AIPlanRecommendation[] = plansQuery.data?.data ?? dashboard?.plan_recommendations ?? [];
  const forecastData: AIRevenueForecast[] = revenueQuery.data?.data ?? dashboard?.revenue_forecast ?? [];
  const stats = dashboard?.stats ?? { high_risk_count: 0, medium_risk_count: 0, avg_risk_score: 0 };

  const isLoading = activeTab === 'churn' ? churnQuery.isLoading : activeTab === 'plans' ? plansQuery.isLoading : revenueQuery.isLoading;
  const isInitialLoading = dashboardQuery.isLoading && !dashboard;

  return (
    <div className="p-4 md:p-6 bg-surface min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'تحليلات الذكاء الاصطناعي' : 'AI Analytics'}
        subtitle={isRtl ? 'توقعات التخلي، توصيات الباقات، توقع الإيرادات' : 'Churn prediction, plan recommendations, revenue forecast'}
        icon="auto_awesome"
      />

      <UnifiedTabs
        tabs={[
          { key: 'churn', labelAr: 'توقع التخلي', labelEn: 'Churn Prediction', icon: 'warning' },
          { key: 'plans', labelAr: 'توصيات الباقات', labelEn: 'Plan Recommendations', icon: 'lightbulb' },
          { key: 'revenue', labelAr: 'توقع الإيرادات', labelEn: 'Revenue Forecast', icon: 'trending_up' },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'churn' | 'plans' | 'revenue')}
        variant="pills"
        className="mb-6"
      />

      {isInitialLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          {/* Churn Prediction Tab */}
          {activeTab === 'churn' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: isRtl ? 'عالية المخاطر' : 'High Risk', value: stats.high_risk_count?.toString() || '0', color: 'bg-red-500' },
                  { label: isRtl ? 'متوسطة المخاطر' : 'Medium Risk', value: stats.medium_risk_count?.toString() || '0', color: 'bg-amber-500' },
                  { label: isRtl ? 'إجمالي التحليلات' : 'Analyzed Gyms', value: churnData.length?.toString() || '0', color: 'bg-blue-500' },
                  { label: isRtl ? 'متوسط درجة المخاطر' : 'Avg Risk Score', value: stats.avg_risk_score ? `${stats.avg_risk_score}%` : 'â€”', color: 'bg-primary' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white border border-[#d9e3f6] rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${stat.color}`} />
                      <span className="text-sm text-[#584237]">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-[#121c2a] mt-2">{stat.value}</p>
                  </div>
                ))}
              </div>

              {isLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : churnData.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-[#d9e3f6]">
                  <WarningCircle size={48} className="mx-auto text-[#584237]/40 mb-3" />
                  <p className="text-[#584237]">{isRtl ? 'لا توجد بيانات توقع' : 'No prediction data'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {churnData.map((gym) => {
                    const riskLevel = gym.risk_level || (gym.churn_score >= 70 ? 'high' : gym.churn_score >= 40 ? 'medium' : 'low');
                    return (
                      <div key={gym.gym_id} className={`rounded-2xl border p-5 ${RISK_COLORS[riskLevel] || 'bg-white border-[#d9e3f6]'}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-bold text-[#121c2a]">{gym.gym_name}</h3>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${RISK_BADGE[riskLevel] || 'bg-gray-100 text-gray-700'}`}>
                                {isRtl
                                  ? ({ high: 'خطر مرتفع', medium: 'خطر متوسط', low: 'آمن', critical: 'خطير' } as Record<string, string>)[riskLevel] || riskLevel
                                  : riskLevel.toUpperCase()}
                              </span>
                            </div>
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-[#584237]">{isRtl ? 'نسبة المخاطر:' : 'Risk Score:'}</span>
                                <div className="flex-1 max-w-xs h-2.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${
                                    riskLevel === 'high' || riskLevel === 'critical' ? 'bg-red-500' : riskLevel === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                                  }`} style={{ width: `${gym.churn_score}%` }} />
                                </div>
                                <span className="text-sm font-bold text-[#121c2a]">{gym.churn_score}%</span>
                              </div>
                            </div>
                            <div className="text-sm space-y-1">
                              <p className="font-medium text-[#584237]">{isRtl ? 'العوامل:' : 'Factors:'}</p>
                              {gym.factors?.length > 0 ? (
                                <ul className="space-y-0.5 text-[#584237]">
                                  {gym.factors.map((f, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                      <span className="text-red-500 mt-0.5">â€¢</span>
                                      <span>{typeof f === 'string' ? f : f.description}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-[#584237]">{isRtl ? 'لا توجد عوامل محددة' : 'No specific factors'}</p>
                              )}
                            </div>
                            {gym.suggested_action && (
                              <div className="mt-3 p-3 bg-white/50 rounded-xl text-sm text-[#584237]">
                                <span className="font-medium">{isRtl ? 'الإجراء المقترح: ' : 'Suggested action: '}</span>
                                {gym.suggested_action}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Plan Recommendations Tab */}
          {activeTab === 'plans' && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : planData.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-[#d9e3f6]">
                  <Lightbulb size={48} className="mx-auto text-[#584237]/40 mb-3" />
                  <p className="text-[#584237]">{isRtl ? 'لا توجد توصيات' : 'No recommendations'}</p>
                </div>
              ) : (
                <div className="bg-white border border-[#d9e3f6] rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-[#121c2a] mb-4">{isRtl ? 'توصيات ترقية الباقات' : 'Plan Upgrade Recommendations'}</h2>
                  <div className="space-y-4">
                    {planData.map((rec) => (
                      <div key={rec.gym_id} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-bold text-[#121c2a]">{rec.gym_name}</h3>
                              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                                {isRtl ? 'موصى به' : 'Recommended'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-[#584237]">{isRtl ? 'الحالي:' : 'Current:'} <span className="line-through">{rec.current_plan}</span></span>
                              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                              <span className="font-semibold text-primary">{rec.recommended_plan}</span>
                              {rec.savings_percent && (
                                <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-semibold">-{rec.savings_percent}%</span>
                              )}
                            </div>
                            <p className="text-sm text-[#584237] mt-2">{rec.reason}</p>
                            <p className="text-xs text-[#584237] mt-1">{isRtl ? 'نسبة الثقة:' : 'Confidence:'} {Math.round(rec.confidence * 100)}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Revenue Forecast Tab */}
          {activeTab === 'revenue' && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : forecastData.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-[#d9e3f6]">
                  <TrendUp size={48} className="mx-auto text-[#584237]/40 mb-3" />
                  <p className="text-[#584237]">{isRtl ? 'لا توجد توقعات' : 'No forecasts'}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {forecastData.map((forecast) => (
                      <div key={forecast.month} className="bg-white border border-[#d9e3f6] rounded-2xl p-5 shadow-sm">
                        <p className="text-sm text-[#584237] font-medium mb-1">{forecast.month}</p>
                        <p className="text-2xl font-bold text-[#121c2a]">{forecast.predicted.toLocaleString()} EGP</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-[#584237]">
                          <span>{isRtl ? 'النطاق:' : 'Range:'}</span>
                          <span className="text-green-600">{forecast.lower_bound.toLocaleString()}</span>
                          <span>-</span>
                          <span className="text-red-600">{forecast.upper_bound.toLocaleString()}</span>
                        </div>
                        {forecast.growth_rate && (
                          <p className="text-xs text-primary mt-1">
                            {isRtl ? 'نمو: ' : 'Growth: '}{forecast.growth_rate}%
                          </p>
                        )}
                        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: '70%' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white border border-[#d9e3f6] rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-[#121c2a] mb-4">
                      {isRtl ? 'توقعات الإيرادات' : 'Revenue Forecast'}
                    </h2>
                    <div className="space-y-4">
                      {forecastData.map((f) => {
                        const maxVal = Math.max(...forecastData.map(x => x.upper_bound));
                        const pct = maxVal > 0 ? (f.predicted / maxVal) * 100 : 50;
                        return (
                          <div key={f.month} className="flex items-center gap-4">
                            <span className="text-sm font-medium text-[#584237] w-28">{f.month}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                                  <div className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-sm font-bold text-[#121c2a] w-24 text-right">
                                  {f.predicted.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
