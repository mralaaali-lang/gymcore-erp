// â”€â”€ Templates Tab â€” Predefined notification template cards â”€â”€
import { Plus, FileText } from '@phosphor-icons/react';
import { ChannelIcon, channelColors, defaultTemplates } from './notificationConstants';

interface TemplatesProps {
  t: (ar: string, en: string) => string;
  isRtl: boolean;
}

export default function NotificationTemplates({ t, isRtl }: TemplatesProps) {
  return (
    <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <FileText size={18} />
          {t('قوالب الإشعارات', 'Notification Templates')}
        </h2>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-petrol-light transition-colors"
        >
          <Plus size={16} />
          {t('قالب جديد', 'New Template')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {defaultTemplates.map((tmpl, i) => (
          <div key={i} className="p-4 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${channelColors[tmpl.channel] || 'bg-gray-500'} bg-opacity-20`}>
                <ChannelIcon channel={tmpl.channel} />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{isRtl ? tmpl.nameAr : tmpl.nameEn}</p>
                <p className="text-xs text-gray-500/70">{tmpl.channel}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">{isRtl ? tmpl.descAr : tmpl.descEn}</p>
            <div className="flex flex-wrap gap-1">
              {tmpl.vars.map((v) => (
                <span key={v} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-500">{`{${v}}`}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}