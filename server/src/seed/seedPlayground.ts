import { getClient } from '../config/database';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

const GYM_COUNT = 3;
const MEMBERS_PER_GYM = 100;

const GYM_NAMES = ['لياقة الأبطال', 'جيم تايتان', 'باور هاوس'];
const PLAN_TIERS: ('basic' | 'premium' | 'enterprise')[] = ['basic', 'premium', 'enterprise'];

const OFFER_TEMPLATES = [
  { title: 'شهر واحد', duration_days: 30, price: 200 },
  { title: '3 أشهر', duration_days: 90, price: 500 },
  { title: '6 أشهر', duration_days: 180, price: 900 },
  { title: 'سنة كاملة', duration_days: 365, price: 1500 },
];

const FIRST_NAMES_MALE = [
  'أحمد', 'محمد', 'علي', 'خالد', 'عمر', 'عبدالله', 'فيصل', 'سعد', 'نواف', 'ماجد',
  'ياسر', 'هاني', 'تركي', 'بدر', 'سلطان', 'فهد', 'نايف', 'مشعل', 'عبدالرحمن', 'طلال',
  'سامي', 'حسن', 'حسين', 'إبراهيم', 'تامر', 'جابر', 'راشد', 'زياد', 'شادي', 'صالح',
  'طارق', 'عبدالعزيز', 'غانم', 'فارس', 'قتيبة', 'مروان', 'ناصر', 'هاشم', 'وليد', 'يحيى',
  'أكرم', 'بسام', 'تميم', 'جاسم', 'حامد', 'داوود', 'رامي', 'زكريا', 'سالم', 'شاكر',
];

const LAST_NAMES = [
  'الزهراني', 'القحطاني', 'العتيبي', 'الدوسري', 'الغامدي',
  'الشهراني', 'المطيري', 'الحربي', 'العنزي', 'الجهني',
  'الشمري', 'الخالدي', 'البلوي', 'المالكي', 'البقمي',
];

function parseArgs(): { reset: boolean } {
  return { reset: process.argv.includes('--reset') };
}

