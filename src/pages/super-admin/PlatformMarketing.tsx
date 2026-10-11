import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listCampaigns, createCampaign, updateCampaignStatus, deleteCampaign,
  listEmailTemplates,
  listReferrals, getLoyaltySummary,
} from '../../services/api';
import type { MarketingCampaign, EmailTemplate, ReferralData, LoyaltySummary } from '../../services/api';
import {
  MegaphoneSimple, Users, Star, Plus, X, FloppyDisk, Trash,
  Envelope, CheckCircle, Clock, Sparkle,
} from '@phosphor-icons/react';
import PageLoader from '../../components/shared/PageLoader';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import MarketingReportsTab from './marketing/MarketingReportsTab';

type MarketingTab = 'dashboard' | 'campaigns' | 'referrals' | 'loyalty' | 'reports';

export default function PlatformMarketing() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const [activeTab, setActiveTab] = useState<MarketingTab>('dashboard');

  // â”€â”€ Data â”€â”€
  const campaignsQuery = useApiQuery(['marketing-campaigns'], listCampaigns, { staleTime: 30_000 });
  const campaigns: MarketingCampaign[] = campaignsQuery.data?.data ?? [];

  const referralsQuery = useApiQuery(['marketing-referrals'], listReferrals, { staleTime: 30_000 });
  const referrals: ReferralData[] = referralsQuery.data?.data ?? [];

  const loyaltyQuery = useApiQuery(['loyalty-summary'], getLoyaltySummary, { staleTime: 60_000 });
  const loyalty: LoyaltySummary | null = loyaltyQuery.data?.data ?? null;

  const emailTemplatesQuery = useApiQuery(['email-templates'], listEmailTemplates, { staleTime: 60_000 });
  const emailTemplates: EmailTemplate[] = emailTemplatesQuery.data?.data ?? [];

  // â”€â”€ Campaign Modal â”€â”€
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campForm, setCampForm] = useState({
    name: '', name_ar: '', type: 'email', description: '', budget: 0, scheduled_at: '',
  });

  const createCampaignMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createCampaign>[0]) => createCampaign(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      showToast(isRtl ? 'تم إنشاء الحملة' : 'Campaign created', 'success');
      setShowCampaignModal(false);
    },
    onError: () => showToast(isRtl ? 'فشل إنشاء الحملة' : 'Failed to create campaign', 'error'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCampaignStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      showToast(isRtl ? 'تم تحديث الحالة' : 'Status updated', 'success');
    },
    onError: () => showToast(isRtl ? 'فشل التحديث' : 'Update failed', 'error'),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      showToast(isRtl ? 'تم حذف الحملة' : 'Campaign deleted', 'success');
    },
    onError: () => showToast(isRtl ? 'فشل الحذف' : 'Delete failed', 'error'),
  });

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      scheduled: 'bg-blue-100 text-blue-700',
      active: 'bg-green-100 text-green-700',
      paused: 'bg-amber-100 text-amber-700',
      completed: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };



  return (
    <div className="p-4 md:p-6 bg-surface min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'التسويق' : 'Marketing'}
        subtitle={isRtl ? 'إدارة الحملات التسويقية، الإحالات، وبرنامج الولاء' : 'Campaigns, referrals & loyalty program'}
        icon="campaign"
      />

      <UnifiedTabs
        tabs={[
          { key: 'dashboard' as MarketingTab, labelAr: 'لوحة التحكم', labelEn: 'Dashboard', icon: 'dashboard' },
          { key: 'campaigns' as MarketingTab, labelAr: 'الحملات', labelEn: 'Campaigns', icon: 'campaign' },
          { key: 'referrals' as MarketingTab, labelAr: 'الإحالات', labelEn: 'Referrals', icon: 'referral' },
          { key: 'loyalty' as MarketingTab, labelAr: 'الولاء', labelEn: 'Loyalty', icon: 'star' },
          { key: 'reports' as MarketingTab, labelAr: 'التقارير', labelEn: 'Reports', icon: 'chart' },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as MarketingTab)}
        variant="pills"
        className="mb-6"
      />

      {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ DASHBOARD â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: isRtl ? 'الحملات' : 'Campaigns', value: campaigns.length.toString(), icon: MegaphoneSimple, color: 'text-primary bg-primary/5' },
              { label: isRtl ? 'الإحالات' : 'Referrals', value: referrals.length.toString(), icon: Users, color: 'text-green-700 bg-green-50' },
              { label: isRtl ? 'نقاط الولاء' : 'Loyalty Points', value: (loyalty?.total_points || 0).toLocaleString(), icon: Star, color: 'text-amber-700 bg-amber-50' },
              { label: isRtl ? 'الأعضاء النشطون' : 'Active Members', value: (loyalty?.active_members || 0).toString(), icon: Users, color: 'text-blue-700 bg-blue-50' },
            ].map((card) => (
              <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
                <card.icon size={20} />
                <p className="text-2xl font-bold mt-2">{card.value}</p>
                <p className="text-xs mt-1 opacity-80">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">{isRtl ? 'إجراءات سريعة' : 'Quick Actions'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={() => { setCampForm({ name: '', name_ar: '', type: 'email', description: '', budget: 0, scheduled_at: '' }); setShowCampaignModal(true); }}
                className="bg-blue-50 text-blue-700 rounded-xl p-4 text-right hover:shadow-sm transition text-sm font-medium flex items-center gap-3">
                <MegaphoneSimple size={20} />
                {isRtl ? 'إنشاء حملة' : 'Create Campaign'}
              </button>
              <button onClick={() => setActiveTab('referrals')}
                className="bg-green-50 text-green-700 rounded-xl p-4 text-right hover:shadow-sm transition text-sm font-medium flex items-center gap-3">
                <Users size={20} />
                {isRtl ? 'عرض الإحالات' : 'View Referrals'}
              </button>
              <button onClick={() => setActiveTab('loyalty')}
                className="bg-amber-50 text-amber-700 rounded-xl p-4 text-right hover:shadow-sm transition text-sm font-medium flex items-center gap-3">
                <Star size={20} />
                {isRtl ? 'برنامج الولاء' : 'Loyalty Program'}
              </button>
              <button
                className="bg-purple-50 text-purple-700 rounded-xl p-4 text-right hover:shadow-sm transition text-sm font-medium flex items-center gap-3">
                <Sparkle size={20} />
                {isRtl ? 'قوالب البريد' : 'Email Templates'}
              </button>
            </div>
          </div>

          {/* Recent Campaigns */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">{isRtl ? 'آخر الحملات' : 'Recent Campaigns'}</h3>
            {campaigns.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">{isRtl ? 'لا توجد حملات' : 'No campaigns'}</p>
            ) : (
              <div className="space-y-3">
                {campaigns.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{isRtl ? c.name_ar || c.name : c.name}</p>
                      <p className="text-xs text-gray-500">{c.type} â€¢ {new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ CAMPAIGNS â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{isRtl ? `${campaigns.length} حملة` : `${campaigns.length} campaign(s)`}</p>
            <button onClick={() => { setCampForm({ name: '', name_ar: '', type: 'email', description: '', budget: 0, scheduled_at: '' }); setShowCampaignModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-petrol-light transition-colors">
              <Plus size={18} />
              {isRtl ? 'حملة جديدة' : 'New Campaign'}
            </button>
          </div>

          {campaignsQuery.isLoading ? (
            <PageLoader />
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border shadow-sm border-gray-100">
              <MegaphoneSimple size={48} className="mx-auto text-gray-500/40 mb-3" />
              <p className="text-gray-500">{isRtl ? 'لا توجد حملات' : 'No campaigns'}</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {campaigns.map((c) => (
                <div key={c.id} className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">{isRtl ? c.name_ar || c.name : c.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(c.status)}`}>{c.status}</span>
                        <span className="px-2 py-0.5 bg-gray-50 text-xs text-gray-500 rounded-full">{c.type}</span>
                      </div>
                      {c.description && <p className="text-sm text-gray-500 mb-2">{c.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Clock size={12} /> {new Date(c.created_at).toLocaleDateString()}</span>
                        {c.budget > 0 && <span>{isRtl ? 'الميزانية:' : 'Budget:'} {c.budget.toLocaleString()}</span>}
                        {c.gym_name && <span className="flex items-center gap-1"><Users size={12} /> {c.gym_name}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {c.status === 'draft' && (
                        <button onClick={() => updateStatusMutation.mutate({ id: c.id, status: 'active' })}
                          className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">
                          {isRtl ? 'تفعيل' : 'Activate'}
                        </button>
                      )}
                      {(c.status === 'active' || c.status === 'scheduled') && (
                        <button onClick={() => updateStatusMutation.mutate({ id: c.id, status: 'paused' })}
                          className="px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors">
                          {isRtl ? 'إيقاف' : 'Pause'}
                        </button>
                      )}
                      <button onClick={() => { if (confirm(isRtl ? 'حذف الحملة؟' : 'Delete campaign?')) deleteCampaignMutation.mutate(c.id); }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ REFERRALS â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
      {activeTab === 'referrals' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{isRtl ? `${referrals.length} إحالة` : `${referrals.length} referral(s)`}</p>
          {referralsQuery.isLoading ? (
            <PageLoader />
          ) : referrals.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border shadow-sm border-gray-100">
              <Users size={48} className="mx-auto text-gray-500/40 mb-3" />
              <p className="text-gray-500">{isRtl ? 'لا توجد إحالات' : 'No referrals'}</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border shadow-sm border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 text-sm text-gray-900">
                      <th className="text-right p-4">{isRtl ? 'الرمز' : 'Code'}</th>
                      <th className="text-right p-4">{isRtl ? 'الصالة' : 'Gym'}</th>
                      <th className="text-right p-4">{isRtl ? 'العضو المحال' : 'Referred'}</th>
                      <th className="text-right p-4">{isRtl ? 'المكافأة' : 'Reward'}</th>
                      <th className="text-right p-4">{isRtl ? 'الحالة' : 'Status'}</th>
                      <th className="text-right p-4">{isRtl ? 'التاريخ' : 'Date'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-4 font-mono font-bold text-gray-900">{r.referral_code}</td>
                        <td className="p-4 text-gray-500">{r.gym_name || 'â€”'}</td>
                        <td className="p-4 text-gray-500">{r.referred_member_name || 'â€”'}</td>
                        <td className="p-4 text-gray-900">{r.reward_amount}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.reward_status === 'paid' ? 'bg-green-100 text-green-700' : r.reward_status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                            {r.reward_status}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ LOYALTY â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
      {activeTab === 'loyalty' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: isRtl ? 'إجمالي النقاط' : 'Total Points', value: (loyalty?.total_points || 0).toLocaleString(), icon: Star, color: 'text-amber-700 bg-amber-50' },
              { label: isRtl ? 'الأعضاء النشطون' : 'Active Members', value: (loyalty?.active_members || 0).toString(), icon: Users, color: 'text-blue-700 bg-blue-50' },
              { label: isRtl ? 'النقاط المستردة' : 'Redeemed Points', value: (loyalty?.total_redeemed || 0).toLocaleString(), icon: CheckCircle, color: 'text-green-700 bg-green-50' },
            ].map((card) => (
              <div key={card.label} className={`rounded-xl border p-5 ${card.color}`}>
                <card.icon size={24} />
                <p className="text-2xl font-bold mt-2">{card.value}</p>
                <p className="text-sm mt-1 opacity-80">{card.label}</p>
              </div>
            ))}
          </div>

          {loyalty?.by_plan && loyalty.by_plan.length > 0 && (
            <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">{isRtl ? 'توزيع برنامج الولاء حسب الباقة' : 'Loyalty by Plan'}</h3>
              <div className="space-y-3">
                {loyalty!.by_plan!.map((p) => {
                  const maxVal = Math.max(...loyalty!.by_plan!.map(x => x.members));
                  const pct = maxVal > 0 ? (p.members / maxVal) * 100 : 0;
                  return (
                    <div key={p.plan_name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">{p.plan_name}</span>
                        <span className="font-semibold text-gray-900">{p.members} {isRtl ? 'عضو' : 'members'}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div className="bg-amber-500 rounded-full h-2.5 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Email Templates Section */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Envelope size={18} />
              {isRtl ? 'قوالب البريد الإلكتروني' : 'Email Templates'}
            </h3>
            {emailTemplatesQuery.isLoading ? (
              <PageLoader />
            ) : emailTemplates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">{isRtl ? 'لا توجد قوالب' : 'No templates'}</p>
            ) : (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                {emailTemplates.map((t) => (
                  <div key={t.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{isRtl ? t.name_ar || t.name : t.name}</h4>
                      <span className="px-2 py-0.5 bg-gray-50 text-xs text-gray-500 rounded-full">{t.type}</span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{t.subject}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* â–¼ Reports */}
      {activeTab === 'reports' && <MarketingReportsTab />}

      {/* â”€â”€ Campaign Create Modal â”€â”€ */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCampaignModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <MegaphoneSimple size={20} className="text-primary" />
                <h2 className="text-lg font-bold text-gray-900">{isRtl ? 'حملة جديدة' : 'New Campaign'}</h2>
              </div>
              <button onClick={() => setShowCampaignModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createCampaignMutation.mutate({
              name: campForm.name,
              name_ar: campForm.name_ar || undefined,
              type: campForm.type,
              description: campForm.description || undefined,
              budget: campForm.budget || undefined,
              scheduled_at: campForm.scheduled_at || undefined,
            }); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                  <input type="text" value={campForm.name_ar} onChange={(e) => setCampForm(f => ({ ...f, name_ar: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-100 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'الاسم (إنجليزي)' : 'Name (English)'} *</label>
                  <input type="text" value={campForm.name} onChange={(e) => setCampForm(f => ({ ...f, name: e.target.value }))} required
                    className="w-full px-3 py-2 border border-gray-100 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'النوع' : 'Type'} *</label>
                <select value={campForm.type} onChange={(e) => setCampForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg">
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="social">Social Media</option>
                  <option value="referral">{isRtl ? 'إحالة' : 'Referral'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'الوصف' : 'Description'}</label>
                <textarea value={campForm.description} onChange={(e) => setCampForm(f => ({ ...f, description: e.target.value }))} rows={3}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'الميزانية' : 'Budget'}</label>
                  <input type="number" min={0} value={campForm.budget} onChange={(e) => setCampForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-100 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-500 mb-1.5">{isRtl ? 'موعد الإطلاق' : 'Launch Date'}</label>
                  <input type="date" value={campForm.scheduled_at} onChange={(e) => setCampForm(f => ({ ...f, scheduled_at: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-100 rounded-lg" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createCampaignMutation.isPending}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-petrol-light transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {createCampaignMutation.isPending && (<span className="material-symbols-outlined animate-spin text-base">progress_activity</span>)}
                  <FloppyDisk size={16} />
                  {isRtl ? 'إنشاء الحملة' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowCampaignModal(false)}
                  className="px-5 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors">
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
