import { useState } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import PageLoader from '../../../components/shared/PageLoader';
import Button from '../../../components/ui/Button';
import StatusBadge from '../../../components/ui/StatusBadge';
import { useApiQuery } from '../../../hooks/useApiQuery';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';

interface BackupEntry {
  folder: string;
  timestamp: string;
  sizeBytes: number;
  totalRecords: number;
  summary: Record<string, number>;
}

/**
 * BackupTab — §27: merged /admin/backup (TenantBackup) into the Settings hub.
 * Renders inside SettingsPage's content Card, so no page-level shell here.
 */
export default function BackupTab() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [actionMsg, setActionMsg] = useState('');
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: backups, isLoading } = useApiQuery<BackupEntry[]>(
    ['backups'],
    () => api.get('/admin/backup/list').then(r => r.data.data || []),
    { staleTime: 60_000 }
  );

  async function handleCreateBackup() {
    setCreating(true);
    setActionMsg('');
    try {
      const res = await api.post('/admin/backup/create');
      setActionMsg(res.data.message || 'Backup created');
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    } catch (err: any) {
      setActionMsg(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(folder: string) {
    if (!window.confirm(isRtl
      ? `استعادة النسخة "${folder}"؟ سيتم استبدال بيانات الصالة الحالية بمحتوى النسخة.`
      : `Restore backup "${folder}"? Current gym data will be replaced by the backup contents.`)) {
      return;
    }
    setRestoring(folder);
    setActionMsg('');
    try {
      const res = await api.post('/admin/backup/restore', { folder });
      setActionMsg(res.data.message || 'Backup restored');
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    } catch (err: any) {
      setActionMsg(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setRestoring(null);
    }
  }

  function handleDownload(folder: string) {
    const root = (import.meta.env.VITE_API_URL || '').replace(/\/api\/v1$/, '');
    window.open(`${root}/admin/backup/download/${folder}`, '_blank');
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  if (isLoading) return <PageLoader variant="skeleton" rows={3} />;

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          {isRtl ? 'نسخ احتياطية معزولة لبيانات الصالة' : 'Isolated tenant data backups'}
        </p>
        <Button variant="primary" onClick={handleCreateBackup} disabled={creating}>
          <span className="material-symbols-outlined text-lg">{creating ? 'progress_activity' : 'add'}</span>
          {creating
            ? (isRtl ? 'جارٍ الإنشاء...' : 'Creating...')
            : (isRtl ? 'إنشاء نسخة احتياطية' : 'Create Backup')}
        </Button>
      </div>

      {actionMsg && (
        <div className="text-sm w-fit">
          <StatusBadge
            status={actionMsg}
            variant={actionMsg.startsWith('Error') ? 'error' : 'success'}
          />
        </div>
      )}

      {(backups || []).length === 0 ? (
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">backup</span>
          <p className="text-sm text-gray-500">{isRtl ? 'لا توجد نسخ احتياطية بعد' : 'No backups yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(backups || []).map((b) => (
            <div key={b.folder} className="border border-gray-100 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-mono text-sm text-gray-900">{b.folder}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(b.timestamp).toLocaleString(isRtl ? 'ar-EG' : 'en-US')} &middot; {formatBytes(b.sizeBytes)} &middot; {b.totalRecords} {isRtl ? 'سجل' : 'records'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleRestore(b.folder)}
                    disabled={restoring === b.folder}
                    className="text-emerald-600 hover:underline text-sm font-medium disabled:opacity-40"
                  >
                    {restoring === b.folder
                      ? (isRtl ? 'جارٍ الاستعادة...' : 'Restoring...')
                      : (isRtl ? 'استعادة' : 'Restore')}
                  </button>
                  <button
                    onClick={() => handleDownload(b.folder)}
                    className="text-gray-500 hover:underline text-sm font-medium"
                  >
                    {isRtl ? 'تحميل' : 'Download'}
                  </button>
                </div>
              </div>
              {b.summary && Object.keys(b.summary).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(b.summary).map(([table, count]) => (
                    <StatusBadge key={table} status={`${table}: ${count}`} variant="neutral" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
