/**
 * Seed engagement data for platform pages: billing invoices (reports revenue),
 * support tickets (+messages), marketing broadcasts, notification history,
 * platform broadcasts + notifications.
 * Additive: clears ONLY these tables, safe to run on the seeded 10-gym DB.
 * Run: npm run db:seed:engagement
 */
import { getClient } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const d = (dt: Date) => dt.toISOString().split('T')[0];

const TICKETS: [string, string, string][] = [
  ['مشكلة في الدفع الإلكتروني', 'تم خصم المبلغ من البطاقة ولم يظهر الاشتراك مفعّلا.', 'billing'],
  ['طلب تجميد العضوية', 'مسافر لمدة شهر وأرغب بتجميد العضوية مؤقتا.', 'subscription'],
  ['جهاز السير معطّل', 'جهاز السير رقم 3 في صالة الكارديو لا يعمل.', 'technical'],
  ['استفسار عن مواعيد الحصص', 'هل توجد حصص يوجا مسائية؟', 'general'],
  ['خطأ في الفاتورة', 'الفاتورة الأخيرة بمبلغ أعلى من المتفق عليه.', 'billing'],
  ['طلب نقل الفرع', 'أرغب بنقل عضويتي إلى الفرع الجديد.', 'subscription'],
  ['التطبيق لا يفتح', 'رمز QR لا يظهر في التطبيق عند الدخول.', 'technical'],
  ['اقتراح حصة جديدة', 'نقترح إضافة حصص لياقة للأطفال.', 'general'],
];
const STAFF_REPLY = 'شكرا لتواصلك، جارٍ مراجعة طلبك وسيتم الرد خلال 24 ساعة.';
const STAFF_DONE = 'تم حل المشكلة، يرجى التأكد وإغلاق التذكرة عند الرضا.';
const MEMBER_THANKS = 'شكرا، تم التأكد والحل يعمل بشكل جيد.';

const NOTIFS: [string, string, string][] = [
  ['email', 'تذكير بتجديد الاشتراك', 'اشتراكك ينتهي خلال 7 أيام، جدّد الآن بخصم 10%.'],
  ['sms', 'تأكيد الحضور', 'تم تسجيل حضورك اليوم بنجاح.'],
  ['push', 'حصة جديدة متاحة', 'تمت إضافة حصة كروس فيت مسائية، احجز مكانك.'],
  ['email', 'فاتورة الشهر', 'فاتورة اشتراكك الشهري جاهزة للاطلاع.'],
  ['inapp', 'نقاط الولاء', 'حصلت على 50 نقطة ولاء جديدة.'],
  ['sms', 'تنبيه انتهاء', 'اشتراكك انتهى أمس، جدّد لمواصلة التدريب.'],
  ['webhook', 'مزامنة الدفع', 'تمت مزامنة عملية الدفع مع النظام المالي.'],
  ['push', 'عرض خاص', 'خصم 20% على باقات التدريب الخاص هذا الأسبوع.'],
];

const PLAN_PRICE: Record<string, number> = { basic: 600, premium: 1200, enterprise: 2000 };
const CUR_SCALE: Record<string, number> = { EGP: 1, SAR: 0.09, AED: 0.085 };

