import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  getNotificationHistory,
  markNotificationRead,
  getNotifications,
  markGymNotificationRead,
} from '../../services/api';
import { Bell as BellIcon } from 'lucide-react';

interface FeedItem {
  id: string;
  title: string;
  body: string;
  timeIso: string | null;
  isNew: boolean;
  channel: string;
}

const channelIcon: Record<string, string> = {
  email: 'mail',
  sms: 'sms',
  push: 'notifications',
  webhook: 'webhook',
  in_app: 'notifications',
  inapp: 'notifications',
  alert: 'warning',
  reminder: 'schedule',
  info: 'info',
  warning: 'warning',
};

function timeAgo(iso: string | null, t: (k: string, o?: any) => string): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t('header.justNow');
  if (mins < 60) return t('header.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('header.hoursAgo', { n: hours });
  return t('header.daysAgo', { n: Math.floor(hours / 24) });
}

export default function TopNav() {
  const { role, language, setLanguage } = useApp();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const isPlatform = role === 'super-admin';

  // ── Live notification feed (always fresh: 30s polling + refetch on open) ──
  const { data: platformRes } = useApiQuery(
    ['platform', 'notifications', 'latest'],
    () => getNotificationHistory({ limit: 8 }),
    { staleTime: 15_000, refetchInterval: 30_000, retry: false, enabled: isPlatform }
  );
  const { data: gymRes } = useApiQuery(
    ['gym', 'notifications', 'latest'],
    () => getNotifications(),
    { staleTime: 15_000, refetchInterval: 30_000, retry: false, enabled: !isPlatform }
  );

  const items: FeedItem[] = useMemo(() => {
    if (isPlatform) {
      return ((platformRes as any)?.data ?? []).map((n: any) => ({
        id: n.id,
        title: n.title || n.channel,
        body: n.content || '',
        timeIso: n.sent_at || n.created_at,
        isNew: n.status === 'pending' || n.status === 'sent',
        channel: n.channel,
      }));
    }
    const rows = Array.isArray(gymRes) ? gymRes : (gymRes as any)?.data ?? [];
    return rows.slice(0, 8).map((n: any) => ({
      id: n.id,
      title: n.title || n.notification_type,
      body: n.body || '',
      timeIso: n.created_at,
      isNew: !!n.is_unread,
      channel: n.notification_type,
    }));
  }, [isPlatform, platformRes, gymRes]);

  const unread = items.filter((n) => n.isNew);

  const readMut = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (isPlatform) {
        await markNotificationRead(id);
      } else {
        await markGymNotificationRead(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'notifications'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'notifications'] });
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const historyPath = isPlatform ? '/super-admin/notifications' : '/admin/notifications';

  return (
    <header className="bg-gradient-to-br from-petrol-dark via-petrol to-petrol-light w-full sticky top-0 z-30 shrink-0">
      <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop py-5 md:py-6">
        {/* Left (geometric left, per spec): page title only — the gym name,
            date and plan now live in the sidebar brand block (§33أ-تنظيف),
            so repeating them here was the duplicate the owner flagged. */}
        <div>
          <h1 className="text-headline-md md:text-headline-lg font-bold text-white tracking-tight">
            {t('sidebar.dashboard')}
          </h1>
        </div>

        {/* Right: language toggle + "What's new?" pill with live unread badge */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
            title={language === 'ar' ? 'English' : 'العربية'}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white rounded-full px-3.5 py-2.5 text-label-md font-bold transition-all duration-200"
          >
            <span className="material-symbols-outlined text-lg">language</span>
            <span>{language === 'ar' ? 'EN' : 'عربي'}</span>
          </button>
        <div className="relative" ref={boxRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="relative flex items-center gap-2 bg-white text-on-surface rounded-full pl-4 pr-3 py-2.5 text-label-md font-bold shadow-sm hover:shadow-md transition-all duration-200"
          >
            <span>{isPlatform ? t('nav.notifications') : t('header.whatsNew')}</span>
            {unread.length > 0 && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold">
                {unread.length > 99 ? '99+' : unread.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-surface-container-lowest border border-surface-variant rounded-2xl shadow-lg z-50">
              <div className="p-4 border-b border-surface-variant flex items-center justify-between gap-2 sticky top-0 bg-surface-container-lowest">
                <h3 className="font-label-md text-on-surface flex items-center gap-2">
                  <BellIcon size={16} className="text-petrol" />
                  {isPlatform ? t('nav.notifications') : t('header.whatsNew')}
                </h3>
                {unread.length > 0 && (
                  <button
                    type="button"
                    onClick={() => unread.forEach((n) => readMut.mutate(n.id))}
                    className="text-caption text-primary hover:underline"
                  >
                    {t('header.markAllRead')}
                  </button>
                )}
              </div>
              {items.length === 0 ? (
                <div className="px-4 py-6 text-center text-on-surface-variant text-caption">
                  {t('header.noUpdates')}
                </div>
              ) : (
                <ul className="divide-y divide-surface-variant">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (n.isNew) readMut.mutate(n.id);
                        }}
                        className="w-full text-start px-4 py-3 flex items-start gap-3 hover:bg-surface-container-low transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg text-petrol shrink-0 mt-0.5">
                          {channelIcon[n.channel] ?? 'notifications'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-label-sm font-semibold text-on-surface truncate">
                            {n.title}
                          </span>
                          <span className="block text-caption text-on-surface-variant truncate">
                            {n.body}
                          </span>
                          <span className="block text-caption text-on-surface-variant/70 mt-0.5">
                            {timeAgo(n.timeIso, t)}
                          </span>
                        </span>
                        {n.isNew && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to={historyPath}
                onClick={() => setOpen(false)}
                className="block text-center px-4 py-3 text-label-sm font-semibold text-primary hover:bg-surface-container-low border-t border-surface-variant transition-colors"
              >
                {t('header.viewAll')}
              </Link>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}
