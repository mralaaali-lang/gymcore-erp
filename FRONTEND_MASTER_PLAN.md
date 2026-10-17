# خطة الفورنت-إند الكاملة — GymCore ERP

**التاريخ:** 2026-10-17 · **الحالة:** وثيقة قرار — مفيش أي كود اتلمس
**الاتجاه:** Chalk & Brass (فاتح) + Court Green (داكن) · **النطاق:** `src/` بالكامل (48,474 سطر / 125 ملف صفحة / 122 مسار)
**المرجع الإلزامي قبل أي تنفيذ:** `.qoder/skills/gymcore-shell/SKILL.md` ثم `AGENT_HANDOVER.md` §5 و§6 ثم `UI_PREMIUM_HANDOFF.md` §4 و§6

---

## 1) كُتيب المهارات — اللي بنشتغل بيه

| المهارة / الأداة | الحالة | بتدي إيه | بتستدعاها إمتى |
|---|---|---|---|
| `gymcore-shell` | **مثبّتة في المشروع** (`.qoder/skills/`) | المرجع الحاكم: توكنات الصدفة، ممنوع hex، RTL وأحجام اللمس، صفر mocks، روتين الـcommit والتحقق. معاها `references/tokens.md` (جدول ترحيل الألوان) و`references/verification.md` (فخاخ القياس) و`scripts/audit-shell-colors.mjs` (مقياس الدين) | أول ما أي يد تلمس `src/` — ومعها رقم الدين بيتقاس قبل وبعد أي دفعة |
| `frontend-design` | **مثبّتة** | جودة التصميم المرئي: توزيع، طباعة، سلّم بصري، إحساس «بريميوم» مش قالب | أي شاشة بيتغير شكلها (POS، اللوحات، المودالات) |
| `shadcn` | **مثبّتة — توثيق بس** | توثيق خصائص مكوّنات رادكس وشكل الـprimitive | وقت ما نكتب/نصلّح `components/shadcn/*` أو `ui/DataTable` |
| `qoder-canvas:canvas` | **مثبّتة** | مقارنة بصرية لاتجاهين-تلاتة قبل ما نكتب كود | أول ما يبقى في قرار شكل (زي ما عملنا في شاشة الدخول) |
| `browser-use` (MCP) | **مثبّت** | التحقق الحي: `evaluate_script` + `getComputedStyle` وأرقام مقاسة | كل دفعة من غير استثناء (§7) |
| `repowiki` / `qmind` | **مثبّتة** | معرفة المستودع وخارطته | وقت استكشاف نطاق جديد قبل التنفيذ |
| `postgresql-database-engineering` | **مثبّتة** | مش للفورنت — للباكند والـquery اللي بيغذي الجدول | لو دفعة الفورنت كشفت endpoint بطيء |
| `skill-creator` | **مثبّتة** | تحديث `gymcore-shell` نفسه لما تطلع قاعدة جديدة | بعد أي دفعة تكشف عُرفًا يتكرر |

**اللي اتثبت في دورة 2026-10-17 (بطلب المالك — 7 مهارات جديدة، كلها في نطاق المستخدم فما بتلوّثش المستودع):**

| المهارة | المصدر | بتخدم |
|---|---|---|
| `crit-accessibility` (metedata) | سوق Qoder | موجة 2 — مراجعة كيبورد/فوكس/لمس/تباين |
| `accessibility-patterns` (4444j99) | سوق Qoder | موجة 2 — أنماط WCAG للجداول والمودالات والنماذج |
| `web-animation-design` | سوق Qoder | موجة 2 — الانتقالات و`prefers-reduced-motion` |
| `responsive-design` (wshobson) | سوق Qoder | موجة 2/9 — container queries وموبايل-فيرست |
| `vercel-react-best-practices` (vercel-labs) | skills.sh | موجة 9 — إعادة الرسم والحجم |
| `react-hook-form` (pproenca) | skills.sh | موجة 6 — ربط النموذج |
| `zod` (pproenca) | skills.sh | موجة 6 — مخططات التحقق |

