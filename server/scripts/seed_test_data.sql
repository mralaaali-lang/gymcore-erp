-- ===================================================================
-- Seed Test Data Generation Script
-- Generates 20 members per gym with diverse states
-- Gyms without members: GymCore HQ, حامد جيم, alaml, نادي الاختبار التجريبي
-- ===================================================================

DO $$
DECLARE
    -- Gym IDs
    g_gymcore UUID := '48a6f352-328e-4e91-b70b-19455d4063e8';
    g_hamed UUID := 'd5768db3-fccf-4c62-b802-c70834fc50e6';
    g_alaml UUID := 'a0e5c0ed-2570-446e-957c-dc69388cfd0a';
    g_test UUID := 'ecd07dc1-442f-4048-8fca-375e72451569';

    -- Staff user IDs for existing gyms (owner)
    s_hamed UUID := 'b5570f96-ebf0-43a2-9e16-2444e8c226ff';
    s_alaml UUID := '2c3018d9-4de4-4fa2-892e-c5c2335cc3f4';
    s_test UUID := 'de7876d4-b9ec-4027-b436-6211343877db';
    s_gymcore UUID := gen_random_uuid(); -- GymCore HQ owner

    -- Offer IDs per gym
    o1_gymcore UUID; o2_gymcore UUID; o3_gymcore UUID; o4_gymcore UUID;
    o1_hamed UUID; o2_hamed UUID; o3_hamed UUID; o4_hamed UUID;
    o1_alaml UUID; o2_alaml UUID; o3_alaml UUID; o4_alaml UUID;
    o1_test UUID; o2_test UUID; o3_test UUID; o4_test UUID;

    -- Staff IDs for coaches/trainers
    coach_gymcore UUID; coach_hamed UUID; coach_alaml UUID; coach_test UUID;

    -- PT package IDs
    pkg_gymcore UUID; pkg_hamed UUID; pkg_alaml UUID; pkg_test UUID;

    -- Member IDs
    member_id UUID;
    sub_id UUID;
    inv_id UUID;

    -- Iteration variables
    i INT;
    j INT;
    rand_val NUMERIC;
    status_val VARCHAR(20);
    offer_id UUID;
    offer_price NUMERIC(10,2);
    offer_days INT;
    start_date DATE;
    end_date DATE;
    latest_invoice_id UUID;
    staff_gymcore UUID;
    staff_hamed UUID;
    staff_alaml UUID;
    staff_test UUID;

    -- Arabic names pool (20 unique names per gym = 80 total)
    names_pool TEXT[] := ARRAY[
        'أحمد السيد', 'محمد علي', 'خالد العبدالله', 'سعد الشمري', 'عبدالله العتيبي',
        'فهد القحطاني', 'ناصر الدوسري', 'بندر الزهراني', 'ماجد الحربي', 'ياسر المالكي',
        'طلال الغامدي', 'سامي العنزي', 'حسن الجهني', 'حسين البقمي', 'إبراهيم الخالدي',
        'راشد البلوي', 'زياد المطيري', 'شادي الشهراني', 'تامر العجمي', 'سلطان السلمي',
        'مشعل الثقفي', 'بدر السبيعي', 'هاني الشمري', 'نايف الزهراني', 'جابر القحطاني',
        'عبدالرحمن الدوسري', 'خالد الحارثي', 'فارس الغامدي', 'نواف السبيعي', 'تركي المالكي',
        'عبدالعزيز القرشي', 'صالح الشهراني', 'سعد البقمي', 'ماجد الخالدي', 'فواز الجهني',
        'عوض العتيبي', 'منصور الدوسري', 'أيمن الحربي', 'عمار العنزي', 'مروان السلمي',
        'ماهر العبدالله', 'هاشم المطيري', 'وليد الغامدي', 'أوس الثقفي', 'ريان الشمري',
        'لؤي الزهراني', 'معاذ القحطاني', 'أسامة المالكي', 'حاتم الحارثي', 'زياد السبيعي',
        'غسان الدوسري', 'أديب العجمي', 'بسام الجهني', 'جمال البقمي', 'حامد الخالدي',
        'حمود العنزي', 'رائد الشهراني', 'زكريا الحربي', 'سالم المطيري', 'سعيد القرشي',
        'شاكر الغامدي', 'صقر السلمي', 'ضياء العتيبي', 'عاصم السيد', 'عامر الشمري',
        'عباس الزهراني', 'عدنان المالكي', 'علي الدوسري', 'عمر الحارثي', 'فؤاد الجهني',
        'مصعب البقمي', 'موسى الخالدي', 'نادر العنزي', 'هشام السبيعي', 'وحيد القحطاني',
        'إيهاب المطيري', 'بهاء الثقفي', 'جهاد العبدالله', 'حسام الشهراني', 'سهيل الحربي'
    ];
