import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

/**
 * §63 — محتوى موقع الصالة: كل تبويبات «قيد التطوير» بقراها الحقيقي.
 *
 * `WebsiteGenerator.tsx` كان يرسم كارت «قيد التطوير» لتسعة تبويبات لأن ما فيش
 * endpoint يجمعها. الداتا نفسها موجودة في القاعدة من زمان: المدرس في
 * `staff_users`، الجدول في `fitness_classes` + `class_bookings`، الأسعار في
 * `membership_offers`، الرياضات في `gym_sports`، الهوية والعنوان في `gyms`.
 * الإندبوينت ده يقرأها بصيغة جاهزة للعرض — فلا شاشة تتخترع رقم، ولا تبويب
 * يفضل كداب وهو مش كداب.
 *
 * قواعد §61 مستنسخة هنا: لا اسم كيان حرفي في الكود (الـrole بيتطابق زي
 * `classes.ts` بـ`coach|trainer`، والباقات تُقرأ من جدولها لا من نص)، وnumeric
 * بيتحوّل لرقم عند الحافة لأن pg بيرجعه نص، وكل استعلام ماشي على أعمدة
 * متحقَّق منها في information_schema لأن tsc ما يشوفش جوه نص الـSQL.
 *
 * اللي لسه مفيش له تخزين: صفحات مخصصة / معرض صور / نماذج تسجيل — التلاتة
 * ما لهومش جداول، فالواجهة تعرض حالة فاضية صادقة لا تبويب وهمي (مُعلَن في
 * التسليم).
 */

const DEFAULT_TZ = 'Africa/Cairo';

/** آخر ٥٦ يوم: نمط أسبوعي مقاس من حصص فعلية، لا نية معلنة في نموذج. */
const SCHEDULE_WINDOW_DAYS = 56;
/** نافذة إثبات التشغيل (حصص/حجوزات/دخول) اللي الموقع يبيع بيها بنفسه. */
const PROOF_WINDOW_DAYS = 90;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** حدود بتوقيت الصالة (§34ث) — نفس صياغة تقارير analytics. لازم `::int` على
 *عدد الأيام وإلا Postgres بيرفض المعامل المجهول (`date - unknown`). */
const dayStartExpr = (tzParam: string, daysParam: string): string =>
  `((CURRENT_TIMESTAMP AT TIME ZONE ${tzParam})::date - ${daysParam}::int)::timestamp AT TIME ZONE ${tzParam}`;

