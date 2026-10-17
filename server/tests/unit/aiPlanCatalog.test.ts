/**
 * §61 — الطبقات تُقاس من الكتالوج الحي، فالسلوك ده لازم يتغطى بلا قاعدة بيانات:
 * `planTiers()` دالة نقية على مصفوفة `getActivePlanCatalog()` (نفس الأعمدة).
 * الاختبار بيأكد إن مفيش اسم باقة ثابت في الكود — أي اسم بيتكتب حرفيًا هنا
 * هو نفس الغلط اللي خلاص وجه المنصة يعرض «Professional» وهي اسم ما موجودش
 * في `billing_plans` أصلًا.
 */
import { describe, expect, it } from 'vitest';

import { planTiers, type ActivePlan } from '../../src/services/aiAnalytics.service';

const plan = (name: string, price: number, over: Partial<ActivePlan> = {}): ActivePlan => ({
  id: `plan-${name}`,
  name,
  name_ar: name,
  max_members: 100,
  max_staff: 5,
  price_monthly: price,
  ...over,
});

describe('planTiers (§61)', () => {
  it('يرتب ثلاث طبقات من الأرخص للأغلى', () => {
    const catalog = [plan('Complete', 790), plan('Basic', 390), plan('Advanced', 550)];
    const tiers = planTiers(catalog);
    expect(tiers).not.toBeNull();
    expect(tiers?.entry.name).toBe('Basic');
    expect(tiers?.mid.name).toBe('Advanced');
    expect(tiers?.top.name).toBe('Complete');
  });

  it('يبقى بلا طبقات لما الكتالوج فاضي (ما يخترعش اسم)', () => {
    expect(planTiers([])).toBeNull();
  });

  it('باقة واحدة = الثلاث طبقات هي نفس الباقة', () => {
    const tiers = planTiers([plan('Basic', 390)]);
    expect(tiers?.entry.name).toBe('Basic');
    expect(tiers?.mid.name).toBe('Basic');
    expect(tiers?.top.name).toBe('Basic');
  });

  it('باقتان: الوسط يساوي الأعلى بدل اسم من النصف', () => {
    const tiers = planTiers([plan('Basic', 390), plan('Complete', 790)]);
    expect(tiers?.entry.name).toBe('Basic');
    expect(tiers?.mid.name).toBe('Complete');
    expect(tiers?.top.name).toBe('Complete');
  });

  it('بيحترم ترتيب الكتالوج اللي جايه من الـSQL (السعر ثم الاسم) عند التساوي', () => {
    const tiers = planTiers([plan('Advanced', 550), plan('Basic', 550)]);
    expect(tiers?.entry.name).toBe('Advanced');
    expect(tiers?.top.name).toBe('Basic');
  });
});