مرفوض/متأجل: `ui-designer-skill` (تكرار مع `frontend-design`) · `affaan-m/ecc@react-performance` (تكرار مع متاع vercel) · أي مهارة تجيب حزمة npm جديدة من غير قرار. **الثبات بتاعت skills.sh ملفات تعليمات طرف تاني — اتقراها قبل الاستخدام وهي بتركيب user-scope.**

**اعتماديات الـnpm اللي نزلت (قرار D3 اتقفل):** `react-hook-form@7.90.0` · `zod@4.6.7` · `cmdk@1.1.1` · `@hookform/resolvers@5.9.1` — التحقّق: `tsc --noEmit` = **0** و`vite build` ✓ **6.05s** بعدها، ومفيش أي ملف كود اتغيّر.

---

## 2) الوضع الحالي مقاس (2026-10-17)

| الحقيقة | الرقم المقاس |
|---|---|
| ألوان حرفية خارج الصدفة (`audit-shell-colors.mjs`) | **4451** في **153** ملف (من 215 ملف مفحوص) |
| أكتر 5 كلاسات مخالفة | `text-gray-500` 829 · `text-gray-900` 631 · `bg-white` 528 · `border-gray-100` 470 · `bg-gray-50` 393 |
| توزيع الدين | gym-admin **1951** · super-admin **1637** · trainer 162 · dashboards 110 · settings 103 · auth 100 · components/dashboard 69 · player 43 · attendance 32 · layout 31 · ui 25 · auth comps 23 · marketing comps 22 · shared 11 · charts 8 · shadcn 3 |
| أسوأ الملفات | `BillingEngine` 176 · `TenantDirectory` 119 · `CashboxShiftsPage` 116 · `CashboxPage` 105 · `PlatformReports` 97 · `OnboardingWizard` 95 |
| جداول مكتوبة يدويًا | **49 صفحة جسدها `<table>` يدوي بالكامل** + 4 صفحات محوّلة فيها جدول تاني يدوي (`Payments`/`Expenses`/`MembersReport`/`Cashbox`) — مقابل `DataTable` في **9** صفحات بس |
| منبثقات `fixed inset-0` يدوي | **32 ملف / 41 موضعًا** — مقابل `shared/Modal` في 14 ملف |
| حقول الإدخال | 475 موضع `input/select/textarea` في `src/pages` — و**9 صفحات بس** فيها 10 حقول أو أكتر |
| i18n | `ar.json`/`en.json` = 7 مفاتيح عليا / **218 ورقة لكل ملف** · **124 ملف** بيستخدم ternary `language === 'ar'` · **11 ملف** بس `useTranslation` |
| الوصولية | `aria-*` 98 موضع في 47 ملف · `focus-visible` في 9 ملفات · `outline-none` في **75** ملف و`focus:ring` في 69 — **15 ملف بيطفّوا الفوكس من أي بديل** (كل شاشات الـauth + 4 مكوّنات shadcn) · **63 `<div onClick>`** · `prefers-reduced-motion` **صفر** · `@container` **صفر** · 7 من 12 `<img>` بلا `alt` |
| حجم الحزمة | `index` **888KB** · `Chart` (apexcharts) **792KB** · `csv` (xlsx) **416KB** · `CheckInCard` 148KB · 146 chunk / 4.1MB في `dist/assets` |
| الكود الميت | **26 ملف غير مستورد من أي حتة**: `shadcn/{button,card,input,label}` · `ui/{CardHover,PageBanner,SectionHeader,RouteErrorBoundary}` · `context/{AuthContext,UIContext}` · `hooks/useAuth` · `super-admin/{AddGymModal,AIAnalytics,SuperAdminSettings,SuperAdminGymSettings}` · `super-admin/notifications/` (4 ملفات) · `reports/ChurnReport` · `tenants/{TenantFilters,TenantToolbar}` · `gym-admin/MemberRegistration` |
| الأيقونات | 3 أنظمة شغالة بالتوازي: phosphor (63 صفحة) + lucide (المكوّنات المنسوخة) + Material Symbols (خطوط قديمة) |
| الحالة/الأخطاء | `ErrorBoundary` مركّب في `App.tsx` بس · **صفر `errorElement`** في 122 مسار · الـSuspense fallback دوّارة `animate-spin` خام |
| التوستات | 295 `showToast(` في 73 ملف — **ملف `ToastContext.tsx` عليه diff جلسة موازية** |
| المتبقي من `animate-spin` | 22 ملف (كلها داخل أزرار انتظار — مقصودة) |

