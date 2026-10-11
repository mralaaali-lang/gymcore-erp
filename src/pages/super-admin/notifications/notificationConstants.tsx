// â”€â”€ Shared constants, types, and utility components for NotificationsEngine â”€â”€
import type { ReactNode } from 'react';
import { Bell, Envelope, ChatText, DeviceMobile, WebhooksLogo, ChartBar, FileText, ClockCounterClockwise } from '@phosphor-icons/react';

// â”€â”€ Tab Types â”€â”€
export type TabKey = 'overview' | 'email' | 'sms' | 'push' | 'webhook' | 'inapp' | 'history' | 'templates';

interface TabDef {
  key: TabKey;
  labelAr: string;
  labelEn: string;
  icon: ReactNode;
}

export const tabs: TabDef[] = [
  { key: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview', icon: <ChartBar size={16} /> },
  { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', icon: <Envelope size={16} /> },
  { key: 'sms', labelAr: 'الرسائل النصية', labelEn: 'SMS', icon: <ChatText size={16} /> },
  { key: 'push', labelAr: 'إشعارات الجوال', labelEn: 'Push', icon: <DeviceMobile size={16} /> },
  { key: 'webhook', labelAr: 'Webhooks', labelEn: 'Webhooks', icon: <WebhooksLogo size={16} /> },
  { key: 'inapp', labelAr: 'داخل التطبيق', labelEn: 'In-App', icon: <Bell size={16} /> },
  { key: 'history', labelAr: 'السجل', labelEn: 'History', icon: <ClockCounterClockwise size={16} /> },
  { key: 'templates', labelAr: 'القوالب', labelEn: 'Templates', icon: <FileText size={16} /> },
];

// â”€â”€ Channel Visual Mapping â”€â”€
export const channelColors: Record<string, string> = {
  email: 'bg-blue-500',
  sms: 'bg-green-500',
  push: 'bg-purple-500',
  webhook: 'bg-amber-500',
  in_app: 'bg-rose-500',
};

export const channelLabels: Record<string, Record<string, string>> = {
  email: { ar: 'البريد الإلكتروني', en: 'Email' },
  sms: { ar: 'الرسائل النصية', en: 'SMS' },
  push: { ar: 'إشعارات الجوال', en: 'Push Notifications' },
  webhook: { ar: 'Webhooks', en: 'Webhooks' },
  in_app: { ar: 'داخل التطبيق', en: 'In-App' },
};

export const statusBadge: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-700',
};

// â”€â”€ Shared Channel Icon Component â”€â”€
export function ChannelIcon({ channel }: { channel: string }) {
  const icons: Record<string, ReactNode> = {
    email: <Envelope size={16} />,
    sms: <ChatText size={16} />,
    push: <DeviceMobile size={16} />,
    webhook: <WebhooksLogo size={16} />,
    in_app: <Bell size={16} />,
  };
  return <>{icons[channel] || <Bell size={16} />}</>;
}

// â”€â”€ Channel config field definitions â”€â”€
export interface ChannelField {
  key: string;
  labelAr: string;
  labelEn: string;
  type?: string;
  placeholder?: string;
  isPassword?: boolean;
}

export function getChannelFields(channel: string): ChannelField[] {
  switch (channel) {
    case 'email':
      return [
        { key: 'host', labelAr: 'خادم البريد (SMTP Host)', labelEn: 'SMTP Host' },
        { key: 'port', labelAr: 'المنفذ (Port)', labelEn: 'Port', type: 'number' },
        { key: 'username', labelAr: 'اسم المستخدم', labelEn: 'Username' },
        { key: 'password', labelAr: 'كلمة المرور', labelEn: 'Password', isPassword: true },
        { key: 'from_email', labelAr: 'البريد المرسل', labelEn: 'From Email' },
        { key: 'from_name', labelAr: 'اسم المرسل', labelEn: 'From Name' },
      ];
    case 'sms':
      return [
        { key: 'provider', labelAr: 'المزود', labelEn: 'Provider' },
        { key: 'api_key', labelAr: 'مفتاح API', labelEn: 'API Key', isPassword: true },
        { key: 'api_secret', labelAr: 'سر API', labelEn: 'API Secret', isPassword: true },
        { key: 'sender_name', labelAr: 'اسم المرسل', labelEn: 'Sender Name' },
      ];
    case 'push':
      return [
        { key: 'server_key', labelAr: 'مفتاح الخادم (Server Key)', labelEn: 'Server Key', isPassword: true },
        { key: 'sender_id', labelAr: 'معرف المرسل (Sender ID)', labelEn: 'Sender ID' },
        { key: 'app_package', labelAr: 'حزمة التطبيق', labelEn: 'App Package' },
      ];
    case 'webhook':
      return [
        { key: 'url', labelAr: 'رابط Webhook', labelEn: 'Webhook URL' },
        { key: 'secret', labelAr: 'المفتاح السري', labelEn: 'Secret', isPassword: true },
        { key: 'retry_count', labelAr: 'عدد إعادة المحاولة', labelEn: 'Retry Count', type: 'number' },
        { key: 'timeout_ms', labelAr: 'المهلة (مللي ثانية)', labelEn: 'Timeout (ms)', type: 'number' },
      ];
    case 'in_app':
      return [
        { key: 'max_per_user', labelAr: 'الحد الأقصى لكل مستخدم', labelEn: 'Max per User', type: 'number' },
        { key: 'retention_days', labelAr: 'أيام الاحتفاظ', labelEn: 'Retention Days', type: 'number' },
      ];
    default:
      return [];
  }
}

// â”€â”€ Template Definitions â”€â”€
export interface TemplateDef {
  channel: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  vars: string[];
}

export const defaultTemplates: TemplateDef[] = [
  { channel: 'email', nameAr: 'بريد الترحيب', nameEn: 'Welcome Email', descAr: 'ترحيب بالعضو الجديد مع بيانات الدخول', descEn: 'Welcome new member with login details', vars: ['member_name', 'gym_name', 'email', 'password'] },
  { channel: 'sms', nameAr: 'تذكير التجديد', nameEn: 'Renewal Reminder', descAr: 'تذكير بتجديد العضوية قبل انتهائها', descEn: 'Remind member before membership expiry', vars: ['member_name', 'gym_name', 'expiry_date'] },
  { channel: 'push', nameAr: 'تذكير التمرين', nameEn: 'Workout Reminder', descAr: 'تذكير بموعد جلسة التدريب', descEn: 'Remind member of upcoming training session', vars: ['member_name', 'time', 'trainer'] },
  { channel: 'email', nameAr: 'إشعار الفاتورة', nameEn: 'Invoice Notification', descAr: 'إشعار بفاتورة جديدة', descEn: 'Notify member of new invoice', vars: ['member_name', 'gym_name', 'amount', 'currency', 'due_date'] },
];