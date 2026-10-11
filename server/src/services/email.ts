import nodemailer from 'nodemailer';
import logger from '../config/logger';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@gymcore.app';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Sends the password-reset email. If SMTP_HOST/SMTP_USER/SMTP_PASS aren't
 * configured in the environment, this falls back to logging the reset link
 * — safe for local/dev use, but MUST have real SMTP credentials configured
 * before this ships to production, or users will never actually receive
 * their reset link.
 */
export async function sendPasswordResetEmail(to: string, resetLink: string, recipientName?: string): Promise<void> {
  const subject = 'إعادة تعيين كلمة المرور — GymCore';
  const html = `
    <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #114b5f;">إعادة تعيين كلمة المرور</h2>
      <p>مرحباً ${recipientName || ''},</p>
      <p>وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك. اضغط على الزر أدناه لتعيين كلمة مرور جديدة:</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="background: #06b6d4; color: white; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-weight: bold;">
          إعادة تعيين كلمة المرور
        </a>
      </p>
      <p style="color: #888; font-size: 13px;">هذا الرابط صالح لمدة 30 دقيقة فقط. إذا لم تطلب هذا، تجاهل هذه الرسالة.</p>
    </div>
  `;

  const t = getTransporter();
  if (!t) {
    // No SMTP configured — log the link so the flow is still testable
    // end-to-end locally. Replace with real SMTP env vars before production.
    logger.warn('SMTP not configured — logging password reset link instead of emailing it', {
      to,
      resetLink,
    });
    return;
  }

  try {
    await t.sendMail({ from: SMTP_FROM, to, subject, html });
  } catch (error) {
    logger.error('Failed to send password reset email', { to, error: (error as Error).message });
    // Don't throw — the caller already tells the user "if this email
    // exists, a link was sent" regardless, to avoid leaking whether the
    // send succeeded (which could itself leak whether the account exists).
  }
}