**الخلاصة:** الصدفة (التوكنات + المكوّنات المشتركة) خلصت واتحققت، لكن **التبنّي في الصفحات لسه 6%** في الجداول و**حوالي 30%** في المودالات، والدين الأكبر الحقيقيه الألوان الحرفية (4451) والترجمة المتفرّقة (124 ملف ternary). الخطة دي بتتبّع المكوّنات الموجودة مش بتخترع جديدة.

---

## 3) القواعد اللي بتحكم الترتيب

1. **موجة واحدة متحقّقة = commit واحد** — والـpush والنشر خطوتين منفصلتين بموافقتك كل مرة (`gymcore-shell` §Commit).
2. **ممنوع دفعة جماعية على الجداول أو المودالات** — القرار الموثّق في `UI_PREMIUM_HANDOFF.md` §4: التحويل يتقدّم مع الشاشة اللي بيلمسها نطاق أوسع، مش لوحده.
3. **ممنوع mocks** — أي شاشة جديدة محتاجة بيانات تحتاج endpoint، أو حالة فراغ صادقة.
4. **ملفات الجلسة الموازية ما تتلمسش** — القايمة دي بتتقاس كل دورة مش ثابتة. في 2026-10-17 عليها diff: `server/**` (15 ملف) · `src/context/ToastContext.tsx` · `src/pages/settings/SettingsPage.tsx` · `src/routes/index.tsx` · `src/services/api.ts` · **وفوق كده المسار التاع السوبر-أدمان بقى شغال: `super-admin/{AddGymModal,BillingEngine,TenantDirectory}` · `super-admin/contracts/{ContractFormModal,ContractsPanel}` · `dashboards/SuperAdminDashboard.tsx`**. يعني: `AddGymModal` بيت موجة 1 (كود ميت عند حد تاني شغال عليه)، ودفعات موجة 4/هـ و5/سوبر-أدمان تتقاس تاني قبل ما تبدأ. أي `git add -A` = سرقة شغل.
5. **كل دفعة ألوان أو حذف لازم يمشي وراها `tsc --noEmit` + `vite build` + أرقام مقاسة** — مش بالعين.
6. **جسر الداكن** (`legacy-utils.css`، 121 سطر حرفي فيه بالنية): أي كلاس بيتشال من `src` بيتشال من الجسر في نفس الـcommit، وإلا بنسيب قاعدة ميتة.

---

## 4) الموجات

### موجة 0 — قرار وتجهيز (لا كود)

الهدف: تقفل القرارات في §5 وتثبت المهارات المختارة.
بوابة القبول: مفيش شيفرة اتغيّرت · `gymcore-shell` بانش في `/skills list`.
الحجم: جلسة واحدة قصيرة.

### موجة 1 — نظيفة الميت (26 ملف)

الهدف: نقل الحزام قبل المشي — كل ملف ميت = chunk محتمل ودين في العدّادات.
النطاق: قايمة §2 — بتُحذف بعد تأكيد إن مفيش منها في الـdiff الموازي (خصوصًا `AddGymModal` و`notifications/` و`tenants/` لأن شغل السوبر-أدمان لسه شغال عند الجلسة التانية).
الخطورة: **منخفضة** — بس كل ملف له قرار مستقل. تُعرض ملف-ملف قبل الحذف.
بوابة القبول: `tsc` 0 · `vite build` ✓ · عدد الـchunks نازل · `grep` صفر للمسميات المحذوفة.
الحجم: commit واحد (أو اتنين لو السوبر-أدمان اتأجّل).

### موجة 2 — أساسيات الوصول واللمس (اللي ما تحتاجش تعديل 150 ملف) ✅ 2026-10-17

