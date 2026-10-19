import logger from '../config/logger';

type NotificationType = 'renewal_reminder' | 'attendance' | 'promotion' | 'payment_receipt' | 'class_reminder' | 'freeze_confirmation' | 'login_code';

interface NotificationPayload {
  to: string;
  memberName: string;
  type: NotificationType;
  gymName?: string;
  data?: Record<string, string>;
}

class WhatsAppService {
  private provider: 'twilio' | 'cloud_api' | 'console';
  private accountSid?: string;
  private authToken?: string;
  private phoneNumberId?: string;

  constructor() {
    this.provider = (process.env.WHATSAPP_PROVIDER as any) || 'console';
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  async sendMessage(payload: NotificationPayload): Promise<boolean> {
    const templates: Record<NotificationType, string> = {
      renewal_reminder: `مرحباً ${payload.memberName}، اشتراكك في ${payload.gymName || 'النادي'} سينتهي قريباً. يرجى تجديد اشتراكك لتجنب الانقطاع. شكراً لك.`,
      attendance: `مرحباً ${payload.memberName}، تم تسجيل حضوركم في ${payload.gymName || 'النادي'} بنجاح.`,
      promotion: `عرض خاص لعملائنا الأعزاء! ${payload.data?.description || 'تفاصيل العرض'}\n${payload.gymName || 'النادي'}`,
      payment_receipt: `مرحباً ${payload.memberName}، تم استلام دفعتك بقيمة ${payload.data?.amount || ''} بنجاح. رقم العملية: ${payload.data?.transactionId || ''}`,
      class_reminder: `تذكير: حصة ${payload.data?.className || ''} ستبدأ قريباً في ${payload.data?.startTime || ''}. نراكم في ${payload.gymName || 'النادي'}!`,
      freeze_confirmation: `مرحباً ${payload.memberName}، تم تجميد اشتراكك لمدة ${payload.data?.days || ''} يوماً. سيعود الاشتراك نشطاً في ${payload.data?.reactivateDate || ''}.`,
      // The only template that carries a credential. It is sent on request
      // (member/staff tapped "أرسل لي الكود"), never on a schedule, and it
      // replaces the previous code — the old one stops working immediately.
      login_code: `مرحباً ${payload.memberName}، كود الدخول الخاص بك في ${payload.gymName || 'النادي'} هو: ${payload.data?.code || ''}\nلا تشارك هذا الكود مع أي شخص.`,
    };

    const message = templates[payload.type] || 'مرحباً! شكراً لكونك معنا.';
    return this.send(payload.to, message);
  }

  async sendBulk(payloads: NotificationPayload[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const p of payloads) {
      const ok = await this.sendMessage(p);
      if (ok) sent++; else failed++;
    }
    return { sent, failed };
  }

  isConfigured(): boolean {
    if (this.provider === 'twilio') return !!(this.accountSid && this.authToken);
    if (this.provider === 'cloud_api') return !!this.phoneNumberId;
    return true;
  }

  getProvider(): string {
    return this.provider;
  }

  private async send(to: string, message: string): Promise<boolean> {
    switch (this.provider) {
      case 'twilio':
        return this.sendViaTwilio(to, message);
      case 'cloud_api':
        return this.sendViaCloudAPI(to, message);
      default:
        logger.info(`[WhatsApp Console] To: ${to}, Message: ${message.substring(0, 60)}...`);
        return true;
    }
  }

  private async sendViaTwilio(to: string, message: string): Promise<boolean> {
    try {
      const accountSid = this.accountSid!;
      const authToken = this.authToken!;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${process.env.TWILIO_PHONE_NUMBER || ''}`, Body: message });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`Twilio API error: ${res.status}`);
      logger.info(`WhatsApp sent via Twilio to ${to}`);
      return true;
    } catch (error) {
      logger.error('Twilio WhatsApp send failed', { error: (error as Error).message });
      return false;
    }
  }

  private async sendViaCloudAPI(to: string, message: string): Promise<boolean> {
    try {
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      if (!token || !this.phoneNumberId) return false;
      const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } }),
      });
      if (!res.ok) throw new Error(`Cloud API error: ${res.status}`);
      logger.info(`WhatsApp sent via Cloud API to ${to}`);
      return true;
    } catch (error) {
      logger.error('WhatsApp Cloud API send failed', { error: (error as Error).message });
      return false;
    }
  }
}

export const whatsapp = new WhatsAppService();