BEGIN
    -- ===============================================================
    -- STEP 1: Create GymCore HQ owner staff user if not exists
    -- ===============================================================
    INSERT INTO staff_users (id, gym_id, full_name, email, password_hash, role)
    VALUES (s_gymcore, g_gymcore, 'مدير GymCore', 'admin@gymcore.app',
            '$2b$10$placeholder_hash_for_admin', 'owner')
    ON CONFLICT (id) DO NOTHING;

    -- ===============================================================
    -- STEP 1b: Temporarily disable the encryption trigger on members
    -- so we can insert phone numbers directly
    -- ===============================================================
    DROP TRIGGER IF EXISTS trg_members_encrypt ON members;

    -- ===============================================================
    -- STEP 2: Create membership_offers for the 4 gyms
    -- ===============================================================
    -- GymCore HQ offers
    o1_gymcore := gen_random_uuid(); o2_gymcore := gen_random_uuid();
    o3_gymcore := gen_random_uuid(); o4_gymcore := gen_random_uuid();
    INSERT INTO membership_offers (id, gym_id, title, duration_days, price) VALUES
        (o1_gymcore, g_gymcore, 'شهر واحد', 30, 200.00),
        (o2_gymcore, g_gymcore, '3 أشهر', 90, 500.00),
        (o3_gymcore, g_gymcore, '6 أشهر', 180, 900.00),
        (o4_gymcore, g_gymcore, 'سنة كاملة', 365, 1500.00);

    -- حامد جيم offers
    o1_hamed := gen_random_uuid(); o2_hamed := gen_random_uuid();
    o3_hamed := gen_random_uuid(); o4_hamed := gen_random_uuid();
    INSERT INTO membership_offers (id, gym_id, title, duration_days, price) VALUES
        (o1_hamed, g_hamed, 'شهر واحد', 30, 250.00),
        (o2_hamed, g_hamed, '3 أشهر', 90, 600.00),
        (o3_hamed, g_hamed, '6 أشهر', 180, 1000.00),
        (o4_hamed, g_hamed, 'سنة كاملة', 365, 1800.00);

    -- alaml offers
    o1_alaml := gen_random_uuid(); o2_alaml := gen_random_uuid();
    o3_alaml := gen_random_uuid(); o4_alaml := gen_random_uuid();
    INSERT INTO membership_offers (id, gym_id, title, duration_days, price) VALUES
        (o1_alaml, g_alaml, 'شهر واحد', 30, 200.00),
        (o2_alaml, g_alaml, '3 أشهر', 90, 500.00),
        (o3_alaml, g_alaml, '6 أشهر', 180, 900.00),
        (o4_alaml, g_alaml, 'سنة كاملة', 365, 1500.00);

    -- نادي الاختبار التجريبي offers
    o1_test := gen_random_uuid(); o2_test := gen_random_uuid();
    o3_test := gen_random_uuid(); o4_test := gen_random_uuid();
    INSERT INTO membership_offers (id, gym_id, title, duration_days, price) VALUES
        (o1_test, g_test, 'شهر واحد', 30, 200.00),
        (o2_test, g_test, '3 أشهر', 90, 500.00),
        (o3_test, g_test, '6 أشهر', 180, 900.00),
        (o4_test, g_test, 'سنة كاملة', 365, 1500.00);

    -- ===============================================================
    -- STEP 3: Create coaches/trainers for the 4 gyms
    -- ===============================================================
    coach_gymcore := gen_random_uuid(); coach_hamed := gen_random_uuid();
    coach_alaml := gen_random_uuid(); coach_test := gen_random_uuid();

    INSERT INTO staff_users (id, gym_id, full_name, email, password_hash, role) VALUES
        (coach_gymcore, g_gymcore, 'مدرب GymCore', 'coach@gymcore.app', '$2b$10$placeholder', 'coach'),
        (coach_hamed, g_hamed, 'مدرب حامد', 'coach@hamedgym.com', '$2b$10$placeholder', 'coach'),
        (coach_alaml, g_alaml, 'مدرب alaml', 'coach@alaml.com', '$2b$10$placeholder', 'coach'),
        (coach_test, g_test, 'مدرب اختبار', 'coach@test-gym.com', '$2b$10$placeholder', 'coach');

    -- Also create receptionists for these gyms
    INSERT INTO staff_users (id, gym_id, full_name, email, password_hash, role) VALUES
        (gen_random_uuid(), g_gymcore, 'مستقبل GymCore', 'reception@gymcore.app', '$2b$10$placeholder', 'receptionist'),
        (gen_random_uuid(), g_hamed, 'مستقبل حامد', 'reception@hamedgym.com', '$2b$10$placeholder', 'receptionist'),
        (gen_random_uuid(), g_alaml, 'مستقبل alaml', 'reception@alaml.com', '$2b$10$placeholder', 'receptionist'),
        (gen_random_uuid(), g_test, 'مستقبل اختبار', 'reception@test-gym.com', '$2b$10$placeholder', 'receptionist');

    -- ===============================================================
    -- STEP 4: Create PT Packages for the 4 gyms
    -- ===============================================================
    pkg_gymcore := gen_random_uuid(); pkg_hamed := gen_random_uuid();
    pkg_alaml := gen_random_uuid(); pkg_test := gen_random_uuid();

    INSERT INTO pt_packages (id, gym_id, name, session_count, total_price) VALUES
        (pkg_gymcore, g_gymcore, '5 جلسات', 5, 500.00),
        (pkg_hamed, g_hamed, '5 جلسات', 5, 600.00),
        (pkg_alaml, g_alaml, '5 جلسات', 5, 500.00),
        (pkg_test, g_test, '5 جلسات', 5, 500.00);

    -- ===============================================================
    -- STEP 5: Identify staff for orders (use receptionists or owners)
    -- ===============================================================
    SELECT id INTO staff_gymcore FROM staff_users WHERE gym_id = g_gymcore AND role = 'receptionist' LIMIT 1;
    SELECT id INTO staff_hamed FROM staff_users WHERE gym_id = g_hamed AND role = 'receptionist' LIMIT 1;
    SELECT id INTO staff_alaml FROM staff_users WHERE gym_id = g_alaml AND role = 'receptionist' LIMIT 1;
    SELECT id INTO staff_test FROM staff_users WHERE gym_id = g_test AND role = 'receptionist' LIMIT 1;

    -- ===============================================================
    -- STEP 6: Create 20 members for each of the 4 gyms
    -- ===============================================================
    FOR j IN 0..3 LOOP
        -- Select gym
        CASE j
            WHEN 0 THEN
                -- GymCore HQ
                FOR i IN 1..20 LOOP
                    member_id := gen_random_uuid();
                    INSERT INTO members (id, gym_id, full_name, phone_number, birth_date, medical_notes)
                    VALUES (
                        member_id,
                        g_gymcore,
                        names_pool[i],
                        '+9665' || (1000000 + floor(random() * 8999999)::INT)::TEXT,
                        DATE '1970-01-01' + (random() * 18000)::INT,
                        CASE WHEN random() < 0.2 THEN 'ملاحظات طبية' ELSE NULL END
                    );

                    -- Subscription
                    rand_val := random();
                    IF rand_val < 0.5 THEN
                        -- Active subscription (50%)
                        status_val := 'active';
                        offer_id := (ARRAY[o1_gymcore, o2_gymcore, o3_gymcore, o4_gymcore])[1 + floor(random() * 4)::INT];
                    ELSIF rand_val < 0.8 THEN
                        -- Expired subscription (30%)
                        status_val := 'expired';
                        offer_id := (ARRAY[o1_gymcore, o2_gymcore])[1 + floor(random() * 2)::INT];
                    ELSE
                        -- Frozen subscription (20%)
                        status_val := 'frozen';
                        offer_id := (ARRAY[o1_gymcore, o2_gymcore, o3_gymcore])[1 + floor(random() * 3)::INT];
                    END IF;

                    SELECT price, duration_days INTO offer_price, offer_days
                    FROM membership_offers WHERE id = offer_id;

                    IF status_val = 'active' THEN
                        start_date := CURRENT_DATE - (random() * 60)::INT - 30;
                        end_date := start_date + offer_days;
                    ELSIF status_val = 'expired' THEN
                        end_date := CURRENT_DATE - (random() * 30)::INT - 1;
                        start_date := end_date - offer_days;
                    ELSE
                        -- frozen
                        start_date := CURRENT_DATE - (random() * 90)::INT - 30;
                        end_date := start_date + offer_days;
                    END IF;

                    sub_id := gen_random_uuid();
                    INSERT INTO member_subscriptions (id, gym_id, member_id, offer_id, price_paid, start_date, end_date, status)
                    VALUES (sub_id, g_gymcore, member_id, offer_id, offer_price, start_date, end_date, status_val);

                    -- Billing invoices (1 per subscription)
                    inv_id := gen_random_uuid();
                    INSERT INTO billing_invoices (id, gym_id, amount, status, period_start, period_end, paid_at)
                    VALUES (
                        inv_id, g_gymcore, offer_price,
                        CASE WHEN status_val = 'active' THEN 'paid'
                             WHEN status_val = 'expired' AND random() < 0.5 THEN 'paid'
                             ELSE 'pending'
                        END,
                        start_date, end_date,
                        CASE WHEN random() < 0.6 THEN start_date + (random() * 3)::INT ELSE NULL END
                    );

                    -- Member debts (30% chance)
                    IF random() < 0.3 THEN
                        INSERT INTO member_debts (id, gym_id, member_id, original_amount, remaining_amount, due_date, reason, status)
                        VALUES (
                            gen_random_uuid(), g_gymcore, member_id,
                            (random() * 500 + 50)::NUMERIC(10,2),
                            (random() * 300)::NUMERIC(10,2),
                            CURRENT_DATE + (random() * 14)::INT,
                            CASE WHEN random() < 0.5 THEN 'رسوم اشتراك متأخرة' ELSE 'مشتريات مؤجلة' END,
                            CASE WHEN random() < 0.6 THEN 'active' ELSE 'paid' END
                        );
                    END IF;

                    -- Attendance logs (60% chance, 1-30 entries, unique days)
                    IF random() < 0.6 THEN
                        FOR k IN 1..(1 + floor(random() * 29)::INT) LOOP
                            BEGIN
                                INSERT INTO attendance_logs (id, gym_id, member_id, check_in_time, entry_method)
                                VALUES (
                                    gen_random_uuid(), g_gymcore, member_id,
                                    (CURRENT_DATE - (k + floor(random() * 60)::INT)) + (random() * 12 || ' hours')::INTERVAL,
                                    CASE WHEN random() < 0.7 THEN 'qr_code' ELSE 'manual_phone' END
                                );
                            EXCEPTION WHEN unique_violation THEN
                                -- Skip duplicate attendance for same day
                            END;
                        END LOOP;
                    END IF;

                    -- PT Sessions (40% chance)
                    IF random() < 0.4 THEN
                        INSERT INTO pt_sessions (id, gym_id, package_id, member_id, trainer_id, session_number, scheduled_at, completed_at, status)
                        VALUES (
                            gen_random_uuid(), g_gymcore, pkg_gymcore, member_id, coach_gymcore, 1,
                            CURRENT_DATE - (random() * 14)::INT,
                            CURRENT_DATE - (random() * 14)::INT,
                            'completed'
                        );
                    END IF;

                    -- POS Orders (30% chance)
                    IF random() < 0.3 THEN
                        INSERT INTO pos_orders (id, gym_id, staff_user_id, member_id, total_amount, payment_method)
                        VALUES (
                            gen_random_uuid(), g_gymcore, staff_gymcore, member_id,
                            (random() * 200 + 10)::NUMERIC(10,2),
                            (ARRAY['cash', 'card', 'fawry'])[1 + floor(random() * 3)::INT]
                        );
                    END IF;
                END LOOP;

            WHEN 1 THEN
                -- حامد جيم
                FOR i IN 1..20 LOOP
                    member_id := gen_random_uuid();
                    INSERT INTO members (id, gym_id, full_name, phone_number, birth_date)
                    VALUES (
                        member_id, g_hamed,
                        names_pool[20 + i],
                        '+9665' || (1000000 + floor(random() * 8999999)::INT)::TEXT,
                        DATE '1970-01-01' + (random() * 18000)::INT
                    );

                    rand_val := random();
                    IF rand_val < 0.5 THEN status_val := 'active'; offer_id := (ARRAY[o1_hamed, o2_hamed, o3_hamed, o4_hamed])[1 + floor(random() * 4)::INT];
                    ELSIF rand_val < 0.8 THEN status_val := 'expired'; offer_id := (ARRAY[o1_hamed, o2_hamed])[1 + floor(random() * 2)::INT];
                    ELSE status_val := 'frozen'; offer_id := (ARRAY[o1_hamed, o2_hamed])[1 + floor(random() * 2)::INT];
                    END IF;

                    SELECT price, duration_days INTO offer_price, offer_days FROM membership_offers WHERE id = offer_id;
                    IF status_val = 'active' THEN start_date := CURRENT_DATE - (random() * 60)::INT - 30; end_date := start_date + offer_days;
                    ELSIF status_val = 'expired' THEN end_date := CURRENT_DATE - (random() * 30)::INT - 1; start_date := end_date - offer_days;
                    ELSE start_date := CURRENT_DATE - (random() * 90)::INT - 30; end_date := start_date + offer_days;
                    END IF;

                    INSERT INTO member_subscriptions (id, gym_id, member_id, offer_id, price_paid, start_date, end_date, status)
                    VALUES (gen_random_uuid(), g_hamed, member_id, offer_id, offer_price, start_date, end_date, status_val);

                    INSERT INTO billing_invoices (id, gym_id, amount, status, period_start, period_end, paid_at)
                    VALUES (gen_random_uuid(), g_hamed, offer_price,
                        CASE WHEN status_val = 'active' THEN 'paid' WHEN status_val = 'expired' AND random() < 0.5 THEN 'paid' ELSE 'pending' END,
                        start_date, end_date, CASE WHEN random() < 0.6 THEN start_date + (random() * 3)::INT ELSE NULL END);

                    IF random() < 0.3 THEN
                        INSERT INTO member_debts (id, gym_id, member_id, original_amount, remaining_amount, due_date, reason, status)
                        VALUES (gen_random_uuid(), g_hamed, member_id, (random() * 500 + 50)::NUMERIC(10,2), (random() * 300)::NUMERIC(10,2),
                            CURRENT_DATE + (random() * 14)::INT, 'رسوم متأخرة', CASE WHEN random() < 0.6 THEN 'active' ELSE 'paid' END);
                    END IF;

                    IF random() < 0.6 THEN
                        FOR k IN 1..(1 + floor(random() * 29)::INT) LOOP
                            BEGIN
                                INSERT INTO attendance_logs (id, gym_id, member_id, check_in_time, entry_method)
                                VALUES (gen_random_uuid(), g_hamed, member_id,
                                    (CURRENT_DATE - (k + floor(random() * 60)::INT)) + (random() * 12 || ' hours')::INTERVAL,
                                    CASE WHEN random() < 0.7 THEN 'qr_code' ELSE 'manual_phone' END);
                            EXCEPTION WHEN unique_violation THEN END;
                        END LOOP;
                    END IF;

                    IF random() < 0.4 THEN
                        INSERT INTO pt_sessions (id, gym_id, package_id, member_id, trainer_id, session_number, scheduled_at, completed_at, status)
                        VALUES (gen_random_uuid(), g_hamed, pkg_hamed, member_id, coach_hamed, 1,
                            CURRENT_DATE - (random() * 14)::INT, CURRENT_DATE - (random() * 14)::INT, 'completed');
                    END IF;

                    IF random() < 0.3 THEN
                        INSERT INTO pos_orders (id, gym_id, staff_user_id, member_id, total_amount, payment_method)
                        VALUES (gen_random_uuid(), g_hamed, staff_hamed, member_id,
                            (random() * 200 + 10)::NUMERIC(10,2), (ARRAY['cash', 'card', 'fawry'])[1 + floor(random() * 3)::INT]);
                    END IF;
                END LOOP;

            WHEN 2 THEN
                -- alaml
                FOR i IN 1..20 LOOP
                    member_id := gen_random_uuid();
                    INSERT INTO members (id, gym_id, full_name, phone_number, birth_date)
                    VALUES (member_id, g_alaml, names_pool[40 + i],
                        '+9665' || (1000000 + floor(random() * 8999999)::INT)::TEXT,
                        DATE '1970-01-01' + (random() * 18000)::INT);

                    rand_val := random();
                    IF rand_val < 0.5 THEN status_val := 'active'; offer_id := (ARRAY[o1_alaml, o2_alaml, o3_alaml, o4_alaml])[1 + floor(random() * 4)::INT];
                    ELSIF rand_val < 0.8 THEN status_val := 'expired'; offer_id := (ARRAY[o1_alaml, o2_alaml])[1 + floor(random() * 2)::INT];
                    ELSE status_val := 'frozen'; offer_id := (ARRAY[o1_alaml, o2_alaml])[1 + floor(random() * 2)::INT];
                    END IF;

                    SELECT price, duration_days INTO offer_price, offer_days FROM membership_offers WHERE id = offer_id;
                    IF status_val = 'active' THEN start_date := CURRENT_DATE - (random() * 60)::INT - 30; end_date := start_date + offer_days;
                    ELSIF status_val = 'expired' THEN end_date := CURRENT_DATE - (random() * 30)::INT - 1; start_date := end_date - offer_days;
                    ELSE start_date := CURRENT_DATE - (random() * 90)::INT - 30; end_date := start_date + offer_days;
                    END IF;

                    INSERT INTO member_subscriptions (id, gym_id, member_id, offer_id, price_paid, start_date, end_date, status)
                    VALUES (gen_random_uuid(), g_alaml, member_id, offer_id, offer_price, start_date, end_date, status_val);

                    INSERT INTO billing_invoices (id, gym_id, amount, status, period_start, period_end, paid_at)
                    VALUES (gen_random_uuid(), g_alaml, offer_price,
                        CASE WHEN status_val = 'active' THEN 'paid' WHEN status_val = 'expired' AND random() < 0.5 THEN 'paid' ELSE 'pending' END,
                        start_date, end_date, CASE WHEN random() < 0.6 THEN start_date + (random() * 3)::INT ELSE NULL END);

                    IF random() < 0.3 THEN
                        INSERT INTO member_debts (id, gym_id, member_id, original_amount, remaining_amount, due_date, reason, status)
                        VALUES (gen_random_uuid(), g_alaml, member_id, (random() * 500 + 50)::NUMERIC(10,2), (random() * 300)::NUMERIC(10,2),
                            CURRENT_DATE + (random() * 14)::INT, 'ديون اشتراك', CASE WHEN random() < 0.6 THEN 'active' ELSE 'paid' END);
                    END IF;

                    IF random() < 0.6 THEN
                        FOR k IN 1..(1 + floor(random() * 29)::INT) LOOP
                            BEGIN
                                INSERT INTO attendance_logs (id, gym_id, member_id, check_in_time, entry_method)
                                VALUES (gen_random_uuid(), g_alaml, member_id,
                                    (CURRENT_DATE - (k + floor(random() * 60)::INT)) + (random() * 12 || ' hours')::INTERVAL,
                                    CASE WHEN random() < 0.7 THEN 'qr_code' ELSE 'manual_phone' END);
                            EXCEPTION WHEN unique_violation THEN END;
                        END LOOP;
                    END IF;

                    IF random() < 0.4 THEN
                        INSERT INTO pt_sessions (id, gym_id, package_id, member_id, trainer_id, session_number, scheduled_at, completed_at, status)
                        VALUES (gen_random_uuid(), g_alaml, pkg_alaml, member_id, coach_alaml, 1,
                            CURRENT_DATE - (random() * 14)::INT, CURRENT_DATE - (random() * 14)::INT, 'completed');
                    END IF;

                    IF random() < 0.3 THEN
                        INSERT INTO pos_orders (id, gym_id, staff_user_id, member_id, total_amount, payment_method)
                        VALUES (gen_random_uuid(), g_alaml, staff_alaml, member_id,
                            (random() * 200 + 10)::NUMERIC(10,2), (ARRAY['cash', 'card', 'fawry'])[1 + floor(random() * 3)::INT]);
                    END IF;
                END LOOP;

            WHEN 3 THEN
                -- نادي الاختبار التجريبي (test-gym-2026)
                FOR i IN 1..20 LOOP
                    member_id := gen_random_uuid();
                    INSERT INTO members (id, gym_id, full_name, phone_number, birth_date)
                    VALUES (member_id, g_test, names_pool[60 + i],
                        '+9665' || (1000000 + floor(random() * 8999999)::INT)::TEXT,
                        DATE '1970-01-01' + (random() * 18000)::INT);

                    rand_val := random();
                    IF rand_val < 0.5 THEN status_val := 'active'; offer_id := (ARRAY[o1_test, o2_test, o3_test, o4_test])[1 + floor(random() * 4)::INT];
                    ELSIF rand_val < 0.8 THEN status_val := 'expired'; offer_id := (ARRAY[o1_test, o2_test])[1 + floor(random() * 2)::INT];
                    ELSE status_val := 'frozen'; offer_id := (ARRAY[o1_test, o2_test])[1 + floor(random() * 2)::INT];
                    END IF;

                    SELECT price, duration_days INTO offer_price, offer_days FROM membership_offers WHERE id = offer_id;
                    IF status_val = 'active' THEN start_date := CURRENT_DATE - (random() * 60)::INT - 30; end_date := start_date + offer_days;
                    ELSIF status_val = 'expired' THEN end_date := CURRENT_DATE - (random() * 30)::INT - 1; start_date := end_date - offer_days;
                    ELSE start_date := CURRENT_DATE - (random() * 90)::INT - 30; end_date := start_date + offer_days;
                    END IF;

                    INSERT INTO member_subscriptions (id, gym_id, member_id, offer_id, price_paid, start_date, end_date, status)
                    VALUES (gen_random_uuid(), g_test, member_id, offer_id, offer_price, start_date, end_date, status_val);

                    INSERT INTO billing_invoices (id, gym_id, amount, status, period_start, period_end, paid_at)
                    VALUES (gen_random_uuid(), g_test, offer_price,
                        CASE WHEN status_val = 'active' THEN 'paid' WHEN status_val = 'expired' AND random() < 0.5 THEN 'paid' ELSE 'pending' END,
                        start_date, end_date, CASE WHEN random() < 0.6 THEN start_date + (random() * 3)::INT ELSE NULL END);

                    IF random() < 0.3 THEN
                        INSERT INTO member_debts (id, gym_id, member_id, original_amount, remaining_amount, due_date, reason, status)
                        VALUES (gen_random_uuid(), g_test, member_id, (random() * 500 + 50)::NUMERIC(10,2), (random() * 300)::NUMERIC(10,2),
                            CURRENT_DATE + (random() * 14)::INT, 'اشتراك مؤجل', CASE WHEN random() < 0.6 THEN 'active' ELSE 'paid' END);
                    END IF;

                    IF random() < 0.6 THEN
                        FOR k IN 1..(1 + floor(random() * 29)::INT) LOOP
                            BEGIN
                                INSERT INTO attendance_logs (id, gym_id, member_id, check_in_time, entry_method)
                                VALUES (gen_random_uuid(), g_test, member_id,
                                    (CURRENT_DATE - (k + floor(random() * 60)::INT)) + (random() * 12 || ' hours')::INTERVAL,
                                    CASE WHEN random() < 0.7 THEN 'qr_code' ELSE 'manual_phone' END);
                            EXCEPTION WHEN unique_violation THEN END;
                        END LOOP;
                    END IF;

                    IF random() < 0.4 THEN
                        INSERT INTO pt_sessions (id, gym_id, package_id, member_id, trainer_id, session_number, scheduled_at, completed_at, status)
                        VALUES (gen_random_uuid(), g_test, pkg_test, member_id, coach_test, 1,
                            CURRENT_DATE - (random() * 14)::INT, CURRENT_DATE - (random() * 14)::INT, 'completed');
                    END IF;

                    IF random() < 0.3 THEN
                        INSERT INTO pos_orders (id, gym_id, staff_user_id, member_id, total_amount, payment_method)
                        VALUES (gen_random_uuid(), g_test, staff_test, member_id,
                            (random() * 200 + 10)::NUMERIC(10,2), (ARRAY['cash', 'card', 'fawry'])[1 + floor(random() * 3)::INT]);
                    END IF;
                END LOOP;
        END CASE;
    END LOOP;

    -- ===============================================================
    -- STEP 7: Create PT packages for the 3 existing gyms that don't have them
    -- ===============================================================
    INSERT INTO pt_packages (id, gym_id, name, session_count, total_price) VALUES
        (gen_random_uuid(), 'e329d6f0-8139-4d93-b2a7-0675c3b0e805', '5 جلسات', 5, 500.00),
        (gen_random_uuid(), 'd5febde1-97a4-42c1-9d7a-c09a584a2535', '5 جلسات', 5, 500.00),
        (gen_random_uuid(), 'b8a1ea33-84af-4048-8143-50eb1213c2ab', '5 جلسات', 5, 500.00)
    ON CONFLICT DO NOTHING;

    -- ===============================================================
    -- STEP 8: Re-enable the encryption trigger and populate hash
    -- ===============================================================
    -- Update phone_hash for newly inserted members (phone_encrypted will be
    -- set by the trigger on future updates, or after key is configured)
    UPDATE members SET
        phone_hash = phone_hash(phone_number)
    WHERE phone_hash IS NULL AND phone_number IS NOT NULL;

    -- Re-create the trigger
    CREATE TRIGGER trg_members_encrypt
      BEFORE INSERT OR UPDATE OF phone_number, medical_notes ON members
      FOR EACH ROW EXECUTE FUNCTION trg_members_encrypt();

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Seeding Complete!';
    RAISE NOTICE '==========================================';
END $$;

-- ===============================================================
-- Verification Queries (run separately)
-- ===============================================================
SELECT g.name AS gym_name, COUNT(m.id) AS member_count
FROM gyms g LEFT JOIN members m ON m.gym_id = g.id
GROUP BY g.id, g.name ORDER BY g.name;

SELECT 'Subscriptions' AS metric, COUNT(*) AS count FROM member_subscriptions
UNION ALL SELECT 'Invoices', COUNT(*) FROM billing_invoices
UNION ALL SELECT 'Debts', COUNT(*) FROM member_debts
UNION ALL SELECT 'Attendance Logs', COUNT(*) FROM attendance_logs
UNION ALL SELECT 'PT Sessions', COUNT(*) FROM pt_sessions
UNION ALL SELECT 'POS Orders', COUNT(*) FROM pos_orders;