async function seed(): Promise<void> {
  const args = parseArgs();
  logger.info('=== Seed Playground: Generating demo data ===');

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (args.reset) {
      await client.query('DELETE FROM activity_logs');
      await client.query('DELETE FROM class_bookings');
      await client.query('DELETE FROM attendance_logs');
      await client.query('DELETE FROM member_subscriptions');
      await client.query('DELETE FROM membership_offers');
      await client.query('DELETE FROM members');
      await client.query('DELETE FROM staff_users');
      await client.query('DELETE FROM gyms');
      await client.query('DELETE FROM expense_categories');
      await client.query('DELETE FROM fitness_classes');
      await client.query('DELETE FROM products');
      await client.query('DELETE FROM pos_orders');
      await client.query('DELETE FROM pos_order_items');
      await client.query('DELETE FROM financial_transactions');
      await client.query('DELETE FROM supplier_invoices');
      await client.query('DELETE FROM suppliers');
      await client.query('DELETE FROM member_debts');
      await client.query('DELETE FROM cashbox_sessions');
      await client.query('DELETE FROM pt_sessions');
      await client.query('DELETE FROM pt_packages');
      await client.query('DELETE FROM payroll_ledger');
      await client.query('DELETE FROM staff_shifts');
      await client.query('DELETE FROM announcements');
      await client.query('DELETE FROM schema_migrations');
      logger.info('Reset complete: all data wiped');
    }

    // Super Admin placeholder gym
    await client.query(
      `INSERT INTO gyms (id, name, subdomain, plan_tier, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), 'GymCore HQ', 'gymcore', 'enterprise', true],
    );
    logger.info('Created placeholder gym for super admin');

    const gymIds: string[] = [];

    for (let g = 0; g < GYM_COUNT; g++) {
      const gymId = uuidv4();
      gymIds.push(gymId);

      const gymName = GYM_NAMES[g];
      const subdomain = `gym-${g + 1}`;

      await client.query(
        `INSERT INTO gyms (id, name, subdomain, plan_tier, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [gymId, gymName, subdomain, PLAN_TIERS[g]],
      );

      // Default "Main" branch (members.branch_id is NOT NULL)
      const branchId = uuidv4();
      await client.query(
        `INSERT INTO branches (id, gym_id, name, code, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
        [branchId, gymId, 'Main', `MAIN-${gymId.slice(0, 8).toUpperCase()}`, true],
      );

      const ownerHash = await bcrypt.hash('Owner@123', 12);
      await client.query(
        `INSERT INTO staff_users (id, gym_id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), gymId, `owner@gym${g + 1}.com`, ownerHash, `مدير مؤسس ${gymName}`, 'manager'],
      );

      const mgrHash = await bcrypt.hash('Manager@123', 12);
      await client.query(
        `INSERT INTO staff_users (id, gym_id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), gymId, `manager@gym${g + 1}.com`, mgrHash, `مدير ${gymName}`, 'manager'],
      );

      const recHash = await bcrypt.hash('Rec@1234', 12);
      await client.query(
        `INSERT INTO staff_users (id, gym_id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), gymId, `reception@gym${g + 1}.com`, recHash, `مستقبل ${gymName}`, 'receptionist'],
      );

      const coachHash = await bcrypt.hash('Coach@123', 12);
      await client.query(
        `INSERT INTO staff_users (id, gym_id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), gymId, `coach@gym${g + 1}.com`, coachHash, `مدرب ${gymName}`, 'coach'],
      );

      const offerIds: string[] = [];
      for (const tmpl of OFFER_TEMPLATES) {
        const offerId = uuidv4();
        offerIds.push(offerId);
        await client.query(
          `INSERT INTO membership_offers (id, gym_id, title, duration_days, price, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [offerId, gymId, tmpl.title, tmpl.duration_days, tmpl.price],
        );
      }

      const statuses: ('active' | 'expired' | 'frozen')[] = ['active', 'active', 'active', 'active', 'active', 'active', 'expired', 'frozen'];
      const memberIds: string[] = [];

      for (let m = 0; m < MEMBERS_PER_GYM; m++) {
        const memberId = uuidv4();
        memberIds.push(memberId);

        const firstName = FIRST_NAMES_MALE[m % FIRST_NAMES_MALE.length];
        const lastName = LAST_NAMES[m % LAST_NAMES.length];
        const fullName = `${firstName} ${lastName}`;
        const phone = `+9665${String(10000000 + Math.floor(Math.random() * 89999999)).padStart(8, '0')}`;

        await client.query(
          `INSERT INTO members (id, gym_id, branch_id, full_name, phone_number, photo_url, is_blacklisted, blacklist_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            memberId, gymId, branchId, fullName, phone,
            `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`,
            m === 0 ? true : false,
            m === 0 ? 'قيد التحقق - مخالفة قواعد النادي' : null,
          ],
        );

        const status = m === 0 ? 'active' : statuses[m % statuses.length];
        const offerIndex = m % offerIds.length;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - Math.floor(Math.random() * OFFER_TEMPLATES[offerIndex].duration_days));

        const endDate = new Date(startDate);
        if (status === 'expired') {
          endDate.setDate(endDate.getDate() - Math.floor(Math.random() * 30) - 1);
          startDate.setDate(endDate.getDate() - OFFER_TEMPLATES[offerIndex].duration_days);
        } else if (status === 'frozen') {
          endDate.setDate(endDate.getDate() + OFFER_TEMPLATES[offerIndex].duration_days);
        } else {
          endDate.setDate(endDate.getDate() + OFFER_TEMPLATES[offerIndex].duration_days);
        }

        await client.query(
          `INSERT INTO member_subscriptions (id, gym_id, member_id, offer_id, price_paid, start_date, end_date, status, is_frozen, freeze_start_date, freeze_end_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            uuidv4(), gymId, memberId, offerIds[offerIndex],
            OFFER_TEMPLATES[offerIndex].price,
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0],
            status,
            status === 'frozen' ? true : false,
            status === 'frozen' ? new Date().toISOString().split('T')[0] : null,
            status === 'frozen' ? new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] : null,
          ],
        );

        if (status === 'active' && Math.random() > 0.4) {
          for (let d = 0; d < 30; d++) {
            if (Math.random() > 0.6) {
              const day = new Date();
              day.setDate(day.getDate() - d);
              day.setHours(6 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0, 0);
              await client.query(
                `INSERT INTO attendance_logs (id, gym_id, member_id, check_in_time, entry_method)
                 VALUES ($1, $2, $3, $4, $5)`,
                [uuidv4(), gymId, memberId, day.toISOString(), Math.random() > 0.3 ? 'qr_code' : 'manual_phone'],
              );
            }
          }
        }
      }

      const coachIds: string[] = [];
      const coachResult = await client.query(
        `SELECT id FROM staff_users WHERE gym_id = $1 AND role = 'coach'`,
        [gymId],
      );
      for (const row of coachResult.rows) {
        coachIds.push(row.id);
      }

      const classNames = ['سبيننج', 'يوجا', 'Zumba', 'كروس فيت', 'ملاكمة', 'تمارين وظيفية', 'بيلاتس', 'Body Pump'];
      for (let c = 0; c < 4; c++) {
        const classDate = new Date();
        classDate.setDate(classDate.getDate() + Math.floor(Math.random() * 7));
        const startH = 8 + Math.floor(Math.random() * 10);
        classDate.setHours(startH, 0, 0, 0);

        const endDate = new Date(classDate);
        endDate.setHours(startH + 1, 0, 0, 0);

        await client.query(
          `INSERT INTO fitness_classes (id, gym_id, coach_id, title, capacity, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), gymId, coachIds[c % coachIds.length], classNames[c % classNames.length], 15 + Math.floor(Math.random() * 15), classDate.toISOString(), endDate.toISOString()],
        );
      }

      const productNames = ['ماء (500ml)', 'ماء (1.5L)', 'بروتين بار', 'مشروب طاقة', 'منشفة', 'شيكر', 'رباط ضغط', 'قفازات رفع'];
      for (let p = 0; p < 6; p++) {
        await client.query(
          `INSERT INTO products (id, gym_id, name, barcode, stock_quantity, purchase_price, selling_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), gymId, productNames[p % productNames.length], String(100000 + p), 10 + Math.floor(Math.random() * 50), 5 + Math.random() * 15, 10 + Math.random() * 30],
        );
      }

      const expenseCats = ['كهرباء', 'مياه', 'إيجار', 'رواتب', 'صيانة', 'تسويق'];
      for (const cat of expenseCats) {
        await client.query(
          `INSERT INTO expense_categories (id, gym_id, name) VALUES ($1, $2, $3)`,
          [uuidv4(), gymId, cat],
        );
      }

      logger.info(`Gym "${gymName}" seeded with ${MEMBERS_PER_GYM} members, offers, classes, products`);
    }

    await client.query('COMMIT');

    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`  ✅ Seed complete!`);
    console.log(`  ${GYM_COUNT} gyms × ${MEMBERS_PER_GYM} members = ${GYM_COUNT * MEMBERS_PER_GYM} total members`);
    console.log(`  `);
    console.log(`  📧 Login Credentials per gym (all managers):`);
    console.log(`    Manager (founding): owner@gym1.com / Owner@123`);
    console.log(`    Manager:            manager@gym1.com / Manager@123`);
    console.log(`    Reception:   reception@gym1.com / Rec@1234`);
    console.log(`    Coach:       coach@gym1.com / Coach@123`);
    console.log(`  (Replace gym1 with gym2 / gym3 for other gyms)`);
    console.log(`═══════════════════════════════════════════════\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seed failed', { error: (error as Error).message });
    console.error('Seed failed:', (error as Error).message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
