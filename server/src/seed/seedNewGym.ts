import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
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
 * check-in entirely ("no active subscription found"). Callers today: the
 * self-service onboarding wizard and `gymReset`. The platform "add gym"
 * wizard no longer calls it — see `seedNewGym` below.
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

/**
 * Factory state for a gym created from the platform "add gym" wizard.
 *
 * It is intentionally **empty**: a new tenant must open with zero members,
 * zero subscriptions, zero attendance, zero products and zero expense
 * categories. The previous version of this function injected 15 fabricated
 * members (Saudi-style names, `+966…` phones, `ui-avatars.com` photos) with
 * `active` subscriptions and 7 days of check-ins, plus 6 products and 4
 * expense categories, and then bumped `gym_usage_counters.current_members_count`
 * to 15 — so a real gym's first dashboard showed data nobody entered.
 * That is demo data in a production path and is not coming back.
 *
 * The call site in `platformGyms.createGym` is kept as the seam (that file is
 * owned by another session's uncommitted diff); removing it entirely is the
 * follow-up when that file is free.
 *
 * The catalog helpers above (`seedDefaultSports`, `seedDefaultOffers`) stay
 * exported and are used by `gymReset` and the self-service `onboarding`
 * controller. Note the divergence that remains after this change: the
 * self-service onboarding path seeds the 4 default offers, this path does
 * not — so a gym created from the platform wizard must create its own offers
 * before `createMember(plan_id)` / manual check-in can succeed.
 */
export async function seedNewGym(gymId: string, gymName: string): Promise<void> {
  logger.info('New gym created factory-fresh (no demo data seeded)', { gymId, gymName });
}


