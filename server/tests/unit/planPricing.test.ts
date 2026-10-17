import { describe, it, expect } from 'vitest';
import {
  resolvePlanPricing,
  pricingProblem,
  discountPercent,
} from '../../src/services/planPricing.service';

/**
 * §46 — عقود الاختبار لقاعدة الخصم: price_* هو ما يُحمَّل فعليًا، وتفعيل/تعطيل
 * الخصم ينقل القيمة بين السعر الكامل والمخفّض دون أن يمس أي عقد موقّع.
 */
describe('planPricing service', () => {
  const catalogPlan = {
    price_monthly: '390.00',
    price_yearly: '3900.00',
    list_price_monthly: '500.00',
    list_price_yearly: '5000.00',
    discounted_price_monthly: '390.00',
    discounted_price_yearly: '3900.00',
    discount_active: true,
  };

  it('يبقي السعر المحمّل = المخفّض حين الخصم مفعّل', () => {
    const r = resolvePlanPricing(catalogPlan);
    expect(r.price_monthly).toBe(390);
    expect(r.price_yearly).toBe(3900);
    expect(r.discount_active).toBe(true);
  });

  it('يعطّل الخصم ⇒ السعر المحمّل يرجع للسعر الكامل والخصم يبقى محفوظًا', () => {
    const r = resolvePlanPricing(catalogPlan, { discount_active: false });
    expect(r.price_monthly).toBe(500);
    expect(r.price_yearly).toBe(5000);
    expect(r.discounted_price_yearly).toBe(3900);
    expect(discountPercent(r)).toBeNull();
  });

  it('نسبة الخصم تُحسب من الأعمدة (22% على الأساسية سنويًا)', () => {
    expect(discountPercent(resolvePlanPricing(catalogPlan))).toBe(22);
  });

  it('تعديل السعر المخفّض يحرّك السعر المحمّل فورًا حين الخصم مفعّل', () => {
    const r = resolvePlanPricing(catalogPlan, { discounted_price_yearly: 3500 });
    expect(r.price_yearly).toBe(3500);
    expect(r.list_price_yearly).toBe(5000);
  });

  it('يرفض خصمًا مفعّلًا بلا سعر مخفّض', () => {
    const r = resolvePlanPricing(
      { price_monthly: 500, price_yearly: 5000 },
      { discount_active: true },
    );
    expect(pricingProblem(r)).toContain('خصم مفعّل');
  });

  it('يرفض سعرًا مخفّضًا ليس أقل من السعر الكامل', () => {
    const r = resolvePlanPricing(catalogPlan, { discounted_price_yearly: 6000 });
    expect(pricingProblem(r)).toContain('أقل من السعر قبل الخصم');
  });

  it('باقة بلا أي طبقة خصم: السعر المُدخَل يصير السعر الكامل', () => {
    const r = resolvePlanPricing({}, { price_monthly: 700, price_yearly: 7000 });
    expect(r.list_price_monthly).toBe(700);
    expect(r.list_price_yearly).toBe(7000);
    expect(r.discount_active).toBe(false);
    expect(pricingProblem(r)).toBeNull();
  });

  it('null صريح يمسح طبقة الخصم ويعيد الباقة لسعرها الكامل', () => {
    const r = resolvePlanPricing(catalogPlan, {
      list_price_monthly: null,
      list_price_yearly: null,
      discounted_price_monthly: null,
      discounted_price_yearly: null,
      discount_active: false,
    });
    expect(r.discounted_price_yearly).toBeNull();
    expect(r.price_yearly).toBe(3900); // لا سعر كامل ⇒ يبقى الحالي ولا يُصفَّر
  });
});