export async function getWebsiteContent(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const identity = await query(
      `SELECT name, dba_name, subdomain, logo_url, phone, email,
              address_street, address_city, address_state, address_country, address_zip,
              currency, COALESCE(timezone, $2) AS timezone, language
         FROM gyms WHERE id = $1`,
      [gym_id, DEFAULT_TZ],
    );
    if (identity.rows.length === 0) {
      res.status(404).json({ error: 'Gym not found' });
      return;
    }
    const gym = identity.rows[0];
    const tz: string = gym.timezone || DEFAULT_TZ;

    const [themeRows, sports, instructors, schedule, pricing, proof] = await Promise.all([
      // الثيم مفتاح/قيمة زي ما بيكتبه تبويب الإعدادات في نفس الصفحة.
      query(
        `SELECT setting_key, setting_value FROM gym_settings
          WHERE gym_id = $1 AND setting_key LIKE 'website_%'
          ORDER BY setting_key`,
        [gym_id],
      ),
      query(
        `SELECT code, name_ar, icon, color, sort_order
           FROM gym_sports
          WHERE gym_id = $1 AND is_active
          ORDER BY sort_order ASC, name_ar ASC`,
        [gym_id],
      ),
      // المدرسون: نفس تطابق classes.ts (`coach`/`trainer`)، وبلا موبايل أو
      // إيميل — دي صفحة عامة والبيانات الشخصية مكانها لوحة المدير.
      query(
        `SELECT su.id, su.full_name, su.job_title, su.department,
                COUNT(fc.id)::int AS classes_delivered
           FROM staff_users su
           LEFT JOIN fitness_classes fc
             ON fc.coach_id = su.id AND fc.is_cancelled IS NOT TRUE
            AND fc.start_time >= ${dayStartExpr('$2', '$3')}
          WHERE su.gym_id = $1
            AND su.is_active
            AND su.deleted_at IS NULL
            AND LOWER(su.role) IN ('coach', 'trainer')
          GROUP BY su.id, su.full_name, su.job_title, su.department
          ORDER BY classes_delivered DESC, su.full_name ASC`,
        [gym_id, tz, SCHEDULE_WINDOW_DAYS],
      ),
      // الجدول: نمط أسبوعي متجمّع من الحصص الواقعة فعليًا، لا من سطر إداري.
      query(
        `WITH cls AS (
           SELECT fc.id, fc.title, COALESCE(fc.capacity, 0) AS capacity, fc.coach_id,
                  EXTRACT(DOW FROM fc.start_time AT TIME ZONE $2)::int AS weekday,
                  EXTRACT(HOUR FROM fc.start_time AT TIME ZONE $2)::int AS hour,
                  EXTRACT(MINUTE FROM fc.start_time AT TIME ZONE $2)::int AS minute
             FROM fitness_classes fc
            WHERE fc.gym_id = $1
              AND fc.is_cancelled IS NOT TRUE
              AND fc.start_time >= ${dayStartExpr('$2', '$3')}
         ),
         booked AS (
           SELECT class_id, COUNT(*)::int AS n
             FROM class_bookings
            WHERE gym_id = $1
            GROUP BY class_id
         )
         SELECT c.weekday, c.hour, c.minute, c.title,
                COALESCE(su.full_name, '—') AS coach_name,
                MAX(c.capacity)::int AS capacity,
                COUNT(*)::int AS occurrences,
                SUM(COALESCE(b.n, 0))::int AS booked
           FROM cls c
           LEFT JOIN staff_users su ON su.id = c.coach_id
           LEFT JOIN booked b ON b.class_id = c.id
          GROUP BY c.weekday, c.hour, c.minute, c.title, su.full_name
          ORDER BY c.weekday, c.hour, c.minute, c.title`,
        [gym_id, tz, SCHEDULE_WINDOW_DAYS],
      ),
      query(
        `SELECT id, title, duration_days, price, sport, total_sessions, weekly_days,
                freeze_days_max, description
           FROM membership_offers
          WHERE gym_id = $1 AND is_active
          ORDER BY price ASC, title ASC`,
        [gym_id],
      ),
      // إثبات التشغيل: نفس تعريف «العضو النشط» في getReportsOverview (عقد
      // member_subscriptions لا عمود حالة على members — العمود ده مفيش).
      query(
        `SELECT
           (SELECT COUNT(DISTINCT m.id)::int
              FROM members m
              JOIN member_subscriptions ms
                ON ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.deleted_at IS NULL
             WHERE m.gym_id = $1 AND m.deleted_at IS NULL AND m.is_blacklisted = false
               AND ms.status = 'active'
               AND ms.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
               AND ms.end_date   >= (CURRENT_TIMESTAMP AT TIME ZONE $2)::date) AS active_members,
           (SELECT COUNT(*)::int FROM fitness_classes
             WHERE gym_id = $1 AND is_cancelled IS NOT TRUE
               AND start_time >= ${dayStartExpr('$2', '$3')}
               AND start_time < ((CURRENT_TIMESTAMP AT TIME ZONE $2)::date + 1)::timestamp AT TIME ZONE $2) AS classes_90d,
           (SELECT COALESCE(SUM(COALESCE(capacity, 0)), 0)::int FROM fitness_classes
             WHERE gym_id = $1 AND is_cancelled IS NOT TRUE
               AND start_time >= ${dayStartExpr('$2', '$3')}
               AND start_time < ((CURRENT_TIMESTAMP AT TIME ZONE $2)::date + 1)::timestamp AT TIME ZONE $2) AS seats_90d,
           (SELECT COUNT(*)::int FROM class_bookings
             WHERE gym_id = $1
               AND booked_at >= ${dayStartExpr('$2', '$3')}) AS bookings_90d,
           (SELECT COUNT(*)::int FROM attendance_logs
             WHERE gym_id = $1 AND deleted_at IS NULL
               AND check_in_time >= ${dayStartExpr('$2', '$3')}) AS checkins_90d`,
        [gym_id, tz, PROOF_WINDOW_DAYS],
      ),
    ]);

    const theme: Record<string, string> = {};
    themeRows.rows.forEach((r: any) => {
      theme[String(r.setting_key).replace(/^website_/, '')] = r.setting_value ?? '';
    });

    const scheduleRows = schedule.rows.map((r) => {
      const seats = num(r.capacity) * num(r.occurrences);
      const booked = num(r.booked);
      return {
        weekday: num(r.weekday),
        hour: num(r.hour),
        minute: num(r.minute),
        title: r.title as string,
        coach_name: r.coach_name as string,
        capacity: num(r.capacity),
        occurrences: num(r.occurrences),
        booked,
        seat_fill_pct: seats > 0 ? Math.round((booked / seats) * 1000) / 10 : null,
      };
    });

    const proofRow = proof.rows[0] ?? {};
    const seats = num(proofRow.seats_90d);
    const bookings = num(proofRow.bookings_90d);

    res.json({
      data: {
        identity: {
          name: gym.name,
          dba_name: gym.dba_name,
          subdomain: gym.subdomain,
          logo_url: gym.logo_url,
          phone: gym.phone,
          email: gym.email,
          address: {
            street: gym.address_street,
            city: gym.address_city,
            state: gym.address_state,
            country: gym.address_country,
            zip: gym.address_zip,
          },
          currency: gym.currency,
          timezone: tz,
          language: gym.language,
        },
        theme,
        sports: sports.rows.map((r) => ({
          code: r.code,
          name_ar: r.name_ar,
          icon: r.icon,
          color: r.color,
        })),
        instructors: instructors.rows.map((r) => ({
          id: r.id,
          name: r.full_name,
          job_title: r.job_title,
          department: r.department,
          classes_delivered_56d: num(r.classes_delivered),
        })),
        schedule: scheduleRows,
        pricing: pricing.rows.map((r) => ({
          id: r.id,
          title: r.title,
          duration_days: num(r.duration_days),
          price: num(r.price),
          sport: r.sport,
          total_sessions: r.total_sessions === null ? null : num(r.total_sessions),
          weekly_days: r.weekly_days ?? [],
          freeze_days_max: num(r.freeze_days_max),
          description: r.description,
        })),
        proof: {
          window_days: PROOF_WINDOW_DAYS,
          active_members: num(proofRow.active_members),
          classes_delivered_90d: num(proofRow.classes_90d),
          bookings_90d: bookings,
          checkins_90d: num(proofRow.checkins_90d),
          seat_fill_pct: seats > 0 ? Math.round((bookings / seats) * 1000) / 10 : null,
        },
        // التبويبات اللي لها مصدر بيانات حقيقي — والباقي (pages/gallery/forms)
        // مفيش جدول له أصلًا، فحالته الفاضية هي الصادقة.
        sections: {
          homepage: num(proofRow.active_members) > 0 || sports.rows.length > 0,
          instructors: instructors.rows.length > 0,
          schedule: scheduleRows.length > 0,
          pricing: pricing.rows.length > 0,
          location: Boolean(gym.address_street || gym.address_city),
          gallery: false,
          forms: false,
          pages: false,
        },
      },
    });
  } catch (error) {
    logger.error('getWebsiteContent failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