الهدف: حل أكبر ثغرتين بأقل قدر من الملفات — من فوق للأسفل:
- حلقة فوكس عامة في `styles/index.css` — **اتعملت، وطلعت أرخص من المتوقع:** الجرد الدقيق أعطى
  **26 موضعًا في 10 ملفات** بحقول `outline-none` من غير أي `focus:*` (مش 15 ملف بالشكل ده)،
  فالأرضية غطّتهم **من غير ما تلمس ملف** — وبنفس المنطق ما بقاش محتاج تعديل الـ22 حقل اللي
  كانت الخطة اسميهم (Adjustments/Contracts/Leaves/Hr*/Payroll/CoachAttendanceReport).
  **انحرافان مسجلان:** (أ) اللون `--brass` بدل `--ring` لأن emerald = 2.29/2.50 < 3:1
  (WCAG 1.4.11)؛ (ب) قاعدة «تنحي» إضافية سطر واحد منعت فوكس مزدوج في **52 موضعًا** فيها
  `outline-none` + ring/border خاص — دي ما كانش في الحسبان واكتشفت بالقياس.
- بلوك `@media (prefers-reduced-motion: reduce)` ✅ **ومتحقق بالـemulation:**
  `Emulation.setEmulatedMedia` رجّع `matchMedia(…).matches = true` و`transition-duration`
  نزل من 0.15s لـ0.00001s على عنصرين حقيقيين (مش قراءة نص من الحزمة بس).
- `DataTable`: `th scope="col"` ✅ (كان موجود أصلًا) + `caption` اختياري ✅ (prop، بيرسم
  `<caption class="sr-only">` — بلا `aria-label` على `<table>` عشان الرءوس بتتعلق) +
  `tabIndex={0}` وEnter/Space للصفوف المرتبطة بـ`onRowClick` ✅ بحارس `target !== currentTarget`
  — **الاتنين اتقاسوا بـEnter وSpace حقيقيين** وفتحوا نفس مودال الماوس.
- `shared/Modal`: **اتقاس حيًا بمكوناته الحقيقية** (Tab/Enter/Esc بـCDP trusted events) —
  الحبس شغال (6 ضغطات لفّوا جوه المودال بس)، والعزل شغال، **بس البند كان مكتوب غلط**:
  `aria-modal` مش موجود خالص وRadix 1.3.1 بيقول صراحة إنه بيستخدم `hideOthers` بديل أفضل
  دعمًا (`aria-hidden="true"` على `#root` هو المحقق)، و**استرجاع الفوكس للفاتح مش بيحصل** —
  بيقع على `body`. الإصلاح (لقطه الفاتح في `Modal.tsx`) **قرار مالك** لأنه يمسّ 38 مودال،
  والمتسجل في التقرير هو الآلية مقيسة (توقيت `react-remove-scroll` قبل قراءة `FocusScope`)
  مش تخمين.
- قائمة الـ63 `<div onClick>` → `<button>`: **مش معمول** — اتفق إنها تتقسّط على الموجات
  اللي بتعدّي على نفس الملفات، مش دفعة لوحدها.
- skip link في `AppLayout` ✅ (أول tab stop، صدفة كارت، `start-3` منطقي، و`<main
  id="main-content" tabIndex={-1}>` — الاتنين متقيسين حيًا في الـharness).
الخطورة: **متوسطة** — بتلمس `index.css` و`DataTable`، وكل الاتنين تحتهم مستهلكين كتير.
بوابة القبول: قياس حي في المتصفح على 3 شاشات (لوحة/جدول/مودال) إن `document.activeElement`
بيتحرّك بالتاب، و`screenshot` للـfocus ring في الوضعين، والأرقام من `getComputedStyle` مش من
الكلاسات — **اتنفذت على مكوّنات المنتج الحقيقية**: `DataTable` + `shared/Modal` + `AppProvider`
محمّلين في صفحة React مؤقتة، بـTab/Enter/Space/Escape **trusted** من Chrome headless عن طريق
CDP (المتصفح المدمج ما بيرفعش أحداث كيبورد وهو `attached=false`، وصفرتها `focusin` كانت الدليل).
الأرقام: `outline = solid 2px rgb(166,124,46)` فاتح و`rgb(216,178,106)` داكن عند كل وقفة
`focus-visible = true`، ولقطتين شاشة للوضعين. اللي طلعان من البوابة **فاشلين ومتسجلين**:
استرجاع الفوكس للفاتح (بند `Modal` فوق)، ومؤشر زرار الإغلاق في `shadcn/dialog.tsx` (حلقة
`ring-ring` = 2.29 فوق `ring-offset` أبيض حرفي ما بيتبدّلش في الداكن، وهدف 26×26px).
نص الـskip link جوه `AppLayout` مع الـSidebar الحقيقي لسه محتاج دخول شغّان: المدير المؤسس
اتفعّل (`is_active = true`) والـ401 اختفى، بس الدخول بيرجع **403 `GYM_SUSPENDED`** لأن
`gyms.is_active` بتاعته `false` — تفعيل صالة قرار مالك (نطاق الجلسة التانية).
الحجم: commit واحد ✅.

