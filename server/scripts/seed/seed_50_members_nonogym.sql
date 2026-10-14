-- Seed 50 varied test members for NONOGYM (gym_id 1b55f81c-2970-4f2d-b263-eaf76d3b08b0)
-- Mix: 29 active + 6 ending-soon + 8 expired + 3 frozen + 2 cancelled + 2 none (2 blacklisted)
-- NOTE: members.phone_number is cleared by a DB trigger into phone_hash (privacy) — lookup by phone still works via hash.
BEGIN;

WITH params AS (
  SELECT '1b55f81c-2970-4f2d-b263-eaf76d3b08b0'::uuid AS gym,
         '0ef97f50-c9f9-4e09-aa1e-4d7c320f7947'::uuid AS staff,
         '1479c3d2-dc03-4e58-b83d-2b491ca69129'::uuid AS off30,
         '2d756ecd-16e5-4e6f-b7eb-f8f444702dc9'::uuid AS off90,
         'a4287324-792d-4039-b1ca-9d93eb53b283'::uuid AS off180,
         'efb846e5-dea8-4f09-ab2a-f9bf004251cf'::uuid AS off365
),
names AS (
  SELECT i,
    CASE WHEN i < 25 THEN
      (ARRAY['أحمد','محمد','محمود','مصطفى','كريم','عمرو','شريف','طارق','هاني','وليد','سامح','إسلام','حسام','ماجد','نبيل','فادي','رامي','باسم','عادل','سعيد','خالد','ياسر','أشرف','جمال','فاروق'])[i+1]
      || ' ' ||
      (ARRAY['إبراهيم','حسن','علي','فؤاد','السيد','عبد الله','سالم','حمدي','رشوان','الشرقاوي','منصور','عوض','البربري','زيدان','قاسم'])[(i*7%15)+1]
    ELSE
      (ARRAY['منى','سارة','فاطمة','نور','هبة','دينا','رنا','مريم','ياسمين','آلاء','إسراء','شيماء','نهى','غادة','ريهام','عبير','سلوى','نجلاء','دعاء','أسماء','هند','رشا','مي','سمر','لبنى'])[(i-25)+1]
      || ' ' ||
      (ARRAY['أحمد','محمد','خليل','عبد الرحمن','توفيق','الجندي','عزت','الشريف','حافظ','وهبة','نصار','بدوي','علام','المصري','زهران'])[((i-25)*7%15)+1]
    END AS full_name,
    '01' || (ARRAY['0','1','2','5'])[(i%4)+1] || (10000000 + i*173839)::text AS phone,
    CASE WHEN i < 20 THEN i%13 ELSE 13 + ((i-20)*4 % 120) END AS age_off,
    (DATE '1975-01-01' + ((i*37) % 12000)) AS birth,
    CASE WHEN i%2 = 0 THEN 'member' || i || '@nonogym.test' END AS email,
    CASE WHEN i%5 = 0 THEN (ARRAY['حساسية صدر','إصابة ركبة قديمة','ضغط مرتفع - متابعة دورية'])[(i%3)+1] END AS med,
    CASE WHEN i IN (35,36) THEN true ELSE false END AS black
  FROM generate_series(0,49) AS i
),
sub AS (
  SELECT i,
    CASE
      WHEN i <= 28 THEN 'active'
      WHEN i <= 34 THEN 'active'
      WHEN i <= 42 THEN 'expired'
      WHEN i <= 45 THEN 'frozen'
      WHEN i <= 47 THEN 'cancelled'
      ELSE 'none'
    END AS st,
    CASE
      WHEN i <= 28 THEN (ARRAY[30,90,180,365])[(i%4)+1]
      WHEN i <= 34 THEN 30
      WHEN i <= 42 THEN CASE WHEN i%2 = 0 THEN 30 ELSE 90 END
      WHEN i <= 45 THEN 90
      WHEN i <= 47 THEN 30
      ELSE 0
    END AS dur
  FROM generate_series(0,49) AS i
),
calc AS (
  SELECT n.i, n.full_name, n.phone, n.age_off, n.birth, n.email, n.med, n.black,
         s.st, s.dur,
         CASE
           WHEN s.st = 'none' THEN NULL
           WHEN i <= 28 THEN CURRENT_DATE - ((i*3) % (s.dur - 10))
           WHEN i <= 34 THEN (CURRENT_DATE + (i-29)) - 30
           WHEN i <= 42 THEN (CURRENT_DATE - (5 + (i-35)*7)) - s.dur
           WHEN i <= 45 THEN CURRENT_DATE - ((i-43)*5)
           ELSE (CURRENT_DATE - (3 + (i-46)*10)) - 30
         END AS start_d
  FROM names n JOIN sub s USING (i)
),
ins_m AS (
  INSERT INTO members (gym_id, full_name, phone_number, email, birth_date, medical_notes, is_blacklisted, blacklist_reason, created_at)
  SELECT (SELECT gym FROM params), c.full_name, c.phone, c.email, c.birth, c.med, c.black,
         CASE WHEN c.black THEN 'مستحقات متأخرة وتجاوزات' END,
         ((CURRENT_DATE - c.age_off)::timestamp + ((c.i%10+8) || ' hours')::interval)
  FROM calc c
  RETURNING id, full_name, phone_hash
),
ins_s AS (
  INSERT INTO member_subscriptions (gym_id, member_id, offer_id, price_paid, start_date, end_date, status, created_at)
  SELECT (SELECT gym FROM params), m.id,
         CASE c.dur WHEN 30 THEN (SELECT off30 FROM params) WHEN 90 THEN (SELECT off90 FROM params)
                    WHEN 180 THEN (SELECT off180 FROM params) ELSE (SELECT off365 FROM params) END,
         CASE c.dur WHEN 30 THEN 200 WHEN 90 THEN 500 WHEN 180 THEN 900 ELSE 1500 END,
         c.start_d, c.start_d + c.dur, c.st, c.start_d
  FROM calc c JOIN ins_m m ON m.full_name = c.full_name
  WHERE c.st <> 'none'
  RETURNING member_id
),
ins_l AS (
  INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
  SELECT (SELECT gym FROM params), (SELECT staff FROM params),
         'Seed: Created test member ' || c.full_name || ' (' || c.st || ')', NULL
  FROM calc c
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM ins_m) AS members_added,
       (SELECT COUNT(*) FROM ins_s) AS subs_added;

COMMIT;
