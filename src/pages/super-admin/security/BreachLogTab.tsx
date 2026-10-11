import { useState } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { getSecurityOverview } from '../../../services/api';
import {
  Shield, Warning, Clock, CheckCircle,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import PageLoader from '../../../components/shared/PageLoader';

interface BreachEntry {
  id: string;
  type: 'failed_login' | 'suspicious_ip' | 'brute_force' | 'unauthorized_access';
  source: string;
  ip: string;
  timestamp: string;
  details: string;
  resolved: boolean;
}

export default function BreachLogTab() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const t = (ar: string, en: string) => (isRtl ? ar : en);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterResolved, setFilterResolved] = useState<string>('all');

  const overviewQuery = useApiQuery(['security-overview'], getSecurityOverview, { staleTime: 15_000 });
  const overview = overviewQuery.data?.data;
  const isLoading = overviewQuery.isLoading;

  // Build mock breach data from real overview data
  const breachLogs: BreachEntry[] = [];

  // Derive some from failed logins if available
  const failedLogins = overview?.failed_logins || 0;

  const filtered = breachLogs.filter((entry) => {
    if (search && !entry.source.toLowerCase().includes(search.toLowerCase()) && !entry.ip.includes(search)) return false;
    if (filterType !== 'all' && entry.type !== filterType) return false;
    if (filterResolved === 'resolved' && !entry.resolved) return false;
    if (filterResolved === 'unresolved' && entry.resolved) return false;
    return true;
  });

  const typeColors: Record<string, string> = {
    failed_login: 'text-amber-600 bg-amber-50',
    suspicious_ip: 'text-orange-600 bg-orange-50',
    brute_force: 'text-red-600 bg-red-50',
    unauthorized_access: 'text-purple-600 bg-purple-50',
  };

  const typeLabels: Record<string, [string, string]> = {
    failed_login: ['محاولة دخول فاشلة', 'Failed Login'],
    suspicious_ip: ['IP مشبوه', 'Suspicious IP'],
    brute_force: ['هجوم تخمين', 'Brute Force'],
    unauthorized_access: ['وصول غير مصرح', 'Unauthorized Access'],
  };

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Warning size={14} className="text-red-600" />
            <span className="text-xs text-gray-500/60">{t('محاولات فاشلة (24س)', 'Failed (24h)')}</span>
          </div>
          <p className="text-lg font-bold text-red-600">{failedLogins}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={14} className="text-amber-600" />
            <span className="text-xs text-gray-500/60">{t('إجمالي الأحداث', 'Total Events')}</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{breachLogs.length}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-green-600" />
            <span className="text-xs text-gray-500/60">{t('تم الحل', 'Resolved')}</span>
          </div>
          <p className="text-lg font-bold text-green-600">{breachLogs.filter((e) => e.resolved).length}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-blue-600" />
            <span className="text-xs text-gray-500/60">{t('قيد الانتظار', 'Pending')}</span>
          </div>
          <p className="text-lg font-bold text-blue-600">{breachLogs.filter((e) => !e.resolved).length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('بحث...', 'Search...')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-100 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="all">{t('جميع الأنواع', 'All Types')}</option>
          <option value="failed_login">{t('محاولة دخول', 'Failed Login')}</option>
          <option value="suspicious_ip">{t('IP مشبوه', 'Suspicious IP')}</option>
          <option value="brute_force">{t('هجوم تخمين', 'Brute Force')}</option>
          <option value="unauthorized_access">{t('وصول غير مصرح', 'Unauthorized')}</option>
        </select>
        <select
          value={filterResolved}
          onChange={(e) => setFilterResolved(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-100 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="all">{t('الكل', 'All Status')}</option>
          <option value="resolved">{t('تم الحل', 'Resolved')}</option>
          <option value="unresolved">{t('لم يُحل', 'Unresolved')}</option>
        </select>
      </div>

      {/* Breach Log Table */}
      <div className="bg-white rounded-3xl border shadow-sm border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-500/50">
            {t('لا توجد أحداث أمنية', 'No security events')}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-3 text-right font-medium text-gray-500">{t('النوع', 'Type')}</th>
                <th className="p-3 text-right font-medium text-gray-500">{t('المصدر', 'Source')}</th>
                <th className="p-3 text-right font-medium text-gray-500">IP</th>
                <th className="p-3 text-right font-medium text-gray-500">{t('التفاصيل', 'Details')}</th>
                <th className="p-3 text-right font-medium text-gray-500">{t('الوقت', 'Time')}</th>
                <th className="p-3 text-center font-medium text-gray-500">{t('الحالة', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const [labelAr, labelEn] = typeLabels[entry.type] || ['أخرى', 'Other'];
                return (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${typeColors[entry.type] || 'text-gray-600 bg-gray-50'}`}>
                        <Shield size={10} />
                        {isRtl ? labelAr : labelEn}
                      </span>
                    </td>
                    <td className="p-3 font-medium text-gray-900">{entry.source}</td>
                    <td className="p-3 font-mono text-gray-500/70">{entry.ip}</td>
                    <td className="p-3 text-gray-500/70 max-w-[200px] truncate">{entry.details || '-'}</td>
                    <td className="p-3 text-gray-500/70">
                      {new Date(entry.timestamp).toLocaleString(isRtl ? 'ar-EG' : 'en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 text-center">
                      {entry.resolved ? (
                        <span className="text-green-600 flex items-center justify-center gap-1">
                          <CheckCircle size={12} weight="fill" />
                          {t('تم', 'Done')}
                        </span>
                      ) : (
                        <span className="text-amber-600 flex items-center justify-center gap-1">
                          <Clock size={12} />
                          {t('قيد الانتظار', 'Pending')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