### موجة 3 — المنبثقات المتبقية (32 ملف / 41 موضع)

الهدف: تصفير `fixed inset-0` اليدوي في `src/pages` على `shared/Modal`.
الترتيب (بدايةً من اللي هتنزلها موجة 4 و5 نفس الجلسة): `EditMemberModal` · `ImportMembersModal` · `subscriptions/AddSubscription` · `subscriptions/EditSubscription` · `team/StaffDirectory` · `store/PurchasesPanel` · `store/SuppliersPanel` — بعدين `super-admin/contracts/ContractDetailModal` و`ContractFormModal` و`BillingEngine` و`TenantDirectory` و`PlatformAdmins` و`PlatformMarketing`.
الحاجة: كل مودال بيتحوّل = **مطابقة العقد القديم** (sizes 24/28/32/42rem) + `disableDismiss={busy}` لو فيه mutation + أزرار الأكشن برا `<form>` بـ`form="id"`.
الخطورة: **متوسطة** (فخّ الـ`animate-out` في الـviewport بلا سطح — §6 بند 13 من الـhandover).
بوابة القبول: لكل دفعة (3–5 ملفات): `tsc` + build + فتح/إغلاق حقيقي بالمتصفح بالـ`setTimeout` مش rAF + `role=dialog` مقروب + صفر `fixed inset-0` في الملفات المتحوّلة.
الحجم: 6–8 دفعات = 6–8 commits.

### موجة 4 — الجداول على `DataTable` (49 صفحة)

الهدف: توحييد الصدفة والمحاذاة المنطقية والحشو الرقمي، مع احترام قاعدة **«الترتيب مش ادعاء»**.
**الترتيب ده مبني على whitelist السيرفر — متتجاوزش القاعدة:**

| الدفعة | الملفات | الترتيب |
|---|---|---|
| أ — الفواتير والديون | `DebtsPage` · `FinancialReports` · `FinancialReport` · `AdjustmentsPage` | `/api/finance/*` ما بيقبلش `sort` → **صفر زرار** |
| ب — الاشتراكات | `SubscriptionsPage` · `SubscriptionsReport` · `SubscriptionManagement` | `/api/subscriptions` عنده whitelist (عضو/من/إلى/متبقي/مبلغ) → يتطابق حرفيًا |
| ج — الحضور | `AttendanceRecords` · `AttendanceReport` · `AbsentMembers` · `CoachAttendanceReportPage` · `TrainerAttendancePage` | يتقاس من الـendpoint قبل ما يكتب أي رأس ضاغط |
| د — المتجر والفريق | `store/{ProductCatalog,PurchasesPanel,SuppliersPanel}` · `team/{StaffDirectory,ShiftsLog,HrOverview}` · `PayrollPage` · `LeavesPage` · `ContractsPage` | مثلها — whitelist أولًا |
| هـ — المنصة | `super-admin/{TenantDirectory,AuditLogs,PlatformAdmins,SystemMonitor,SecurityCenter,DeveloperPortal,PlatformMarketing,NotificationsEngine,contracts/ContractsPanel,reports/RevenueReport,security/BreachLogTab}` | `/platform/*` لكل واحد عقد مختلف — **endpoint-by-endpoint** |
| و — المتبقي | باقي `gym-admin` (17 ملف) + `trainer/` 3 ملفات | آخر حاجة، بعد ما الصدفة تستقر |
| ز — الجدول التاني | `Payments` · `Expenses` · `MembersReport` · `Cashbox` | الجدول اليدوي التاني في الصفحة المحوّلة — لازم يتحوّل عشان ما يفضلش نمطان في ملف واحد |

