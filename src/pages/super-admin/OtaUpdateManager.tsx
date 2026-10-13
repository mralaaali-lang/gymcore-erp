import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { formatDateTime } from '../../utils/date';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';

interface VersionInfo {
  folder: string;
  timestamp: string;
  version: string;
  sizeBytes: number;
}

interface OtaStatus {
  currentVersion: string;
  totalBackups: number;
  totalSizeBytes: number;
  versions: VersionInfo[];
}

export default function OtaUpdateManager() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [error] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [buildCmd, setBuildCmd] = useState('npm run build');
  const [actionMsg, setActionMsg] = useState('');
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useApiQuery<OtaStatus>(
    ['ota-status'],
    () => api.get('/admin/ota/status').then(r => r.data),
    { staleTime: 60_000 }
  );

  async function handleBackup() {
    try {
      const res = await api.post('/admin/ota/backup', { version: `manual_v${Date.now()}` });
      setActionMsg(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['ota-status'] });
    } catch (err: any) {
      setActionMsg(`Error: ${err.response?.data?.error || err.message}`);
    }
  }

  async function handleDeploy() {
    if (!deployUrl) { setActionMsg('Please enter a package URL'); return; }
    try {
      const res = await api.post('/admin/ota/deploy', { packageUrl: deployUrl, buildCommand: buildCmd });
      setActionMsg(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['ota-status'] });
    } catch (err: any) {
      setActionMsg(`Error: ${err.response?.data?.error || err.message}`);
    }
  }

  async function handleRollback(folder: string) {
    try {
      const res = await api.post('/admin/ota/rollback', { folder });
      setActionMsg(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['ota-status'] });
    } catch (err: any) {
      setActionMsg(`Error: ${err.response?.data?.error || err.message}`);
    }
  }

  async function handleDelete(folder: string) {
    try {
      const res = await api.post('/admin/ota/delete', { folder });
      setActionMsg(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['ota-status'] });
    } catch (err: any) {
      setActionMsg(`Error: ${err.response?.data?.error || err.message}`);
    }
  }

  const [armingReset, setArmingReset] = useState(false);
  const { data: resetStatus } = useApiQuery<{ state?: string; step?: string; logTail?: string[] }>(
    ['ota-reset-status'],
    () => api.get('/admin/ota/reset/status').then(r => r.data.data),
    { staleTime: 5_000, refetchInterval: 5000, retry: false }
  );
  async function handleReset() {
    if (!armingReset) {
      setArmingReset(true);
      setActionMsg(isRtl
        ? 'تحذير: سيتم مسح قاعدة البيانات وإعادة بنائها بالكامل (10 صالات تجريبية). اضغط الزر مرة أخرى خلال 10 ثوانٍ للتأكيد.'
        : 'Warning: this wipes and rebuilds the whole database (10 demo gyms). Press again within 10 seconds to confirm.');
      setTimeout(() => setArmingReset(false), 10000);
      return;
    }
    setArmingReset(false);
    try {
      const res = await api.post('/admin/ota/reset');
      setActionMsg(res.data.message);
    } catch (err: any) {
      setActionMsg(`Error: ${err.response?.data?.error || err.message}`);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  if (isLoading) return <div className="p-6 bg-gray-50 min-h-screen"><PageLoader variant="skeleton" rows={3} /></div>;

  const versionColumns = [
    { key: 'folder', label: isRtl ? 'المجلد' : 'Folder' },
    { key: 'version', label: isRtl ? 'النسخة' : 'Version' },
    { key: 'date', label: isRtl ? 'التاريخ' : 'Date' },
    { key: 'size', label: isRtl ? 'الحجم' : 'Size' },
    { key: 'actions', label: isRtl ? 'إجراءات' : 'Actions' },
  ];
  const versionRows = (status?.versions ?? []).map((v) => ({
    folder: v.folder,
    version: v.version,
    date: formatDateTime(v.timestamp),
    size: formatBytes(v.sizeBytes),
    actions: (
      <span className="flex gap-2">
        <button onClick={() => handleRollback(v.folder)} className="text-emerald-600 hover:underline text-xs">
          {isRtl ? 'استرجاع' : 'Rollback'}
        </button>
        <button onClick={() => handleDelete(v.folder)} className="text-red-600 hover:underline text-xs">
          {isRtl ? 'حذف' : 'Delete'}
        </button>
      </span>
    ),
  }));

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'مدير التحديثات (OTA)' : 'OTA Update Manager'}
        subtitle={isRtl ? 'نظام التحديثات البرمجية والنسخ الاحتياطي' : 'Over-the-air update & backup system'}
        icon="system_update"
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl text-sm">{error}</div>}
      {actionMsg && <div className="bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-2xl text-sm">{actionMsg}</div>}

      {/* Status Cards */}
      {status && (
        <StatsGrid
          columns={4}
          stats={[
            { key: 'ver', label: isRtl ? 'الإصدار الحالي' : 'Current Version', value: status.currentVersion, icon: 'new_releases', color: 'primary' },
            { key: 'backups', label: isRtl ? 'إجمالي النسخ' : 'Total Backups', value: status.totalBackups, icon: 'backup', color: 'info' },
            { key: 'size', label: isRtl ? 'الحجم الإجمالي' : 'Total Size', value: formatBytes(status.totalSizeBytes), icon: 'storage', color: 'warning' },
            { key: 'latest', label: isRtl ? 'آخر نسخة' : 'Latest Backup', value: status.versions?.[0]?.folder || '-', icon: 'history', color: 'primary' },
          ]}
        />
      )}

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Manual Backup */}
        <Card>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{isRtl ? 'نسخ احتياطي يدوي' : 'Manual Backup'}</h2>
            <p className="text-sm text-gray-500">{isRtl ? 'إنشاء نسخة احتياطية في الخادم الأساسي قبل التحديث' : 'Create a codebase backup before deploying updates'}</p>
            <Button onClick={handleBackup} variant="primary">
              {isRtl ? 'إنشاء نسخة احتياطية' : 'Create Backup'}
            </Button>
          </div>
        </Card>

        {/* Deploy */}
        <Card>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{isRtl ? 'نشر تحديث جديد' : 'Deploy Update'}</h2>
            <input
              type="text"
              className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm"
              placeholder={isRtl ? 'رابط الحزمة (tar.gz)' : 'Package URL (tar.gz)'}
              value={deployUrl}
              onChange={(e) => setDeployUrl(e.target.value)}
            />
            <input
              type="text"
              className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm"
              placeholder={isRtl ? 'أمر البناء (npm run build)' : 'Build command'}
              value={buildCmd}
              onChange={(e) => setBuildCmd(e.target.value)}
            />
            <Button onClick={handleDeploy} variant="primary">
              {isRtl ? 'نشر التحديث' : 'Deploy'}
            </Button>
          </div>
        </Card>

        {/* Full Project Reset */}
        <Card>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-red-600">{isRtl ? 'إعادة ضبط المشروع' : 'Reset Project'}</h2>
            <p className="text-sm text-gray-500">{isRtl ? 'مسح قاعدة البيانات وإعادة بنائها (ترحيلات + 10 صالات + أدمن) — للبيئة المحلية فقط' : 'Wipe and rebuild the database (migrations + 10 gyms + admin) — local environment only'}</p>
            <Button onClick={handleReset} variant="primary" className={armingReset ? '!bg-red-600 hover:!bg-red-700' : ''}>
              {armingReset
                ? (isRtl ? 'اضغط مرة أخرى للتأكيد!' : 'Press again to confirm!')
                : (isRtl ? 'إعادة ضبط' : 'Reset')}
            </Button>
            {resetStatus && (resetStatus.state === 'running' || resetStatus.state === 'starting') && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800">
                {isRtl ? `جارٍ التصفير... (${resetStatus.step || ''})` : `Reset running... (${resetStatus.step || ''})`}
              </div>
            )}
            {resetStatus?.state === 'done' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-sm text-emerald-700">
                {isRtl ? 'اكتمل التصفير — حدّث الصفحة وسجّل الدخول مجدداً' : 'Reset complete — refresh and log in again'}
              </div>
            )}
            {resetStatus?.state === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-700">
                {(resetStatus as any).error || (isRtl ? 'فشل التصفير — راجع السجل' : 'Reset failed — see log')}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Version History */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-4">{isRtl ? 'سجل النسخ الاحتياطية' : 'Backup Version History'}</h2>
        <DataTable columns={versionColumns} data={versionRows} />
      </Card>
    </div>
  );
}


