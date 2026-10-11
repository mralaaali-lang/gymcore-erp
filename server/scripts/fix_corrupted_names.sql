-- Fix corrupted Arabic names in the database
-- These were corrupted due to UTF-8 encoding issues when piping through PowerShell

-- ============================================================
-- 1. Fix gym name
-- ============================================================
UPDATE gyms SET name = 'نادي الاختبار التجريبي' WHERE id = 'ecd07dc1-442f-4048-8fca-375e72451569';

-- ============================================================
-- 2. Fix member names for test-gym-2026
-- ============================================================
WITH updates (id, new_name) AS (
  VALUES
    ('9955be01-24a9-4f8f-b670-b9cb1e049461'::uuid, 'غسان الدوسري'::text),
    ('67db1a41-38ee-4704-b628-32c5680e54ff'::uuid, 'أديب العجمي'::text),
    ('b13d4574-067a-4962-b04b-6d11d117e2be'::uuid, 'بسام الجهني'::text),
    ('c95148cb-c25c-4608-a7f8-b41dffec39fc'::uuid, 'جمال البقمي'::text),
    ('83ff5fbb-a7f5-4206-9d47-cda37a8e2976'::uuid, 'حامد الخالدي'::text),
    ('4decb1a8-7491-4ef6-a317-1edd5f47df7e'::uuid, 'حمود العنزي'::text),
    ('8e913e3e-9267-488f-b903-67455f917e05'::uuid, 'رائد الشهراني'::text),
    ('f16da197-8f3d-4b3a-bd5b-7ce1ead8972b'::uuid, 'زكريا الحربي'::text),
    ('60d14f77-d3f5-40bf-9438-240858ab4d44'::uuid, 'سالم المطيري'::text),
    ('50ee90aa-068c-41ea-8db2-faf654497d73'::uuid, 'سعيد القرشي'::text),
    ('e829d837-3ec7-401d-8255-be87d1e3e5f7'::uuid, 'شاكر الغامدي'::text),
    ('aad8adbf-0442-437d-ba8d-e558f1d4a919'::uuid, 'صقر السلمي'::text),
    ('d6b5a915-bd2a-4054-9ca9-452d48d6ef92'::uuid, 'ضياء العتيبي'::text),
    ('ce8a984f-ff47-499c-bdda-8174872ff4f6'::uuid, 'عاصم السيد'::text),
    ('fe1ab496-8512-4fd6-a310-f4ffde14be07'::uuid, 'عامر الشمري'::text),
    ('f46ebf9f-2505-48eb-94f9-aba09b3bc172'::uuid, 'عباس الزهراني'::text),
    ('688c4f30-161e-4ee7-a599-e29c75930565'::uuid, 'عدنان المالكي'::text),
    ('b3412b0f-ec63-4ae4-8470-b58ac80b8ece'::uuid, 'علي الدوسري'::text),
    ('514efcdd-69ca-4495-a286-a668178de1f6'::uuid, 'عمر الحارثي'::text),
    ('61c15082-e36f-4e6a-8b70-df408c3d625c'::uuid, 'فؤاد الجهني'::text)
)
UPDATE members m SET full_name = u.new_name
FROM updates u WHERE m.id = u.id;

