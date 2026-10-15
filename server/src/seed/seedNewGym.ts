import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

const OFFER_TEMPLATES = [
  { title: 'شهر واحد', duration_days: 30, price: 200 },
  { title: '3 أشهر', duration_days: 90, price: 500 },
  { title: '6 أشهر', duration_days: 180, price: 900 },
  { title: 'سنة كاملة', duration_days: 365, price: 1500 },
];

// نفس السبعة الافتراضية في migration 074 — البذرة الحية للكتالوج
export const DEFAULT_SPORTS = [
  { code: 'gym', name_ar: 'جيم', icon: 'fitness_center', color: '#f97316', sort_order: 1 },
  { code: 'cardio', name_ar: 'كارديو', icon: 'favorite', color: '#ef4444', sort_order: 2 },
  { code: 'boxing', name_ar: 'ملاكمة', icon: 'sports_mma', color: '#8b5cf6', sort_order: 3 },
  { code: 'kickboxing', name_ar: 'كيك بوكسينج', icon: 'bolt', color: '#eab308', sort_order: 4 },
  { code: 'swimming', name_ar: 'سباحة', icon: 'pool', color: '#0ea5e9', sort_order: 5 },
  { code: 'crossfit', name_ar: 'كروس فيت', icon: 'directions_run', color: '#22c55e', sort_order: 6 },
  { code: 'yoga', name_ar: 'يوجا', icon: 'self_improvement', color: '#14b8a6', sort_order: 7 },
];

export async function seedDefaultSports(client: PoolClient, gymId: string): Promise<void> {
  for (const s of DEFAULT_SPORTS) {
    await client.query(
      `INSERT INTO gym_sports (id, gym_id, code, name_ar, icon, color, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (gym_id, code) DO NOTHING`,
      [uuidv4(), gymId, s.code, s.name_ar, s.icon, s.color, s.sort_order],
    );
  }
}

/**
 * Seeds the standard membership-offer catalog for a gym. This is operating
 * catalog data (NOT demo junk): without it createMember(plan_id) can never
 * succeed and members can never hold a subscription — which blocks manual
 * check-in entirely ("no active subscription found"). Shared by the
 * platform add-gym seed and the self-service onboarding wizard.
 * Returns the created offer ids so callers can reference them.
 */
export async function seedDefaultOffers(client: PoolClient, gymId: string): Promise<string[]> {
  const offerIds: string[] = [];
  for (const tmpl of OFFER_TEMPLATES) {
    const offerId = uuidv4();
    offerIds.push(offerId);
    await client.query(
      `INSERT INTO membership_offers (id, gym_id, title, duration_days, price, is_active, sport)
       VALUES ($1, $2, $3, $4, $5, true, 'gym')`,
      [offerId, gymId, tmpl.title, tmpl.duration_days, tmpl.price],
    );
  }
  return offerIds;
}

const FIRST_NAMES_MALE = [
  'أحمد', 'محمد', 'علي', 'خالد', 'عمر', 'عبدالله', 'فيصل', 'سعد', 'نواف', 'ماجد',
  'ياسر', 'هاني', 'تركي', 'بدر', 'سلطان', 'فهد', 'نايف', 'مشعل', 'عبدالرحمن', 'طلال',
];

const LAST_NAMES = [
  'الزهراني', 'القحطاني', 'العتيبي', 'الدوسري', 'الغامدي',
  'الشهراني', 'المطيري', 'الحربي', 'العنزي', 'الجهني',
];

const SEED_MEMBERS_COUNT = 15;

const PRODUCT_NAMES = ['ماء (500ml)', 'ماء (1.5L)', 'بروتين بار', 'مشروب طاقة', 'منشفة', 'شيكر'];
const EXPENSE_CATS = ['كهرباء', 'مياه', 'إيجار', 'صيانة'];

/**
 * Seeds minimal demo data into a newly-created gym so the owner
 * sees a non-empty dashboard immediately.
 *
 * This runs OUTSIDE the main gym-creation transaction (fire-and-forget),
 * so a seed failure never blocks the gym from being created.
 */
export async function seedNewGym(gymId: string, gymName: string): Promise<void> {
  const client = await getAdminClient();
  try {
    await client.query('BEGIN');

    // --- Sports catalog (plans require a sport — no uncategorized seeds) ---
    await seedDefaultSports(client, gymId);

    // --- Membership Offers ---
    const offerIds = await seedDefaultOffers(client, gymId);

    // --- Members with subscriptions + attendance ---
    for (let m = 0; m < SEED_MEMBERS_COUNT; m++) {
      const memberId = uuidv4();
      const firstName = FIRST_NAMES_MALE[m % FIRST_NAMES_MALE.length];
      const lastName = LAST_NAMES[m % LAST_NAMES.length];
      const fullName = `${firstName} ${lastName}`;
      const phone = `+9665${String(10000000 + Math.floor(Math.random() * 89999999)).padStart(8, '0')}`;

      await client.query(
        `INSERT INTO members (id, gym_id, full_name, phone_number, photo_url, is_blacklisted)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [
          memberId, gymId, fullName, phone,
          `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`,
        ],
      );

      const offerIndex = m % offerIds.length;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * OFFER_TEMPLATES[offerIndex].duration_days));
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + OFFER_TEMPLATES[offerIndex].duration_days);

      await client.query(
        `INSERT INTO member_subscriptions (id, gym_id, member_id, offer_id, price_paid, start_date, end_date, status, is_frozen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', false)`,
        [
          uuidv4(), gymId, memberId, offerIds[offerIndex],
          OFFER_TEMPLATES[offerIndex].price,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
        ],
      );

      // Seed some attendance logs for the last 7 days
      for (let d = 0; d < 7; d++) {
        if (Math.random() > 0.5) {
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

    // --- Products ---
    for (let p = 0; p < PRODUCT_NAMES.length; p++) {
      await client.query(
        `INSERT INTO products (id, gym_id, name, barcode, stock_quantity, purchase_price, selling_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv4(), gymId, PRODUCT_NAMES[p], String(200000 + p), 10 + Math.floor(Math.random() * 50), 5 + Math.random() * 15, 10 + Math.random() * 30],
      );
    }

    // --- Expense Categories ---
    for (const cat of EXPENSE_CATS) {
      await client.query(
        `INSERT INTO expense_categories (id, gym_id, name) VALUES ($1, $2, $3)`,
        [uuidv4(), gymId, cat],
      );
    }

    // --- Update usage counters ---
    await client.query(
      `UPDATE gym_usage_counters
       SET current_members_count = $1, current_staff_count = 1, updated_at = CURRENT_TIMESTAMP
       WHERE gym_id = $2`,
      [SEED_MEMBERS_COUNT, gymId],
    );

    await client.query('COMMIT');
    logger.info(`Auto-seed complete for gym "${gymName}" (${gymId}): ${SEED_MEMBERS_COUNT} members, ${PRODUCT_NAMES.length} products`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    // Log but do NOT throw — this is a fire-and-forget background job
    logger.error('seedNewGym failed', { gymId, gymName, error: (error as Error).message });
  } finally {
    client.release();
  }
}

