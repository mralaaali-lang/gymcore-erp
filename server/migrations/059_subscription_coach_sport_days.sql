-- §34ي — الاشتراكات تحتاج الحقول التي تعرضها صفحة الاشتراكات فعليًا:
-- المدرب المرتبط، الرياضة، وأيام الحضور الأسبوعية. كل الأعمدة اختيارية
-- (اشتراكات اليوم تبقى كما هي — الصفحة تعرض «—» بصدق عند غيابها).
ALTER TABLE member_subscriptions
  ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sport VARCHAR(50),
  ADD COLUMN IF NOT EXISTS weekly_days TEXT[];

CREATE INDEX IF NOT EXISTS idx_subscriptions_coach
  ON member_subscriptions(gym_id, coach_id) WHERE coach_id IS NOT NULL;

-- ربط الدين بالاشتراك الذي ولّده (الجزئي/الآجل في نموذج اشتراك جديد).
ALTER TABLE member_debts
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES member_subscriptions(id) ON DELETE SET NULL;
