// â”€â”€ Channel Configuration Form â€” Shared for email/sms/push/webhook/inapp â”€â”€
import { useState } from 'react';
import { Power, PaperPlaneRight, FloppyDisk, Spinner, Eye, EyeSlash } from '@phosphor-icons/react';
import { getChannelFields, type ChannelField } from './notificationConstants';
import type { UseMutationResult } from '@tanstack/react-query';

interface ChannelFormProps {
  channel: string;
  config: Record<string, unknown>;
  isRtl: boolean;
  t: (ar: string, en: string) => string;
  settings: Record<string, { is_enabled: boolean; config: Record<string, unknown> }> | undefined;
  updateMutation: UseMutationResult<unknown, Error, { channel: string; payload: Record<string, unknown> }>;
  testMutation: UseMutationResult<unknown, Error, string>;
  onSave: (channel: string, payload: Record<string, unknown>) => void;
}

export default function NotificationChannelForm({
  channel, config, isRtl, t, settings, updateMutation, testMutation, onSave,
}: ChannelFormProps) {
  const fields = getChannelFields(channel);
  const isEnabled = settings?.[channel]?.is_enabled ?? false;

  // Local form state for this channel
  const [formState, setFormState] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      initial[f.key] = String(config[f.key] ?? '');
    }
    return initial;
  });

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const updateField = (key: string, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const togglePassword = (fieldKey: string) => {
    setShowPasswords((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  return (
    <div className="space-y-5">
      {/* Toggle + Test */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSave(channel, { is_enabled: !isEnabled })}
            disabled={updateMutation.isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              isEnabled
                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isEnabled ? <Power size={16} /> : <Power size={16} />}
            {isEnabled ? t('مفعل', 'Enabled') : t('معطل', 'Disabled')}
          </button>
          <span className={`w-2.5 h-2.5 rounded-full ${isEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
        </div>
        <button
          type="button"
          onClick={() => testMutation.mutate(channel)}
          disabled={testMutation.isPending || !isEnabled}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-petrol-light transition-colors disabled:opacity-50"
        >
          {testMutation.isPending ? <Spinner size={16} className="animate-spin" /> : <PaperPlaneRight size={16} />}
          {t('إرسال اختبار', 'Send Test')}
        </button>
      </div>

      {/* Config Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f: ChannelField) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500">{isRtl ? f.labelAr : f.labelEn}</label>
            <div className="relative">
              <input
                type={f.isPassword && !showPasswords[f.key] ? 'password' : f.type || 'text'}
                value={formState[f.key] || ''}
                onChange={(e) => updateField(f.key, e.target.value)}
                placeholder={f.isPassword ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : undefined}
                dir={isRtl ? 'rtl' : 'ltr'}
                className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
              />
              {f.isPassword && (
                <button
                  type="button"
                  onClick={() => togglePassword(f.key)}
                  className="absolute inset-y-0 end-0 px-3 flex items-center text-gray-500/60 hover:text-gray-500"
                >
                  {showPasswords[f.key] ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const payload: Record<string, unknown> = { config: { ...config, ...formState } };
            onSave(channel, payload);
          }}
          disabled={updateMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-xl font-bold hover:bg-[#005a3e] transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? <Spinner size={16} className="animate-spin" /> : <FloppyDisk size={16} />}
          {t('حفظ الإعدادات', 'Save Settings')}
        </button>
      </div>
    </div>
  );
}