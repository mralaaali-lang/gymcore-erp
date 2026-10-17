import { describe, it, expect } from 'vitest';
import { buildPosTotals, type PosDay, type PosProduct } from '../../src/controllers/posReports';
import { buildCampaignImpact } from '../../src/controllers/gymMarketing';

/**
 * §63 — إيراد التقرير محسوب من سلسلة الأيام لا من استعلام تاني: الاختبار ده
 * يقفل الخاصية دي، لأن تاريخ §34ث فيه كروت بتساوي عدّادات لا مبالغ.
 */
const day = (d: string, orders: number, gross: number): PosDay => ({ day: d, orders, gross });
const prod = (
  product_id: string, name: string, units: number, revenue: number, cost: number, costed_units = units,
): PosProduct => ({
  product_id, name, units, revenue, cost, margin: Math.round((revenue - cost) * 100) / 100, costed_units,
});

describe('buildPosTotals — إجماليات تتجمع من السلسلة', () => {
  it('الإجمالي يساوي مجموع الأيام بالضبط، والمتوسط على عدد الفواتير', () => {
    const totals = buildPosTotals(
      [day('2026-10-11', 3, 100), day('2026-10-12', 1, 50.5)],
      [prod('a', 'بروتين', 4, 150.5, 100)],
      { total: 0, count: 0 },
    );
    expect(totals.orders).toBe(4);
    expect(totals.gross).toBe(150.5);
    expect(totals.avg_order_value).toBe(37.63);
    expect(totals.units_sold).toBe(4);
    expect(totals.gross_margin).toBe(50.5);
    expect(totals.cost_coverage_pct).toBe(100);
  });

  it('المرتجعات بتنقص من الصافي لا من الإجمالي', () => {
    const totals = buildPosTotals(
      [day('2026-10-11', 2, 200)],
      [prod('a', 'x', 2, 200, 120)],
      { total: 60, count: 1 },
    );
    expect(totals.gross).toBe(200);
    expect(totals.net).toBe(140);
    expect(totals.refunds).toBe(60);
    expect(totals.refund_count).toBe(1);
  });

  it('يوم بلا مبيعات: أصفار لا NaN ولا قسمة على صفر', () => {
    const totals = buildPosTotals([], [], { total: 0, count: 0 });
    expect(totals).toMatchObject({
      orders: 0, gross: 0, net: 0, avg_order_value: 0, cost_basis: 0,
      gross_margin: 0, cost_coverage_pct: 0, units_sold: 0, distinct_products: 0,
    });
  });

  it('الهامش لا يتنصب كاملًا على كميات بلا تكلفة', () => {
    const totals = buildPosTotals(
      [day('2026-10-11', 2, 1000)],
      [prod('a', 'ميدالية', 8, 600, 0, 0), prod('b', 'ماء', 2, 400, 250)],
      { total: 0, count: 0 },
    );
    expect(totals.cost_coverage_pct).toBe(20);
    expect(totals.cost_basis).toBe(250);
    expect(totals.gross_margin).toBe(750);
  });

  it('الفروقات الكسرية تتقفل عند خانتين', () => {
    const totals = buildPosTotals(
      [day('2026-10-11', 3, 33.333), day('2026-10-12', 1, 0.004)],
      [prod('a', 'x', 1, 33.337, 10.001)],
      { total: 0, count: 0 },
    );
    expect(totals.gross).toBe(33.34);
    expect(totals.avg_order_value).toBe(8.34);
    expect(totals.gross_margin).toBe(23.34);
  });
});

describe('buildCampaignImpact — نسب على المسلَّم فقط', () => {
  it('مسلَّم صفر ⇒ النسب null (ما كانش في إرسال) مش صفر', () => {
    const impact = buildCampaignImpact({ broadcasts: 1, sent: 0, recipients: 0, delivered: 0 });
    expect(impact.open_rate_pct).toBeNull();
    expect(impact.click_rate_pct).toBeNull();
    expect(impact.broadcasts_sent).toBe(0);
  });

  it('نسبة الفتح والنقر على المسلَّم فعلًا، بختانة عشرية واحدة', () => {
    const impact = buildCampaignImpact({
      broadcasts: 2, sent: 2, recipients: 100, delivered: 98, opened: 30, clicked: 3,
    });
    expect(impact.open_rate_pct).toBe(30.6);
    expect(impact.click_rate_pct).toBe(3.1);
    expect(impact.recipients).toBe(100);
  });

  it('لا شيء مفتوح ⇒ 0% صريحة، والفرق عن null مقصود', () => {
    const impact = buildCampaignImpact({ broadcasts: 1, sent: 1, delivered: 40, opened: 0 });
    expect(impact.open_rate_pct).toBe(0);
  });

  it('أرقام pg النصية (numeric) بتتعبر أرقام', () => {
    const impact = buildCampaignImpact({ delivered: '98', opened: '30' });
    expect(impact.delivered).toBe(98);
    expect(impact.open_rate_pct).toBe(30.6);
  });
});
