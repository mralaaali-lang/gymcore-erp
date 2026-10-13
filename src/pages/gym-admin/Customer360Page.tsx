import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate, formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { getCustomer360, searchMembers } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

export default function Customer360Page() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const isRtl = language === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const searchResults = useQuery({
    queryKey: ['members-search', searchQuery],
    queryFn: () => searchMembers(searchQuery),
    enabled: searchQuery.length >= 2,
    staleTime: 10_000,
  });

  const memberData = useQuery({
    queryKey: ['customer360', selectedMemberId],
    queryFn: () => getCustomer360(selectedMemberId!),
    enabled: !!selectedMemberId,
    staleTime: 30_000,
  });

  const member = memberData.data?.data;
  const searchHits = searchResults.data?.data || [];

  const Section = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-xl text-emerald-600">{icon}</span>
        </div>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </Card>
  );

  if (!selectedMemberId) {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          title={isRtl ? 'الملف الموحد للعضو' : 'Customer 360'}
          subtitle={isRtl ? 'ابحث عن عضو لعرض ملفه الموحد' : 'Search for a member to view unified profile'}
          icon="person_search"
        />
        <Card className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-emerald-600">search</span>
          </div>
          <div className="max-w-md mx-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'ابحث بالاسم أو رقم الجوال...' : 'Search by name or phone...'}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400 mb-4 text-center"
            />
            {searchResults.isFetching && <PageLoader />}
            {searchHits.length > 0 && (
              <div className="border border-gray-100 rounded-2xl divide-y divide-gray-100 max-h-64 overflow-y-auto text-right">
                {searchHits.map((m: any) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMemberId(m.id)}
                    className="w-full px-4 py-3 hover:bg-gray-50 transition-colors text-right flex items-center gap-3"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {m.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.full_name}</p>
                      <p className="text-xs text-gray-500">{m.phone_number}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.length >= 2 && !searchResults.isFetching && searchHits.length === 0 && (
              <p className="text-sm text-gray-400">{isRtl ? 'لا توجد نتائج' : 'No results'}</p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (memberData.isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="p-8 text-center text-gray-500">
          {isRtl ? 'لم يتم العثور على العضو' : 'Member not found'}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => { setSelectedMemberId(null); setSearchQuery(''); }}
          className="text-sm text-emerald-600 hover:underline"
        >
          &larr; {isRtl ? 'بحث جديد' : 'New Search'}
        </button>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {(member as any).member?.full_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{(member as any).member?.full_name}</h1>
            <p className="text-sm text-gray-500">
              {(member as any).member?.phone_number}
              {(member as any).member?.email ? ` • ${(member as any).member.email}` : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <StatusBadge
              status={(member as any).member?.is_blacklisted
                ? (isRtl ? 'مدرج في القائمة السوداء' : 'Blacklisted')
                : (isRtl ? 'عضو نشط' : 'Active Member')}
              variant={(member as any).member?.is_blacklisted ? 'error' : 'success'}
            />
            <p className="text-xs text-gray-500 mt-1">
              {isRtl
                ? `عضو منذ ${formatDate((member as any).member?.created_at)}`
                : `Member since ${formatDate((member as any).member?.created_at)}`}
            </p>
          </div>
        </div>
      </Card>

      <StatsGrid
        columns={4}
        stats={[
          { key: 'visits', label: isRtl ? 'إجمالي الزيارات' : 'Total Visits', value: member.stats?.total_checkins || 0, icon: 'fact_check', color: 'primary' },
          { key: '30d', label: isRtl ? 'آخر 30 يوم' : 'Last 30 Days', value: member.stats?.checkins_30d || 0, icon: 'calendar_month', color: 'info' },
          { key: '7d', label: isRtl ? 'هذا الأسبوع' : 'This Week', value: member.stats?.checkins_7d || 0, icon: 'today', color: 'secondary' },
          { key: 'loyalty', label: isRtl ? 'نقاط الولاء' : 'Loyalty Pts', value: member.loyalty?.points_balance || 0, icon: 'stars', color: 'warning' },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title={isRtl ? 'الاشتراكات' : 'Subscriptions'} icon="card_membership">
          {(member.subscriptions || []).length === 0 && (
            <p className="text-sm text-gray-400">{isRtl ? 'لا يوجد اشتراكات' : 'No subscriptions'}</p>
          )}
          {(member.subscriptions || []).map((sub: any, i: number) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{sub.plan_name}</p>
                <p className="text-xs text-gray-500">{sub.start_date} → {sub.end_date}</p>
              </div>
              <StatusBadge status={sub.status} variant={sub.status === 'active' ? 'success' : 'neutral'} />
            </div>
          ))}
        </Section>

        <Section title={isRtl ? 'آخر الزيارات' : 'Recent Attendance'} icon="fact_check">
          {(member.attendance || []).length === 0 && (
            <p className="text-sm text-gray-400">{isRtl ? 'لا توجد زيارات حديثة' : 'No recent visits'}</p>
          )}
          {(member.attendance || []).map((a: any, i: number) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-900">{formatDateTime(a.check_in_time)}</span>
              <span className="text-xs text-gray-500">{a.entry_method}</span>
            </div>
          ))}
        </Section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title={isRtl ? 'المدفوعات' : 'Payments'} icon="payments">
          {(member.payments || []).length === 0 && (
            <p className="text-sm text-gray-400">{isRtl ? 'لا توجد مدفوعات' : 'No payments'}</p>
          )}
          {(member.payments || []).map((p: any, i: number) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm text-gray-900">{p.description}</p>
                <p className="text-xs text-gray-500">{p.payment_method}</p>
              </div>
              <span className="text-sm font-bold text-gray-900">{money(p.amount)}</span>
            </div>
          ))}
        </Section>

        <Section title={isRtl ? 'الولاء والمستوى' : 'Loyalty & Tier'} icon="stars">
          <div className="flex items-center gap-3 py-2">
            <div>
              <p className="text-sm font-bold text-gray-900">
                {(member.loyalty?.points_balance || 0).toLocaleString('en-US')} {isRtl ? 'نقطة' : 'points'}
              </p>
              <p className="text-xs text-gray-500">
                {isRtl ? `المستوى: ${member.loyalty?.tier || 'N/A'}` : `Tier: ${member.loyalty?.tier || 'N/A'}`}
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

