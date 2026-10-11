# خطة توسيع RLS للأدوار الخمسة
## Phase 0.5 — تصميم أولي (2026-07-25)

---

## 1. الوضع الحالي

- **40+ جدولًا** مع RLS مفعل، لكن جميع الـ policies متطابقة: `gym_id = current_gym_id()`
- **لا يوجد تمييز حسب الدور** في طبقة RLS — التحكم بالأدوار يتم فقط في طبقة التطبيق (`requireRole()`)
- **8 جداول فقط** لديها `FORCE ROW LEVEL SECURITY` (بقية الجداول يمكن لـ table owner تجاوزها)
- **Admin bypass**: يستخدم `app.gym_id = NULL`، لكن الـ policies لا تتعامل مع `NULL` — `WHERE gym_id = NULL`يعود `FALSE` دائمًا
- **أدوار JWT الحالية**: `owner`, `manager`, `coach`, `receptionist`, `member` + `platform_admin` (منفصل)

---

## 2. الأهداف للمرحلة 2

1. **تمييز الدور في RLS**: مكون إضافي في الـ policy يسمح بصلاحيات مختلفة حسب الدور
2. **FORCE RLS على جميع الجداول**: لا يمكن لأحد (حتى table owner) تجاوز RLS
3. **دعم `branch_id`**: الـ policies تستوعب تعدد الفروع
4. **Admin access**: policies تسمح لـ `super_admin` بالوصول عند `app.gym_id = NULL`
5. **هيكل يستوعب المستقبل**: trainer و reception و player يضافون كسياسات دون إعادة كتابة

---

## 3. هيكل RLS المقترح

### 3.1 دالة مساعدة محدّثة

```sql
-- الدور الحالي من JWT (يُضبط بواسطة middleware)
CREATE OR REPLACE FUNCTION current_role()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$ LANGUAGE sql STABLE;

-- gym_id الحالي (موجود)
CREATE OR REPLACE FUNCTION current_gym_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.gym_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- branch_id الحالي (اختياري)
CREATE OR REPLACE FUNCTION current_branch_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.branch_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;
```

### 3.2 مستويات العزل حسب الدور

| الدور | مستوى الوصول | آلية RLS |
|-------|-------------|----------|
| **super_admin** | جميع الصالات وجميع البيانات | `current_gym_id() IS NULL` → bypass (ممنوح صراحةً في الـ policy) |
| **gym-admin** | صالة واحدة فقط (كل البيانات) | `gym_id = current_gym_id()` (موجود حاليًا) |
| **trainer** | صالة واحدة (بيانات محدودة) | `gym_id = current_gym_id()` + استثناءات لجداول غير مسموحة |
| **reception** | صالة واحدة (بيانات محدودة) | `gym_id = current_gym_id()` + استثناءات |
| **player** | بياناته الشخصية فقط | `member_id = current_user_id()` وليس `gym_id` |

### 3.3 نموذج Policy موحّد

```sql
-- السياسة الأساسية: tenant isolation + admin bypass
CREATE POLICY tenant_isolation ON members FOR ALL
USING (
  -- super_admin يرى الكل (عندما app.gym_id = NULL)
  (current_gym_id() IS NULL AND current_role() = 'super_admin')
  OR
  -- أدوار الصالة ترى فقط صالتها
  (gym_id = current_gym_id())
)
WITH CHECK (
  (current_gym_id() IS NULL AND current_role() = 'super_admin')
  OR
  (gym_id = current_gym_id())
);
```

### 3.4 سياسات متخصصة حسب الدور (لجداول حساسة)

```sql
-- مثال: payroll_ledger — tylko gym-admin والمدرب لا يرى الرواتب
CREATE POLICY payroll_ledger_isolation ON payroll_ledger FOR ALL
USING (
  (current_gym_id() IS NULL AND current_role() = 'super_admin')
  OR
  (gym_id = current_gym_id() AND current_role() IN ('gym-admin', 'owner', 'manager'))
)
WITH CHECK (
  (current_gym_id() IS NULL AND current_role() = 'super_admin')
  OR
  (gym_id = current_gym_id() AND current_role() IN ('gym-admin', 'owner', 'manager'))
);
```

