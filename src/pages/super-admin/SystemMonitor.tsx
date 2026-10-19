import { useState, useEffect, useRef } from 'react';
import { formatDateTime, formatTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getSystemStatus, type SystemMetricItem, type SystemEvent } from '../../services/api';
import {
  ArrowsClockwise as RefreshCw,
  ActivityIcon as Activity,
  Database,
  ComputerTower as Server,
  Bell,
  TrendUp as TrendingUp,
  TrendDown as TrendingDown,
  Minus,
  CheckCircle as CheckCircle2,
  Warning as AlertTriangle,
  XCircle,
  Clock,
  Cpu,
  HardDrives as HardDrive,
  WifiHigh as Wifi,
  ShieldWarning as ShieldAlert,
  ChartBar as BarChart3,
  Circle
} from '@phosphor-icons/react';
import PageHeader from '../../components/shared/PageHeader';
import Button from '../../components/ui/Button';

type TabKey = 'overview' | 'database' | 'server' | 'events';

const tabs: { key: TabKey; labelAr: string; labelEn: string; icon: React.ReactNode }[] = [
  { key: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview', icon: <Activity size={16} /> },
  { key: 'database', labelAr: 'قاعدة البيانات', labelEn: 'Database', icon: <Database size={16} /> },
  { key: 'server', labelAr: 'الخادم', labelEn: 'Server', icon: <Server size={16} /> },
  { key: 'events', labelAr: 'الأحداث', labelEn: 'Events', icon: <Bell size={16} /> },
];

const eventStyles: Record<string, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-800',
};

const eventIcons: Record<string, React.ReactNode> = {
  info: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <XCircle size={16} />,
};