الخطورة: **عالية على السلوك** (ترقيم/فلاتر/إبطال) ومفيش أي تغيير في عقد الـAPI.
بوابة القبول: لكل دفعة — القياس الحي على عرض مربوط حرفيًا (`innerWidth = 0`)، ارتفاع الصف يفضل 45px و`SkeletonTable` مطابق، ثم `tsc` + build.
الحجم: 7 دفعات = 7 commits (مش أقل).

### موجة 5 — الألوان الحرفية → توكنات الصدفة (4451)

الهدف: المديونية الحقيقية. دي أكبر موجة في الخطة، وبتتعمل **بالـdirectory** مش بالمشروع كله.
الأداة: `scripts/audit-shell-colors.mjs` (قبل/بعد) + جدول الترحيل في `references/tokens.md`:

```
bg-white            -> bg-card
bg-gray-50          -> bg-surface-container-low
text-gray-900       -> text-foreground
text-gray-500       -> text-muted-foreground
text-gray-400       -> text-ink-faint      (قرار D1 — باين تحت)
border-gray-100     -> border-hairline
border-gray-200     -> border-input
text-emerald-600    -> text-primary
bg-emerald-50       -> bg-primary/10
focus:ring-emerald-500 -> focus:ring-2 focus:ring-ring
rounded-2xl / 3xl   -> rounded-shell
shadow-* على كارت  -> اتحذف (العمق من الحدود)
```

الترتيب: `components/*` (224) → `pages/dashboards` (110) → `pages/auth` (100) → `pages/settings` (103، **بعد** ما الجلسة الموازية تخلص) → `pages/trainer`+`player` (205) → `pages/super-admin` (1637) → `pages/gym-admin` (1951).
مع كل ملف: الكلاسات اللي بطل استخدامها في `src` تتشال من `legacy-utils.css` في نفس الـcommit (قاعدة §3.6).
الخطورة: **مرئية** — غلط واحد باين في كل شاشة؛ فكل دفعة = مجلد واحد بس، وقياس تباين في الوضعين.
بوابة القبول: `audit-shell-colors.mjs` يرجّع الرقم النازل متوقعًا · `tsc` + build · سكريبت WCAG على المتغيّرات المتأثرة في الوضعين · صفر `var()` غير معرّف.
الحجم: 12–16 commit (الدفعات الكبيرة بتتقسم نص-نص).

### موجة 6 — النماذج الكبيرة (RHF + zod) — موقوفة على قرارك

الهدف: مش مطاردة الـ475 حقل — بس الـ**9 ملفات** اللي فيها 10 حقول أو أكتر (مقاسة): `CreateGymWizard` 24 · `BillingEngine` 24 · `AddEmployeePage` 21 · `MemberRegistrationForm` 19 · `BrandingTab` 14 · `settings/tabs/GymTab` 13 · `OnboardingWizard` 12 · `AddGymModal` 11 (ده ميت — بيخرج من النطاق في موجة 1) · `subscriptions/AddSubscription` 11. يعني **8 شاشات حية** فعليًا.
الحاجة: **التثبيت تم (2026-10-17)** — `react-hook-form@7.90` + `zod@4.6` + `@hookform/resolvers@5.9`، ومعاهوم مهارتي `react-hook-form` و`zod`.
البديل من غير أي حزمة جديدة (مفضّل لو التثبيت مرفوض): مكوّن `shared/Field.tsx` موحّد (label + حشو اتجاهي + رسالة خطأ + `aria-describedby`) على نفس الكلاسات اللي ثبتت حيًا في POS، وينزل على نفس التسع شاشات.
بوابة القبول: أي مسار — نفس الـPOST القديم يرجّع نفس الكود (201/200) بعد التحويل، ورسائل التحقق من `details` مش كلمة واحدة غامضة (§6 بند zod).
الحجم: 2–3 commits.

