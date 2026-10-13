import { useState, useCallback } from 'react';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { listWorkflows, updateWorkflow as apiUpdateWorkflow, triggerWorkflow as apiTriggerWorkflow, type WorkflowDefinition } from '../../services/api';
import { useApiQuery } from '../../hooks/useApiQuery';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';

export default function WorkflowAutomation() {
  const { language } = useApp();
  const { showToast } = useToast();
  const isRtl = language === 'ar';
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const { data: workflows, isLoading, refetch } = useApiQuery<WorkflowDefinition[]>(
    ['workflows'],
    () => listWorkflows().then((r) => r.data),
    { staleTime: 30_000 }
  );

  const handleToggle = useCallback(async (wf: WorkflowDefinition) => {
    try {
      await apiUpdateWorkflow(wf.id, !wf.enabled);
      showToast(isRtl ? `تم ${!wf.enabled ? 'تفعيل' : 'إيقاف'} ${wf.name_ar}` : `${wf.name} ${!wf.enabled ? 'enabled' : 'disabled'}`, 'success');
      refetch();
    } catch {
      showToast(isRtl ? 'فشل تحديث سير العمل' : 'Failed to update workflow', 'error');
    }
  }, [isRtl, showToast, refetch]);

  const handleTrigger = useCallback(async (wf: WorkflowDefinition) => {
    setTriggeringId(wf.id);
    try {
      await apiTriggerWorkflow(wf.id);
      showToast(isRtl ? `تم تشغيل ${wf.name_ar}` : `${wf.name} triggered`, 'success');
      refetch();
    } catch {
      showToast(isRtl ? 'فشل تشغيل سير العمل' : 'Failed to trigger workflow', 'error');
    } finally {
      setTriggeringId(null);
    }
  }, [isRtl, showToast, refetch]);

  if (isLoading) {
    return <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'أتمتة سير العمل' : 'Workflow Automation'}
        subtitle={isRtl ? 'إدارة قواعد وسير العمل التلقائية' : 'Manage automation rules and workflows'}
        icon="account_tree"
      />

      {(!workflows || workflows.length === 0) ? (
        <div className="text-center py-20 text-gray-500/50">
          <span className="material-symbols-outlined text-5xl block mb-3">settings</span>
          <p>{isRtl ? 'لا توجد تعريفات لسير العمل' : 'No workflow definitions found'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className={`bg-white rounded-3xl border shadow-sm p-5 transition-all ${
                wf.enabled ? 'border-emerald-500 shadow-sm' : 'border-gray-100 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${wf.enabled ? 'bg-emerald-500' : 'bg-gray-100'}`}>
                    <span className="material-symbols-outlined text-white text-lg">{wf.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{isRtl ? wf.name_ar : wf.name}</h3>
                    <p className="text-xs text-gray-500">
                      {isRtl ? 'آخر تشغيل: ' : 'Last: '}
                      {wf.last_triggered_at
                        ? formatDateTime(wf.last_triggered_at)
                        : (isRtl ? 'لم يتم التشغيل بعد' : 'Never triggered')}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-4">{isRtl ? wf.description_ar : wf.description}</p>
              <div className="flex items-center justify-between">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wf.enabled}
                    onChange={() => handleToggle(wf)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-100 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
                <button
                  onClick={() => handleTrigger(wf)}
                  disabled={triggeringId === wf.id}
                  className="text-xs text-emerald-600 hover:underline disabled:opacity-50"
                >
                  {triggeringId === wf.id ? '...' : (isRtl ? 'تشغيل الآن' : 'Trigger Now')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