### 3.5 سياسات الـ player (عضو)

جداول الأعضاء تحتاج سياسة إضافية:

```sql
-- player يرى فقط بياناته
CREATE POLICY player_self_service ON members FOR SELECT
USING (
  id = current_user_id()  -- member_id من JWT
);
```

ملاحظة: `current_user_id()` هي دالة مساعدة جديدة تقرأ `app.user_id` من JWT.

---

## 4. الجداول المتأثرة

### 4.1 جداول تحتاج FORCE RLS (32 جدولًا إضافيًا)

كل الجداول من migrations: 004, 005, 006, 007, 014, 017, 019 التي لم تحصل على `FORCE RLS` في migration 030.

### 4.2 جداول تحتاج سياسات إضافية حسب الدور

| الجدول | الأدوار المسموحة | ملاحظات |
|--------|-----------------|---------|
| `payroll_ledger` | super_admin, gym-admin | trainer لا يرى الرواتب |
| `financial_transactions` | super_admin, gym-admin | حساس ماليًا |
| `members` | super_admin, gym-admin, trainer, reception | trainer يرى جدول التدريب فقط |
| `member_subscriptions` | super_admin, gym-admin, reception | trainer يرى فقط المرتبط بجلساته |
| `activity_logs` | super_admin, gym-admin | سجل داخلي |
| `platform_security_settings` | super_admin فقط | حساس أمنيًا |

### 4.3 جداول الـ platform (لا تحتاج RLS)

`gyms`, `platform_admins`, `billing_plans` — تدار بواسطة super_admin عبر `withAdminClient()`.

---

## 5. خريطة التوسع (للـ migration 2ج)

### 5.1 الترقية: FORCE RLS

```sql
-- تفعيل FORCE RLS على جميع الجداول المتبقية
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = true
      AND relforcerowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
```

### 5.2 إضافة `current_role()` و`current_user_id()`

تضاف إلى أول migration في Phase 2.

### 5.3 تحديث الـ policies الحالية

تستبدل كل policies `tenant_isolation` بالقالب الموحّد الجديد.

### 5.4 إضافة سياسات الأدوار المحدودة

للجداول الحساسة فقط (4-6 جداول).

### 5.5 إضافة `branch_id`

بعد إنشاء جدول `branches` في نموذج متعدد الفروع، تُضاف `branch_id` إلى الـ policies:

```sql
CREATE POLICY tenant_isolation_with_branch ON members FOR ALL
USING (
  (current_gym_id() IS NULL AND current_role() = 'super_admin')
  OR
  (gym_id = current_gym_id() AND (current_branch_id() IS NULL OR branch_id = current_branch_id()))
);
```

---

## 6. ملاحظات تنفيذية للمرحلة 2

1. **جميع التغييرات أعلاه في migration واحدة منفصلة** (وليست مبعثرة عبر migrations متعددة)
2. **اختبار العزل**: سيناريو obligatoire:
   - صالة "أ" تحاول SELECT من جدول صالة "ب" → 0 rows
   - trainer يحاول SELECT من payroll_ledger → 0 rows
   - super_admin يشاهد جميع الصالات → يعمل
   - player يحاول SELECT members لصالة كاملة → يرى فقط سجله
3. **التراجع**: لأن المشروع لا يزال في مرحلة التصميم، يمكن إعادة إنشاء نظيفة للجداول بدل ترحيل معقد
4. **التوافق**: الـ policies الجديدة متوافقة عكسيًا مع Middleware الحالي — `app.role` + `app.gym_id` + `app.branch_id` كلها اختيارية

---

*آخر تحديث: 2026-07-25 — خطة أولية، سيتم تنقيحها أثناء Phase 2*