-- ============================================================
-- 3. Fix member names for حامد جيم
-- ============================================================
WITH updates (id, new_name) AS (
  VALUES
    ('71d763b2-2321-4cd0-a512-f9699a8b07bd'::uuid, 'مشعل الثقفي'::text),
    ('97252b14-a678-46b6-941a-b3c7c8d31000'::uuid, 'بدر السبيعي'::text),
    ('2c71c6b8-fbb2-4a02-a0a2-d820001da182'::uuid, 'هاني الشمري'::text),
    ('7724ac7b-5b48-4ec4-9911-40199f33ecea'::uuid, 'نايف الزهراني'::text),
    ('1a778e02-4ae6-44cd-b0d2-dea32e38746b'::uuid, 'جابر القحطاني'::text),
    ('cdb717cc-64af-410a-ac4b-721dea751cf7'::uuid, 'عبدالرحمن الدوسري'::text),
    ('5bf67d8c-03d0-4812-bce8-a3e451dda3a6'::uuid, 'خالد الحارثي'::text),
    ('b88be9d2-b035-46c4-9558-451ca0d06268'::uuid, 'فارس الغامدي'::text),
    ('b3fbcdbe-e3c7-4396-9dfa-d948ae862f12'::uuid, 'نواف السبيعي'::text),
    ('ff5a01b3-638f-4fc6-b366-81fcbcdefb71'::uuid, 'تركي المالكي'::text),
    ('433f04c2-4cfc-4c9a-a288-58ac3d5ded6a'::uuid, 'عبدالعزيز القرشي'::text),
    ('defe2d4d-a96f-4a3d-913b-6f5c00317033'::uuid, 'صالح الشهراني'::text),
    ('18954e6f-ea82-48c0-ba13-d392cfb34a1d'::uuid, 'سعد البقمي'::text),
    ('69bb2ab8-3912-4de0-8033-f35ab814f60d'::uuid, 'ماجد الخالدي'::text),
    ('ababdaf1-7a2e-4181-9dba-0191a3d5e38e'::uuid, 'فواز الجهني'::text),
    ('b28a5f7e-402a-4a1d-9675-6a2735b0425f'::uuid, 'عوض العتيبي'::text),
    ('997b5eb4-52e0-4673-aeff-9ec87a84f792'::uuid, 'منصور الدوسري'::text),
    ('bff2536c-32e0-4807-a4c6-0b6115c7164e'::uuid, 'أيمن الحربي'::text),
    ('aaa403f4-bff9-4008-8985-64a486c0e0f4'::uuid, 'عمار العنزي'::text),
    ('e085b9b0-79fc-44f9-a9b4-b16c1b70b3ed'::uuid, 'مروان السلمي'::text)
)
UPDATE members m SET full_name = u.new_name
FROM updates u WHERE m.id = u.id;

-- ============================================================
-- 4. Fix member names for GymCore HQ
-- ============================================================
WITH updates (id, new_name) AS (
  VALUES
    ('3182e102-001a-4f3c-a052-d4119311e8d0'::uuid, 'أحمد السيد'::text),
    ('31989313-3fd9-417b-993a-c5ca39266a29'::uuid, 'محمد علي'::text),
    ('aea61165-243f-430d-935a-aea403c64ae0'::uuid, 'خالد العبدالله'::text),
    ('768dedf8-f970-47f7-827c-66ae563796a6'::uuid, 'سعد الشمري'::text),
    ('326c37e1-6d9a-445b-9441-9958d09a50f0'::uuid, 'عبدالله العتيبي'::text),
    ('b209a598-248e-43c3-bbba-26bc0ee9eb23'::uuid, 'فهد القحطاني'::text),
    ('59822f26-203f-43f1-8a7d-d6e2d3960bca'::uuid, 'ناصر الدوسري'::text),
    ('39ed3750-541d-4363-822e-131ccc9c4624'::uuid, 'بندر الزهراني'::text),
    ('a209458e-4087-4fcf-a0dd-9c1efa2fc5c4'::uuid, 'ماجد الحربي'::text),
    ('65e06a5c-8dbc-41a5-8462-99bc1bcaf686'::uuid, 'ياسر المالكي'::text),
    ('b2953a26-dcfc-49b8-b46a-ff6446da6ce9'::uuid, 'طلال الغامدي'::text),
    ('e9efc8cc-042c-4e09-a488-c996823ee2fd'::uuid, 'سامي العنزي'::text),
    ('ebb2110e-38b0-4a63-8798-3ee93ee67dfa'::uuid, 'حسن الجهني'::text),
    ('bfd441a5-0b25-4f6a-b4d5-b6c80357f3af'::uuid, 'حسين البقمي'::text),
    ('778f60f0-62d1-4097-b3f9-860110f1e179'::uuid, 'إبراهيم الخالدي'::text),
    ('356d51ca-bc09-4817-8ca8-621480067b52'::uuid, 'راشد البلوي'::text),
    ('aa6f389a-6e7d-42d4-b8a1-61ece95000db'::uuid, 'زياد المطيري'::text),
    ('aa0442e2-0d07-4d18-a25b-a27fe4d9ed5e'::uuid, 'شادي الشهراني'::text),
    ('6ab7c495-3c33-43f8-9545-7226cbc8263c'::uuid, 'تامر العجمي'::text),
    ('a28b06f8-18c3-491a-a5a1-391bc62573da'::uuid, 'سلطان السلمي'::text)
)
UPDATE members m SET full_name = u.new_name
FROM updates u WHERE m.id = u.id;

