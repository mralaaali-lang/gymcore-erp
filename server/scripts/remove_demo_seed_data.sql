-- ============================================================================
-- مسح بيانات الديمو اللي اتبذرت أوتوماتيك في صالة جديدة
-- ----------------------------------------------------------------------------
-- الهدف: «حامد جيم» (subdomain = hamedgym، id = b37861be-4898-40cf-aa2a-e4111dc18cdf)
-- لو المطلوب صالة تانية: بدّل المعرّف في كل مكان يظهر فيه السطر ده
--   'b37861be-4898-40cf-aa2a-e4111dc18cdf'
--
-- ليه المسح يدوي؟ البذرة القديمة في server/src/seed/seedNewGym.ts كانت بتحشي
-- أي صالة جديدة بـ15 عضو ملفق (صور ui-avatars.com، تليفونات +966…) + اشتراكات
-- active + حضور 7 أيام + 6 منتجات + 4 تصنيفات مصروفات، وترفع
-- gym_usage_counters.current_members_count لـ15. الكود اتصلح (تصبح الصالة
-- فاضية من اللحظة دي)، بس البيانات اللي داخلت بقت في الـDB فالمسح أمر منفصل.
--
-- audit مقروء قبل الكتابة (2026-10-17): members 15 / منهم 15 بصورة ملفقة،
-- member_subscriptions 15، attendance_logs 52، products 6، expense_categories 4،
-- وكل الأبناء التانيين (billing_invoices، member_debts، financial_transactions،
-- pos_orders، loyalty_accounts، class_bookings، quick_sessions، pt_sessions،
-- pt_enrollments، support_tickets، push_log، push_tokens، stitch_orders) = **0**.
--
-- نقطة قرار: الكتالوج الحقيقي (membership_offers 4 + gym_sports 7) **ما
-- بتتحذفش** هنا — دي بيانات تشغيل مش ملفّقة، والكتالوج ده مطلوب لو عايز تعمل
-- اشتراك أو check-in يدوي. عايز تمسحها كمان؟ آخر الملف فيه بلوك اختياري.
--
-- التشغيل (لازم -it عشان الجلسة تفضل مفتوحة بعد الملف وتقدر تكتب COMMIT):
--   docker cp server/scripts/remove_demo_seed_data.sql gymcore-db:/tmp/x.sql
--   docker exec -it gymcore-db psql -U gymcore -d gymcore -f /tmp/x.sql
-- أو من بره الكونتينر لو psql عندك على 5433:
--   psql "postgresql://gymcore:PASSWORD@localhost:5433/gymcore" -f server/scripts/remove_demo_seed_data.sql
--
-- الملف بيبدأ transaction وبيسيبها مفتوحة على SELECT تحقق آخره: راجع الأرقام،
-- لو كل حاجة مظبوطة اكتب COMMIT؛ لو في شك اكتب ROLLBACK.
-- أمان إضافي: لو شغّلته بـ`-f` من غير `-it`، الجلسة بتقفل لوحدها والـtransaction
-- بتعمل abort — يعني التعديلات ما تثبتش (ده سلوك PostgreSQL، مش صدفة).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) تعريف مجموعة الأعضاء الملفّقين بتوقيع البذرة نفسه (صورة ui-avatars).
--    البذرة كانت بتدي كل عضو ملفق صورة من ui-avatars.com، فالتوقيع ده أدق من
--    الاسم أو التليفون. جدول مؤقت بيسقط مع الـCOMMIT أو الـROLLBACK.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _demo_member_ids ON COMMIT DROP AS
SELECT id
  FROM members
 WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf'
   AND photo_url LIKE 'https://ui-avatars.com%';

-- لازم يطلع 15. لو طلع غير كده أو طلع 0، وقّف: ROLLBACK
SELECT count(*) AS members_to_delete FROM _demo_member_ids;

-- ---------------------------------------------------------------------------
-- 2) الأبناء الأول (attendance_logs و member_subscriptions مرجعهم لـmembers)
-- ---------------------------------------------------------------------------
DELETE FROM attendance_logs
 WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf'
   AND member_id IN (SELECT id FROM _demo_member_ids);

DELETE FROM member_subscriptions
 WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf'
   AND member_id IN (SELECT id FROM _demo_member_ids);

-- ---------------------------------------------------------------------------
-- 3) الأعضاء نفسهم
-- ---------------------------------------------------------------------------
DELETE FROM members
 WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf'
   AND id IN (SELECT id FROM _demo_member_ids);

-- ---------------------------------------------------------------------------
-- 4) المنتجات الملفّقة (باركود متسلسل 200000..200005 من البذرة).
--    pos_order_items = 0 فالحذف آمن؛ لو صالة تانية فيها مبيعات، سيّب السطر ده.
-- ---------------------------------------------------------------------------
DELETE FROM products
 WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf'
   AND barcode BETWEEN '200000' AND '200005';

-- ---------------------------------------------------------------------------
-- 5) تصنيفات المصروفات الملفّقة (financial_transactions = 0).
--    دي أسماء شائعة، فممكن تكون أنت اللي عملتها يدويًا — راجع قبل ما تمسح.
-- ---------------------------------------------------------------------------
DELETE FROM expense_categories
 WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf'
   AND name IN ('كهرباء', 'مياه', 'إيجار', 'صيانة');

-- ---------------------------------------------------------------------------
-- 6) العدّاد اللي البذرة رفعته لـ15 — يرجع لعدد الأعضاء الحقيقي.
--    current_staff_count ما يتلمسش (المدير الحقيقي موجود).
-- ---------------------------------------------------------------------------
UPDATE gym_usage_counters
   SET current_members_count = (
         SELECT count(*) FROM members
          WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf'
       ),
       updated_at = CURRENT_TIMESTAMP
 WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf';

-- ---------------------------------------------------------------------------
-- 7) تحقق قبل الإثبات — لازم كل الأرقام تطلع 0 (عدا offers=4، sports=7،
--    staff=1، وأي أعضاء حقيقيين لو أدخلتهم بنفسك).
-- ---------------------------------------------------------------------------
SELECT (SELECT count(*) FROM members             WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS members,
       (SELECT count(*) FROM member_subscriptions WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS subs,
       (SELECT count(*) FROM attendance_logs      WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS attendance,
       (SELECT count(*) FROM products             WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS products,
       (SELECT count(*) FROM expense_categories   WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS expense_cats,
       (SELECT count(*) FROM membership_offers    WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS offers,
       (SELECT count(*) FROM gym_sports           WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS sports,
       (SELECT current_members_count FROM gym_usage_counters
         WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf') AS counter_members;

-- اكتب COMMIT هنا تحت بنفسك بعد المراجعة، أو ROLLBACK لو في شك.
-- COMMIT;

-- ============================================================================
-- بلوك اختياري (مش شغال): لو عايز الصالة تبقى فاضية تمامًا فعلاً، امسح الكتالوج
-- اللي البذرة عملته. تحذير: من غيره createMember(plan_id) والـcheck-in اليدوي
-- ما يمشيوش لحد ما تعمل عروض اشتراك بنفسك، ولازم تمسح الاشتراكات المرتبطة
-- قبل العروض (member_subscriptions.offer_id عليها قيد خارجي).
-- ============================================================================
-- DELETE FROM member_subscriptions WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf';
-- DELETE FROM membership_offers    WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf';
-- DELETE FROM gym_sports           WHERE gym_id = 'b37861be-4898-40cf-aa2a-e4111dc18cdf';