function TrendBadge({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <TrendingUp size={14} className="text-green-600" />;
  if (trend === 'down') return <TrendingDown size={14} className="text-red-600" />;
  return <Minus size={14} className="text-gray-500/50" />;
}

export default function SystemMonitor() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const t = (ar: string, en: string) => (isRtl ? ar : en);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch, isStale } = useApiQuery(
    ['system-status'],
    () => getSystemStatus(),
    { refetchInterval: autoRefresh ? refreshInterval * 1000 : false },
  );

  const sysData = data?.data;

  // Auto-scroll events to bottom
  useEffect(() => {
    if (activeTab === 'events' && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sysData?.events, activeTab]);

  const formatDate = (dateStr: string) =>
    formatDateTime(dateStr);

  const formatBytes = (mb: number) => {
    if (mb > 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <PageHeader
        title={t('مراقبة النظام', 'System Monitor')}
        subtitle={t('لوحة أداء وصحة النظام العام', 'Global system health & performance dashboard')}
        icon="monitor_heart"
        actions={
          <Button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            variant="outline"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{t('تحديث', 'Refresh')}</span>
          </Button>
        }
      />
      <div className="flex items-center gap-3">
        {/* Auto-refresh toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={() => setAutoRefresh(!autoRefresh)}
            className="w-4 h-4 rounded border-gray-100 text-primary focus:ring-accent"
          />
          <span>{t('تحديث تلقائي', 'Auto-refresh')}</span>
          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-2 py-1 text-xs border border-gray-100 rounded-xl bg-white"
            >
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>120s</option>
            </select>
          )}
        </label>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
          <XCircle size={20} />
          <span>{t('فشل تحميل بيانات النظام', 'Failed to load system data')}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="mr-auto px-3 py-1 bg-red-100 hover:bg-red-200 rounded-lg text-sm font-medium transition-colors"
          >
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-3xl border shadow-sm border-gray-100 p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            <span>{isRtl ? tab.labelAr : tab.labelEn}</span>
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {isLoading && !sysData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-8 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-2 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* ========== OVERVIEW TAB ========== */}
      {activeTab === 'overview' && sysData && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sysData.metrics.map((m: SystemMetricItem) => {
              const barColor = m.usage > 80 ? 'bg-red-500' : m.usage > 60 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div
                  key={m.label}
                  className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-500 text-sm font-medium">
                      {m.label}
                    </span>
                    <TrendBadge trend={m.trend} />
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                      m.color.replace('bg-', 'bg-').replace('500', '100')
                    } ${m.color.replace('bg-', 'text-')}`}>
                      <span className="material-symbols-outlined text-xl">{m.icon}</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">{m.value}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-700 ${barColor}`}
                      style={{ width: `${Math.min(m.usage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Daily Check-ins Mini Chart */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 size={18} />
              {t('الحضور اليومي (آخر 7 أيام)', 'Daily Check-ins (Last 7 Days)')}
            </h2>
            {sysData.daily_checkins && sysData.daily_checkins.length > 0 ? (
              <div className="flex items-end gap-2 h-40">
                {sysData.daily_checkins.map((d: { date: string; count: number }, i: number) => {
                  const maxCount = Math.max(...sysData.daily_checkins.map((x: { count: number }) => x.count), 1);
                  const height = Math.max((d.count / maxCount) * 100, 5);
                  const dayName = formatDate(d.date);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-gray-900">{d.count}</span>
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-accent to-primary transition-all duration-500"
                        style={{ height: `${height}%`, minHeight: '4px' }}
                      />
                      <span className="text-xs text-gray-500/70">{dayName}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500/60 text-sm">
                {t('لا توجد بيانات حضور بعد', 'No check-in data yet')}
              </p>
            )}
          </div>

          {/* Recent Events Preview */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Bell size={18} />
                {t('آخر الأحداث', 'Recent Events')}
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('events')}
                className="text-sm text-primary hover:underline"
              >
                {t('عرض الكل', 'View All')}
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {sysData.events.length === 0 && (
                <p className="text-gray-500/60 text-sm">
                  {t('لا توجد أحداث حديثة', 'No recent events')}
                </p>
              )}
              {sysData.events.slice(0, 5).map((ev: SystemEvent) => (
                <div
                  key={ev.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${eventStyles[ev.type] || eventStyles.info}`}
                >
                  <span className="mt-0.5">{eventIcons[ev.type] || eventIcons.info}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.message}</p>
                    <p className="text-xs opacity-70 mt-0.5">
                      {formatDate(ev.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== DATABASE TAB ========== */}
      {activeTab === 'database' && sysData && (
        <div className="space-y-6">
          {/* Pool Status */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Database size={18} />
              {t('حالة اتصال قاعدة البيانات', 'Database Connection Pool')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('إجمالي الاتصالات', 'Total Connections'), value: sysData.database.pool_total, color: 'bg-blue-500' },
                { label: t('خامل', 'Idle'), value: sysData.database.pool_idle, color: 'bg-green-500' },
                { label: t('نشط', 'Active'), value: sysData.database.pool_active, color: 'bg-amber-500' },
                { label: t('بانتظار', 'Waiting'), value: sysData.database.pool_waiting, color: 'bg-purple-500' },
              ].map((item) => (
                <div key={item.label} className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-center">
                  <p className="text-3xl font-bold text-gray-900">{item.value}</p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-xs text-gray-500">{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table Stats */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 size={18} />
              {t('إحصائيات الجداول', 'Table Statistics')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-900">
                    <th className="text-right p-3 font-semibold">{t('المؤشر', 'Metric')}</th>
                    <th className="text-right p-3 font-semibold">{t('القيمة', 'Value')}</th>
                    <th className="text-right p-3 font-semibold">{t('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: t('إجمالي المنشآت', 'Total Gyms'), value: sysData.database.total_gyms.toString() },
                    { label: t('المنشآت النشطة', 'Active Gyms'), value: sysData.database.active_gyms.toString() },
                    { label: t('إجمالي الأعضاء', 'Total Members'), value: sysData.database.total_members.toString() },
                    { label: t('الأعضاء النشطين', 'Active Members'), value: sysData.database.active_members.toString() },
                    { label: t('إجمالي الموظفين', 'Total Staff'), value: sysData.database.total_staff.toString() },
                    { label: t('الاشتراكات النشطة', 'Active Subscriptions'), value: sysData.database.active_subscriptions.toString() },
                    { label: t('الحضور (24 ساعة)', 'Check-ins (24h)'), value: sysData.database.checkins_24h.toString() },
                    { label: t('محاولات فاشلة (24 ساعة)', 'Failed Logins (24h)'), value: sysData.database.failed_logins_24h.toString() },
                  ].map((row, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-3 text-gray-900 font-medium">{row.label}</td>
                      <td className="p-3 font-mono font-bold text-gray-900">{row.value}</td>
                      <td className="p-3">
                        {Number(row.value) > 0 ? (
                          <span className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
                            <Circle size={8} className="fill-green-500" />
                            {t('سليم', 'Healthy')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-gray-500/50 text-xs font-medium">
                            <Circle size={8} className="fill-gray-200" />
                            {t('فارغ', 'Empty')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========== SERVER TAB ========== */}
      {activeTab === 'server' && sysData && (
        <div className="space-y-6">
          {/* Server Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* System Info */}
            <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5 md:col-span-2">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Server size={18} />
                {t('معلومات النظام', 'System Information')}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: <Cpu size={16} />, label: t('المعالج', 'CPU'), value: `${sysData.server.cpu_count}x ${sysData.server.cpu_model}` },
                  { icon: <HardDrive size={16} />, label: t('الذاكرة', 'Memory'), value: `${sysData.server.free_mem_gb}GB / ${sysData.server.total_mem_gb}GB` },
                  { icon: <Clock size={16} />, label: t('وقت التشغيل', 'Uptime'), value: sysData.server.uptime },
                  { icon: <Wifi size={16} />, label: t('المضيف', 'Hostname'), value: sysData.server.hostname },
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <p className="font-semibold text-gray-900 text-sm truncate">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Memory Usage Card */}
            <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <HardDrive size={18} />
                {t('استخدام الذاكرة', 'Memory Usage')}
              </h2>
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-32 mb-4">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" style={{ stroke: 'hsl(var(--chart-track))' }} strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke={sysData.server.mem_usage_percent > 80 ? '#ef4444' : sysData.server.mem_usage_percent > 60 ? '#f97316' : '#22c55e'}
                      strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(sysData.server.mem_usage_percent / 100) * 213.63} 213.63`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-gray-900">{sysData.server.mem_usage_percent}%</span>
                  </div>
                </div>
                <div className="text-center">
                  <span className="text-xs text-gray-500">{t('مستخدم', 'Used')}: {(sysData.server.total_mem_gb - sysData.server.free_mem_gb).toFixed(1)}GB / {sysData.server.total_mem_gb}GB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Server Details Table */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Server size={18} />
              {t('تفاصيل الخادم', 'Server Details')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-900">
                    <th className="text-right p-3 font-semibold">{t('الخاصية', 'Property')}</th>
                    <th className="text-right p-3 font-semibold">{t('القيمة', 'Value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { property: t('اسم المضيف', 'Hostname'), value: sysData.server.hostname },
                    { property: t('المنصة', 'Platform'), value: `${sysData.server.platform} (${sysData.server.arch})` },
                    { property: t('إصدار Node.js', 'Node.js Version'), value: sysData.server.node_version },
                    { property: t('وقت التشغيل', 'Uptime'), value: sysData.server.uptime },
                    { property: t('المعالج', 'CPU'), value: `${sysData.server.cpu_count}x ${sysData.server.cpu_model}` },
                    { property: t('الحمل المتوسط', 'Load Average'), value: sysData.server.load_avg.map((v: number) => v.toFixed(2)).join(' / ') },
                    { property: t('الذاكرة الكلية', 'Total Memory'), value: `${sysData.server.total_mem_gb} GB` },
                    { property: t('الذاكرة الحرة', 'Free Memory'), value: `${sysData.server.free_mem_gb} GB` },
                    { property: t('استخدام الذاكرة', 'Memory Usage'), value: `${sysData.server.mem_usage_percent}%` },
                    { property: t('مساحة التخزين', 'Storage Used'), value: formatBytes(sysData.server.storage_used_mb) },
                  ].map((row, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-3 text-gray-900 font-medium">{row.property}</td>
                      <td className="p-3 text-gray-500 font-mono text-xs">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========== EVENTS TAB ========== */}
      {activeTab === 'events' && sysData && (
        <div className="space-y-4">
          {/* Event Filters / Summary */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Bell size={18} />
                {t('سجل الأحداث', 'Event Log')}
              </h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  {t('معلومات', 'Info')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  {t('تحذير', 'Warning')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  {t('خطأ', 'Error')}
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {sysData.events.length === 0 && (
                <p className="text-gray-500/60 text-sm py-8 text-center">
                  {t('لا توجد أحداث في السجل', 'No events in the log')}
                </p>
              )}
              {sysData.events.map((ev: SystemEvent) => (
                <div
                  key={ev.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${eventStyles[ev.type] || eventStyles.info}`}
                >
                  <span className="mt-0.5">{eventIcons[ev.type] || eventIcons.info}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{ev.message}</p>
                    <p className="text-xs opacity-70 mt-0.5">
                      {formatDate(ev.timestamp)}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    ev.type === 'error' ? 'bg-red-100 text-red-700' :
                    ev.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {ev.type.toUpperCase()}
                  </span>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          </div>

          {/* Recent Errors Section */}
          {sysData.recent_errors && sysData.recent_errors.length > 0 && (
            <div className="bg-white rounded-3xl border shadow-sm border-red-200 p-5">
              <h2 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
                <ShieldAlert size={18} />
                {t('الأخطاء الأخيرة', 'Recent Errors')}
              </h2>
              <div className="space-y-2">
                {sysData.recent_errors.map((err: { message: string; timestamp: string }, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
                    <XCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{err.message}</p>
                      <p className="text-xs opacity-70 mt-0.5">{formatDate(err.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer — last updated timestamp */}
      <div className="mt-6 text-center text-xs text-gray-500/50">
        {t('آخر تحديث', 'Last updated')}: {formatTime(new Date())}
        {isStale && (
          <span className="ml-2 text-amber-600 flex items-center gap-1 inline-flex">
            <AlertTriangle size={12} />
            {t('البيانات قديمة', 'stale data')}
          </span>
        )}
      </div>
    </div>
  );
}