-- ============================================================
-- 5. Fix member names for alaml
-- ============================================================
WITH updates (id, new_name) AS (
  VALUES
    ('edc324fa-c941-42cb-9117-160b93c5a3d6'::uuid, 'ماهر العبدالله'::text),
    ('995f6a2e-e712-4093-94f1-ee3c8514d67e'::uuid, 'هاشم المطيري'::text),
    ('046cded3-277b-4567-865f-4d20ca56cd0e'::uuid, 'وليد الغامدي'::text),
    ('a26e71e5-29c2-4d98-92df-326eeb8cf6ba'::uuid, 'أوس الثقفي'::text),
    ('4be65e4b-c467-4c94-8841-a89844615a75'::uuid, 'ريان الشمري'::text),
    ('b6e28900-c764-414d-991b-949f863d92aa'::uuid, 'لؤي الزهراني'::text),
    ('8e75d1c7-a587-415a-90a1-616177df5b64'::uuid, 'معاذ القحطاني'::text),
    ('19edc48b-3d67-4490-a435-efb2a360d969'::uuid, 'أسامة المالكي'::text),
    ('1668de70-78a7-4c29-a323-3e361cf47856'::uuid, 'حاتم الحارثي'::text),
    ('f2031d36-0404-4827-a01d-f3af55d1863d'::uuid, 'زياد السبيعي'::text),
    ('1975a479-b9f7-40e9-968e-3b5b176421b2'::uuid, 'غسان الدوسري'::text),
    ('4ef7f4bd-158e-40bd-bba8-5a9781b5e67f'::uuid, 'أديب العجمي'::text),
    ('ceaf5c3e-5c0b-48c6-955c-287ed02a409c'::uuid, 'بسام الجهني'::text),
    ('053f4765-de2a-4bf8-a514-916f9aecf890'::uuid, 'جمال البقمي'::text),
    ('455f1abb-2868-4cc8-a286-3c363e93d856'::uuid, 'حامد الخالدي'::text),
    ('20180d4a-cd7c-48b7-adfc-1a87422cc995'::uuid, 'حمود العنزي'::text),
    ('7f85dbe1-481f-4c20-8207-d7b4443a4440'::uuid, 'رائد الشهراني'::text),
    ('b55bffb8-4506-4b19-bf23-6a8579252ecd'::uuid, 'زكريا الحربي'::text),
    ('d1413d2f-6bb5-4a9e-b44d-ffa91790cae6'::uuid, 'سالم المطيري'::text),
    ('1b5102ee-360e-4d73-9e3f-ab7aa12fdd24'::uuid, 'سعيد القرشي'::text)
)
UPDATE members m SET full_name = u.new_name
FROM updates u WHERE m.id = u.id;

-- ============================================================
-- 6. Verify the fixes
-- ============================================================
SELECT g.name AS gym_name, COUNT(*) AS total_members,
       COUNT(*) FILTER (WHERE m.full_name NOT LIKE '%?%') AS valid_names
FROM gyms g JOIN members m ON m.gym_id = g.id
WHERE g.id IN ('ecd07dc1-442f-4048-8fca-375e72451569',
               'd5768db3-fccf-4c62-b802-c70834fc50e6',
               '48a6f352-328e-4e91-b70b-19455d4063e8',
               'a0e5c0ed-2570-446e-957c-dc69388cfd0a')
GROUP BY g.id, g.name;

SELECT 'Fix complete!' AS status;