async function batchInsert(client: any, table: string, cols: string[], rows: any[][], size = 400) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const ph: string[] = [];
    const vals: any[] = [];
    chunk.forEach((r, ri) => {
      ph.push(`(${r.map((_: any, ci: number) => `$${ri * cols.length + ci + 1}`).join(',')})`);
      vals.push(...r);
    });
    await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${ph.join(',')}`, vals);
  }
}

async function seed(): Promise<void> {
  logger.info('=== Seed engagement: invoices, tickets, broadcasts, notifications ===');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const t of ['support_ticket_messages', 'support_tickets', 'billing_invoices', 'marketing_broadcasts', 'notification_history', 'platform_broadcasts', 'platform_notifications']) {
      await client.query(`DELETE FROM ${t}`);
    }

    const admin = (await client.query(`SELECT id FROM platform_admins WHERE email='mr.alaaali@gmail.com'`)).rows[0];
    const adminId = admin?.id ?? null;
    const gyms = (await client.query(`SELECT id, name, subdomain, plan_tier, currency FROM gyms ORDER BY created_at`)).rows;

    const invRows: any[][] = [];
    const tickRows: any[][] = [];
    const msgRows: any[][] = [];
    const bcRows: any[][] = [];
    const notifRows: any[][] = [];
    let invSeq = 1;
    let tickSeq = 1;

    for (let gi = 0; gi < gyms.length; gi++) {
      const g = gyms[gi];
      const scale = CUR_SCALE[g.currency] ?? 1;
      const base = Math.max(10, Math.round((PLAN_PRICE[g.plan_tier] ?? 600) * scale));
      const staff = (await client.query(`SELECT id, role FROM staff_users WHERE gym_id=$1`, [g.id])).rows;
      const mgr = staff.find((s: any) => s.role === 'manager')?.id ?? staff[0]?.id;
      const recep = staff.find((s: any) => s.role === 'receptionist')?.id ?? mgr;
      const members = (await client.query(`SELECT id, full_name FROM members WHERE gym_id=$1 ORDER BY created_at LIMIT 60`, [g.id])).rows;

      // ── Invoices: 6 monthly gym-subscription invoices ──
      for (let m = 5; m >= 0; m--) {
        const start = new Date();
        start.setDate(1);
        start.setMonth(start.getMonth() - m);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        const due = new Date(end);
        due.setDate(due.getDate() + 7);
        const isPast = m > 0;
        const status = !isPast ? (Math.random() < 0.5 ? 'pending' : 'partial') : (Math.random() < 0.85 ? 'paid' : 'overdue');
        const tax = Math.round(base * 0.14 * 100) / 100;
        const total = base + tax;
        const paid = status === 'paid' ? total : status === 'partial' ? Math.round(total / 2) : 0;
        invRows.push([
          uuidv4(), `INV-${g.subdomain.slice(0, 3).toUpperCase()}-${String(invSeq++).padStart(4, '0')}`,
          g.id, d(start), d(end), g.plan_tier, base, tax, 0, total, g.currency, status, d(due),
          status === 'paid' ? d(end) : null, paid,
          status === 'paid' || status === 'partial' ? pick(['cash', 'card', 'bank_transfer']) : null,
          null, 'اشتراك المنصة الشهري', recep, null,
        ]);
      }
      // ── Member-linked invoices (offer purchases) ──
      for (let k = 0; k < 8 && k < members.length; k++) {
        const mem = members[(gi * 7 + k * 3) % members.length];
        const amt = Math.max(5, Math.round(pick([350, 900, 1600]) * scale));
        const paid = Math.random() < 0.8;
        const day = new Date();
        day.setDate(day.getDate() - rnd(0, 60));
        const due = new Date(day);
        due.setDate(due.getDate() + 7);
        invRows.push([
          uuidv4(), `INV-${g.subdomain.slice(0, 3).toUpperCase()}-${String(invSeq++).padStart(4, '0')}`,
          g.id, d(day), d(day), 'عضوية', amt, 0, 0, amt, g.currency,
          paid ? 'paid' : (day < new Date(Date.now() - 7 * 86400000) ? 'overdue' : 'pending'),
          d(due), paid ? d(day) : null, paid ? amt : 0,
          paid ? pick(['cash', 'card', 'instapay']) : null, null, 'اشتراك عضو', recep, mem.id,
        ]);
      }

      // ── Support tickets ×3 ──
      for (let t = 0; t < 3; t++) {
        const tid = uuidv4();
        const [subj, desc, cat] = TICKETS[(gi * 3 + t) % TICKETS.length];
        const status = ['open', 'in_progress', 'closed'][(gi + t) % 3];
        const prio = pick(['low', 'medium', 'medium', 'high']);
        const mem = members.length ? pick(members) : null;
        const created = new Date();
        created.setDate(created.getDate() - rnd(0, 20));
        const closed = status === 'closed';
        tickRows.push([
          tid, `T-${String(tickSeq++).padStart(5, '0')}`, g.id, mem?.id ?? null, `${subj} — ${g.name}`,
          desc, cat, prio, status, status === 'in_progress' ? mgr : null,
          closed ? recep : null, closed ? 'تمت المعالجة وإغلاق البلاغ.' : null,
          closed ? rnd(4, 5) : null,
          status === 'in_progress' || closed ? new Date(created.getTime() + 36e5).toISOString() : null,
          closed ? new Date(created.getTime() + 72e5).toISOString() : null,
          created.toISOString(),
        ]);
        msgRows.push([uuidv4(), tid, 'customer', mem?.id ?? null, desc, false, created.toISOString()]);
        msgRows.push([uuidv4(), tid, 'support', recep, STAFF_REPLY, false, new Date(created.getTime() + 36e5).toISOString()]);
        if (closed) msgRows.push([uuidv4(), tid, 'support', recep, STAFF_DONE, false, new Date(created.getTime() + 54e5).toISOString()]);
        if (closed && (gi + t) % 2 === 0) msgRows.push([uuidv4(), tid, 'customer', mem?.id ?? null, MEMBER_THANKS, false, new Date(created.getTime() + 63e5).toISOString()]);
      }

      // ── Marketing broadcasts ×2 ──
      const sent = {
        id: uuidv4(), subject: 'عرض التجديد المبكر', content: 'جدد اشتراكك قبل نهايته واحصل على خصم 15%.',
        target: 'all_members', status: 'sent', total: 0, delivered: 0,
      };
      bcRows.push([sent.id, null, sent.subject, sent.content, sent.target, '{}', new Date(Date.now() - 5 * 864e5).toISOString(), new Date(Date.now() - 5 * 864e5).toISOString(), members.length, Math.floor(members.length * 0.95), Math.floor(members.length * 0.4), Math.floor(members.length * 0.08), 0, 0, 'sent', mgr]);
      // NOTE: marketing_broadcasts has no gym_id — link via created_by staff of this gym
      bcRows.push([uuidv4(), null, 'حصص رمضان', 'مواعيد الحصص خلال الشهر الكريم.', 'all_members', '{}', new Date(Date.now() + 3 * 864e5).toISOString(), null, 0, 0, 0, 0, 0, 0, 'scheduled', mgr]);

      // ── Notification history ×6 ──
      for (let n = 0; n < 6; n++) {
        const [ch, title, content] = NOTIFS[(gi * 6 + n) % NOTIFS.length];
        const mem = members.length ? members[(gi * 5 + n * 7) % members.length] : null;
        const st = n === 5 ? 'failed' : (n % 2 === 0 ? 'delivered' : 'sent');
        const sentAt = new Date();
        sentAt.setDate(sentAt.getDate() - rnd(0, 10));
        notifRows.push([
          uuidv4(), ch, mem ? 'member' : 'gym', mem?.id ?? g.id, mem?.full_name ?? g.name,
          `${title} — ${g.name}`, content, st,
          st === 'failed' ? 'SMS gateway timeout' : null,
          sentAt.toISOString(), st === 'delivered' ? new Date(sentAt.getTime() + 6e5).toISOString() : null,
          adminId,
        ]);
      }
    }

    await batchInsert(client, 'billing_invoices',
      ['id', 'invoice_number', 'gym_id', 'billing_period_start', 'billing_period_end', 'plan_name', 'base_amount', 'tax_amount', 'discount_amount', 'total_amount', 'currency', 'status', 'due_date', 'paid_at', 'paid_amount', 'payment_method', 'payment_reference', 'notes', 'created_by', 'member_id'], invRows);
    // member-linked rows have 21 cols — split inserts
    await batchInsert(client, 'support_tickets',
      ['id', 'ticket_number', 'gym_id', 'member_id', 'subject', 'description', 'category', 'priority', 'status', 'assigned_to', 'resolved_by', 'resolution', 'satisfaction_rating', 'first_response_at', 'resolved_at', 'created_at'], tickRows);
    await batchInsert(client, 'support_ticket_messages',
      ['id', 'ticket_id', 'sender_type', 'sender_id', 'content', 'is_internal', 'created_at'], msgRows);
    await batchInsert(client, 'marketing_broadcasts',
      ['id', 'campaign_id', 'subject', 'content', 'target_type', 'target_filter', 'scheduled_at', 'sent_at', 'total_recipients', 'delivered_count', 'opened_count', 'clicked_count', 'bounced_count', 'unsubscribed_count', 'status', 'created_by'], bcRows);
    await batchInsert(client, 'notification_history',
      ['id', 'channel', 'recipient_type', 'recipient_id', 'recipient_label', 'title', 'content', 'status', 'error_message', 'sent_at', 'delivered_at', 'created_by'], notifRows);

    // ── Platform-wide ──
    const pb: any[][] = [
      [uuidv4(), 'صيانة مجدولة', 'ستتوقف المنصة لمدة ساعة فجر الجمعة لأعمال الصيانة.', JSON.stringify(['owner', 'manager']), adminId],
      [uuidv4(), 'ميزة جديدة: التقارير المتقدمة', 'أصبحت التقارير المتقدمة متاحة لجميع الباقات.', JSON.stringify(['owner']), adminId],
      [uuidv4(), 'تذكير بالفواتير', 'يرجى سداد فواتير المنصة قبل تاريخ الاستحقاق.', JSON.stringify(['owner', 'manager', 'receptionist']), adminId],
    ];
    await batchInsert(client, 'platform_broadcasts', ['id', 'title', 'content', 'target_roles', 'sent_by'], pb);
    const pn: any[][] = [];
    const ptypes: [string, string, string, string][] = [
      ['owner', 'warning', 'اشتراك منصة يقترب من الانتهاء', 'اشتراك صالة النخبة ينتهي خلال 12 يوما.'],
      ['manager', 'alert', 'فاتورة مستحقة', 'توجد فاتورة متأخرة بانتظار السداد.'],
      ['all', 'info', 'عضو جديد', 'انضم 5 أعضاء جدد هذا الأسبوع.'],
      ['coach', 'reminder', 'تذكير وردية', 'وردية المساء تبدأ الساعة 4 مساء.'],
    ];
    for (let gi = 0; gi < gyms.length; gi++) {
      const g = gyms[gi];
      for (let i = 0; i < 4; i++) {
        const [role, type, title, body] = ptypes[(gi + i) % ptypes.length];
        pn.push([uuidv4(), g.id, role, type, `${title} — ${g.name}`, body, '/admin/dashboard', i < 2 ? null : new Date().toISOString()]);
      }
    }
    await batchInsert(client, 'platform_notifications', ['id', 'gym_id', 'recipient_role', 'notification_type', 'title', 'body', 'action_url', 'read_at'], pn);

    await client.query('COMMIT');
    console.log(`\n  ✅ Engagement seeded: ${invRows.length} invoices, ${tickRows.length} tickets, ${bcRows.length} broadcasts, ${notifRows.length} notifications\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seed engagement failed', { error: (error as Error).message });
    console.error('Seed engagement failed:', (error as Error).message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