### موجة 7 — البحث الموحّد (cmdk)

القرار المتفق عليه: **يُبنى فوق endpoints موجودة بس** (أعضاء/منتجات) من غير أي endpoint جديد ومن غير mocks.
الحاجة: `cmdk@1.1.1` **مثبّت** (2026-10-17) — وبيحتاج `@radix-ui/react-dialog` وهي موجودة (^1.3.1).
بوابة القبول: نتيجة من `GET /api/members?q=` و`GET /api/products?q=` فعليين، وحالة فراغ صادقة، و`⌘K` ما يفتحش فوق مودال مفتوح.
الحجم: commit واحد. **مش قبل موجة 2** (الفوكس وحبس التركيز لازم يكونوا متظبّتين).

### موجة 8 — حالات الخطأ والفراغ

الهدف: 122 مسار بلا `errorElement` + fallback دوّارة خام.
النطاق: `RouteErrorBoundary.tsx` (موجود وميت — من موجة 1) يترجّع للحياة كـ`errorElement` عام + صفحة 404 + بدل `animate-spin` في الـSuspense بـ`PageLoader`/`Skeleton`.
**الحاجز:** `src/routes/index.tsx` عليه diff جلسة موازية — الموجة دي متقفلة لحد ما يخلص.
الحجم: commit واحد بعد فتح الحاجز.

### موجة 9 — الحجم والأيقونات

الهدف: 888KB رئيسي + 792KB apexcharts + 416KB xlsx.
البنود: تحميل `Chart` كسول جوه الشاشة اللي بتستخدمه فعلاً · `xlsx` خلف `import()` في زر التصدير (كفاية عليّه `csv` لو المالك وافق على التراجع عن Excel — **مش مقترح**، مجرد تفصيل) · توحيد الأيقونات لنظامين بدل تلاتة (قرار D5) · فحص تحذيرات حجم الـchunks المذكورة في `TODO.md` §ديون.
بوابة القبول: أرقام `dist/assets` قبل وبعد مقاسة بالـbytes، مش بالـMB التخمينية.
الحجم: 2 commits.

### موجة 10 — جولة التحقق الشاملة والتسليم

الهدف: شريط نظيف قبل أي دفع.
البنود: `audit-shell-colors.mjs` = صفر في `components/*` و`styles/*` · صفر `fixed inset-0` في `src/pages` · صفر `<thead>` يدوي في الصفحات المحوّلة · جولة حيّة بكل دور (super-admin / manager / receptionist / coach / member) بالعربي والإنجليزي والفاتح والداكن · تنظيف أي صف اختبار مُعلَن بقت فاضل · تحديث `LOCAL_TESTING_REPORT.md` + `AGENT_HANDOVER.md` + `UI_PREMIUM_HANDOFF.md` · **وبعدها سؤال الدفع، وسؤال النشر — كل واحدة لوحدها**.
الحجم: لا commit كودي — توثيق بس.

---

## 5) قرارات محتاجينها من صاحب المشروع

| # | القرار | الأرقام | التوصية |
|---|---|---|---|
| **D1** | `text-gray-400` في الفاتح = **2.54** على الورق | 829 موضع `text-gray-500` وحوالي 400 `text-gray-400` | خريطة الترحيل بتاخد `text-gray-400` → `text-ink-faint` (**3.42** — كفاية للأيقونات والتلميحات بس). لأي نص أساسي: `text-muted-foreground` (**6.21**). موافقة على الخريطتين |
| **D2** | الأبيض فوق `--primary` (`#10b981`) = **2.54** | 123 موضع بيقرأوا `--primary` | القرار برضه بتاعك: تغميق primary الفاتح أو نغيّر `--primary-foreground`. ما ينفعش يتسرب جوه دفعة ألوان |
| **D3** | تثبيت `react-hook-form` + `zod` + `cmdk` | **اتقفل 2026-10-17:** `react-hook-form@7.90.0` · `zod@4.6.7` · `cmdk@1.1.1` · `@hookform/resolvers@5.9.1` | موجة 6 و7 اتفتحوا. ملاحظة عقد: الفرونت على **zod v4** والسيرفر على v3 — رسائل الخطأ بتاعت السيرفر تتقري من `details`مش من شكل zod |
| **D4** | i18n: نكمّل ternary (124 ملف) ولا نطلّع المفاتيح | 218 ورقة في كل ملف مقابل 124 ملف hardcoded | **ما نعملهاش كدفعة** — الترحيل النصي للترجمة بياكل سياق. البديل: نكمّل الصفحات العربية-الخمسة اللي في `TODO.md` §2، والقاعدة تبقى «أي واجهة جديدة تكتب `useTranslation`» |
| **D5** | نظام أيقونات واحد ولا اتنين | phosphor 63 صفحة + lucide في المشتركات + Material Symbols في الخطوط | **اتنين**: phosphor للصفحات، lucide للمكوّنات المنسوخة — ونمنع أي Material Symbols جديد. مش تحويل |
| **D6** | حذف الـ26 ملف الميت | منها 11 في مسار السوبر-أدمان اللي عليه شغل موازي | حذف اللي ما على مجلدوش diff، وتأجيل السوبر-أدمان لجلسة تانية |
| **D7** | الدفعات المعلّقة: `2778c33` + `593c4f7` + `d7d3131` | 3 commits محلية · بعيدًا عن origin | محتاجة ردك — ولا push دلوقتي |
| **D8** | إعادة بناء `:9000` عشان POS يوصل للنسخة المحلّية | أي rebuild بياخد الـworking tree كله (17 ملف معدّل + 4 جديدة من الجلسة الموازية) | **مرفوض حالياً** — لحد ما الجلسة التانية تخلص أو ترفع ملفاتها من الـworking tree |

---

## 6) خارج النطاق (بقرار)

- أي endpoint جديد في السيرفر (بحث أو غيرّه) — الجلسة الموازية متحكمة في `server/**`.
- التوستات (sonner) — عليها `ToastContext.tsx` معدّل عند غيرنا، ولها brief في `TASK_TOASTS_SONNER.md`.
- الـlive pulse فوق WebSocket — لسه متوقف على نفس السببين (diff `app.ts` + `/ws` بيدور بمفتاح عضو).
- `§34ج-أ` (باسوردات المديرين نصًا في `platform_admins.onboarding_data`) — أمني، مش فورنت، ومحتاج قرارك الأول.
- أي codemod جمعي واحد للـ4451 — مرفوض، وده سبب تقسيم موجة 5.

---

## 7) روتين التحقق (كل موجة، بلا استثناء)

```bash
cd /d/_proj/gymcore-erp
npx tsc --noEmit
npx vite build
node .qoder/skills/gymcore-shell/scripts/audit-shell-colors.mjs --counts
```

وبعدين قياس فعلي: متصفح حقيقي على `http://127.0.0.1:9100` (جرّة كوكي منفصلة عن `localhost:9000`)، مع عرض مربوط حرفيًا للحاوية وانتظار بـ`setTimeout`، وقراءة `getComputedStyle` مش الكلاسات، وعطّل الـtransitions قبل قراءة أي لون في الداكن. الأرقام تتوثق في `LOCAL_TESTING_REPORT.md` بنفس الجلسة. قبل الـcommit: `git status --short` — المحفوظ ملفاتك انتي بس.

---

## 8) التسلسل المقترح للبدء

موجة 0 (قرارات) → **1** (نظيفة) → **2** (وصول) → **4/أ** (جدول الفواتير — بيثبت نمط الدفعات الكبيرة) → **3/أ** (منبثقات نفس الملفات) → **5/components** (ألوان المشتركات، 183) — بعدين الدفلات المتوازية 3/4/5 بتلف على بعض حسب الشاشة، كل شاشة تُلمس مرة واحدة.

الترتيب ده مقصود: موجات 3 و4 و5 بيتقاطعوا في نفس الملفات، فبنلمس الملف واحد ونقفل عليه التلاتة (جدول + مودال + ألوان) بدل ما نرجعله تلات مرات.
