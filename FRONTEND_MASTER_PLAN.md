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
| منبثقات `fixed inset-0` يدوي | **34 ملفًا / 41 موضعًا** (معاد قياسه 11:18 على `ace9306` — كان 32/41، والزيادة ملفين من شغل موازي) — و`shared/Modal` مستخدَم فعلًا في **3** ملفات بس (`CashboxPage` · `HrMainPage` · `BillingEngine`) وكلها بره الـ34 |
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
  دعمًا (`aria-hidden="true"` على `#root` هو المحقق). **استرجاع الفوكس للفاتح كان بيفشل** —
  بيقع على `body`، والمتسجل في التقرير هو الآلية مقيسة (توقيت `react-remove-scroll` قبل قراءة
  `FocusScope`) مش تخمين. **الإصلاح اتعمل في `Modal.tsx` نفسه بعد موافقة المالك**: العنصر
  الفاتح بيتحفظ في render phase (قبل ما الـportal يتعمل) و`onCloseAutoFocus` بـ`preventDefault()`
  بيرجّعه، فالـ38 مودال اتصلحوا من غير أي سطر في أي صفحة، والعقد بقى: **`Modal` بيملك
  الحفظ والاسترجاع — الصفحات ممنوع تعمل الحساب الخاص بيها**. إعادة القياس بعد الإصلاح: الفوكس
  رجع للصف الفاتح (`isRow = true`) ولزرار `#harness-open` الفاتح (`isButton = true`)، والحبس
  لسه شغال (4 ضغطات Tab لفّت جوه المودال بس)، والفاتح اللي اتحذف بعد الـmutation بيرجع
  لـ`body` بأمان (حارس `document.contains`).
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
`focus-visible = true`، ولقطتين شاشة للوضعين + قياس حي على `/login` الحقيقية (كلاس
`no-focus-floor` فعّال: الأرضية مطفية والـwrapper هو اللي بيرسم `rgb(6,182,212)`). اللي طلع
من البوابة **فاشل واتصلح في نفس الجلسة**: استرجاع الفوكس للفاتح (بند `Modal` فوق).
**فاضل فاشل ومتسجل**: مؤشر زرار الإغلاق في `shadcn/dialog.tsx` (حلقة
`ring-ring` = 2.29 فوق `ring-offset` أبيض حرفي ما بيتبدّلش في الداكن، وهدف 26×26px).
نص الـskip link جوه `AppLayout` مع الـSidebar الحقيقي لسه محتاج دخول شغّان: المدير المؤسس
اتفعّل (`is_active = true`) والـ401 اختفى، بس الدخول بيرجع **403 `GYM_SUSPENDED`** لأن
`gyms.is_active` بتاعته `false` — والمقاس إن **كل الصالات عدا `hamedgym` عليها `deleted_at`**،
فالوصول للتطبيق جوه صالة معناه إرجاع مستأجر للمعيشة في نص شغل الجلسة التانية؛ **الطلب ده
اتنفذش** والقرار للمالك.
الحجم: commit واحد للموجة (`22f59dd`) + commit تاني للتحقق الحيّ والإصلاح اللي طلع منه
(الموجة ما اتقسمتش أكتر من كده).

### موجة 3 — المنبثقات المتبقية (معاد قياسه على `dc317ac`: `src/pages` **31 ملفًا / 38 موضعًا** — و`src/**` 36/44)

**الحالة بعد دفعة الاستكشاف (1/ ملف واحد، قرار المالك):** `EditMemberModal` اتحوّل واتقاس حيًّا
(§49) → المتبقي `src/pages` **30 ملفًا / 37 موضعًا** (`src/**` 35/43). اللقطات القديمة اللي
كانت بتقول 34/41 و9 قبل كده ما بقيتش متطابقة مع التعريف ده — الأرقام فوق من `git grep` على نفس
الـglob، تتعاد قبل أي دفعة.

**الحالة بعد دفعة 2 (3/ تلاتة، §51):** `ImportMembersModal` · `subscriptions/EditSubscription` ·
`team/StaffDirectory` اتحوّلوا واتقاسوا حيًّا على الـharness (`scratch/w3b`، اتمسح) → المتبقي
`src/pages` **27 ملفًا / 34 موضعًا** (`src/**` **32/40**)، مقاس بالأمر اللي تحت على `589eee4`+شجرة العمل:
```bash
grep -rl "fixed inset-0" src/pages | wc -l ; grep -ro "fixed inset-0" src/pages | wc -l ; grep -rl "fixed inset-0" src | wc -l ; grep -ro "fixed inset-0" src | wc -l
```
`subscriptions/AddSubscription` **اتسحبت من الدفعة بقرار معروض على المالك**: مش منبثقة متوسّطة،
دي شاشة ملء الشاشة (`fixed inset-0 bg-gray-100` + هيدر sticky + عمود `max-w-2xl` + ~15 تحكم + مسار
فلس «حفظ وطباعة الفاتورة»)، وتحويلها على `size="xl"` (42rem) هيفضّل قرار مالك مش إعادة تنسيق صامتة
(§51 ز/يا). فالمتبقي من الترتيب ده بقى `super-admin/contracts/ContractDetailModal` و`ContractFormModal`
و`TenantDirectory` و`PlatformAdmins` و`PlatformMarketing`.
**تصحيح مقاس في §53:** السطر ده وقت كتابته كان مدرّج `BillingEngine` ضمن المتبقي، والقياس بـ`git grep`
يرفض ده — `BillingEngine.tsx` مستخدِم `shared/Modal` فعلًا من قبل الموجة دي (سطر 27 + سبع لوحات في
1187·1250·1427·1506·1795·1891) وفيه **0** `fixed inset-0`. المتبقي الحقيقي مقاس بعد دفعة 4 = **23 ملفًا /
30 موضعًا** في `src/pages`، منها `gym-admin` **19/24** و`super-admin` **4/6**: `AddGymModal` (1) ·
`PlatformAdmins` (2) · `PlatformMarketing` (1) · `TenantDirectory` (2).
(الخطأ ده كان متعارض مع جدول الأساس نفسه في §1 اللي سجّل `shared/Modal` مستخدَم في **3** ملفات
«ومنها `BillingEngine`» — فالتناقض كان في السرد مش في القياس.)

**الحالة بعد دفعة 3 (2/ اتنين، §52):** `store/PurchasesPanel` → `Modal size="xl"` و`store/SuppliersPanel`
→ `Modal size="lg"`، والقياس الحيّ على `scratch/w3c` (اتمسح) طلع تكافؤ عقد كامل (672px و512px،
`centreDelta [0,0]`، radius/border/bg = probes التوكنات، `shadow-none`، footer row→row-reverse مكدّس
على اللمس) و**مسارات قفل 8/8** مع `activeIsOpener=true` و§34و نظيف (0 هدف تحت 48px على 390 coarse)
و`disableDismiss` متقاس على `POST …/finance/suppliers` حقيقي بشدّه 1.8s — **بلا أي كتابة في القاعدة**
(عدّ متساوي قبل/بعد). المؤشر بعد الدفعة: `src/pages` **25 ملفًا / 32 موضعًا** (`src/**` **30/38**).
**معلَن للمتابعة:** نافذة الـpending بتاعة المشتريات ما اتقاستش حيًّا — `['products-all']` بيرجع
`401` من غير توكن فتحقّق الصفحة نفسه يمنع الطلب؛ سطر القفل متقاس على أختها ومستنتج هنا.
والـreflow المكسور على 390 (`documentElement.scrollWidth = 532`) **مش من المودال**: عناصره كلها
برّة الـdialog وهي جداول اللوحتين نفسها (`div.bg-white.rounded-3xl.border` = 516px، `table` = 474px)
→ ده بند **موجة 4** (الجداول على `DataTable`) و**موجة 5** (الألوان الحرفية)، ما يتحسبش على الموجة دي.

**الحالة بعد دفعة 4 (2/ اتنين، §53):** `super-admin/contracts/ContractFormModal` → `Modal size="xl"`
و`ContractDetailModal` → `Modal size="xl" className="max-w-4xl"`، والقياس الحيّ طلع تكافؤ كامل:
**672px / 672px / 896px** بـ`centreDelta [0,0]` وradius 10px وحدّ `rgb(239,233,221)` وخلفية
`rgb(255,253,249)` وحشو 24px و`maxHeight 868px`، و**مسارات قفل 7/7** مع فوكس راجع للفاتح، و`dir`
بمصفوفة أربع حالات (ar/en × `<html dir>` ملزوق) واحتباس Tab = **صفر خروج** من 26 ضغطة على ثلاث لوحات.
نقطة قرار: لو `size="xl"` اتحطّ لوحده كان بانل التفاصيل تقليّص من 896 لـ672 — يعني **إعادة تصميم
داخل دفعة تحويل** — فتم الحفاظ على العقد بـ`className="max-w-4xl"` (`tailwind-merge` بيقدّم
`max-w-*` على `size`). `disableDismiss` اتقاس على **POST حقيقي** (`/platform/billing/contracts`)
نافذته 2203ms: اللوحة مقفولة في 140/140 عيّنة، Escape عند 619ms **مرفوض**، والزرار اتفعّل عند
2271ms — والكتابة صفر متثبتة على مستوى الصفوف (الحارس `server/src/routes/platform.ts:128-132`:
`platform_contracts=11` · `platform_contract_addons=2` · `billing_invoices=140` · صف جديد بعد
14:00 UTC = 0 في خمسة جداول). المؤشر بعد الدفعة: `src/pages` **23 / 30** (`src/**` **28/36**).
**معلَن للمتابعة:** جداول البنود/الفواتير جوّة `ContractDetailModal` ما اتقاستش على 390 — اللوحة
بلا جلسة platform بترجع `isError` (184px / تحكّم واحد)، ومسارات النجاح (تجديد/إصدار/إلغاء/بنود)
محتاجين نفس الجلسة؛ فالمتبقي من الموجة دي **مقاس** بعد دفعة 4: `src/pages` **23 / 30** — `gym-admin`
**19/24** و`super-admin` **4/6** (`AddGymModal` · `PlatformAdmins` · `PlatformMarketing` ·
`TenantDirectory`)، و**`BillingEngine` مش فيهم** (مقاس: مستخدِم `shared/Modal` من قبل الموجة، 0 مواضع).

**الحالة بعد دفعة 5 (3 ملفات / ٥ لوحات، §54):** `super-admin/PlatformAdmins` → `Modal size="lg"` (إنشاء/تعديل)
+ `size="md"` (إجراءات صف) · `PlatformMarketing` → `size="md"` · `TenantDirectory` → `size="md"` (إجراءات)
+ `size="sm"` (تأكيد حذف). القياس الحيّ (`scratch/w3e`، اتمسح و`git ls-files scratch` = 0) على
Chromium 155 headless بإدخال موثوق: **44/44** و**41/41** — الـ`md` **448px** والـ`lg` **512×598px**
بـ`centreDelta [0,0]` وتوكنات مطابقة للقط في الاتنين، و`aria-hidden` على `#root`، وحبس Tab
**15/15** و**12/12**، والفوكس راجع للفاتح في الحالتين، و`disableDismiss` متقاس من جوّة **POST حقيقي
محبوس** (`/platform/marketing/campaigns` و`/platform/admins`) — escape/scrim/X مرفوضة والزرار
`disabled` + spinner، واللوحة فضلت مفتوحة بعد فشل `onError` الحقيقي. §34و على 390 coarse:
**9/9 عناصر ≥ 48px** في اللوحتين والـ`docScrollWidth` فضلت **390 = base** (المودال ما زادش overflow).
**صفر كتابة بضفتين:** `forwarded=0` + عدّ الصفوف `marketing_campaigns=[]` و`platform_admins=[]`
وtotals `{"campaigns":"0","platform_admins":"1"}` في ثلاث قراءات.
المؤشر بعد الدفعة: `src/pages` **20 ملفًا / 25 موضعًا** (`src/**` **25/31**) — و`super-admin` بقى
فيه `AddGymModal` (1) فقط، وهو على قائمة الكود الميت (موجة 1 / `D6`) ومقول «ما يتلمسش»،
ف**صدفات `super-admin` الحيّة = صفر** والمتبقي الحقيقي كله `gym-admin` **19 ملفًا / 24 موضعًا**
(+ `AddSubscription` المستنية قرار `D9`).
**فجوات مقرّة في الدفعة:** لوحتا `TenantDirectory` ولوحة إجراءات `PlatformAdmins` ما فتحتش حيًّا
(القائمة فاضية تحت `401`/`isError`) — هندسة `md`/`sm` مورّثة من المقاس؛ و**زر «إلغاء» بيتجاوز
`disableDismiss`** (مقاس: الطلب معلّق والـCancel بيقفل اللوحة رغم إن Escape/scrim/X مرفوضين) —
سلوك قشرة مورَّث من §49/§51/§52/§53 وإصلاحه قرار ملكية على `shared/Modal` (بوابة مالك).
المتبقي بيستنى بوابة المالك «رجّع tenant حيّة». وبوابتان جديدتان
اتفتحتا من القياس: **عرض زرار X بتاع القشرة 26px** (`shadcn/dialog.tsx:66` — ملف واحد = كل المودالات)
و**6/11 حقل بلا اسم متاح** في استمارات العقد (نمط `LABEL_CLASS` من غير `htmlFor` في المنتج كله).

**الحالة بعد دفعة 6 (٣ ملفات / ٣ لوحات، §56):** `gym-admin/marketing/AnnouncementsPanel` → `Modal size="lg"`
و`gym-admin/ExpensesPage` (`AddExpenseModal`، المُصدَّر والمستخدَم كمان في `CashboxPage`) → `size="md"`
و`gym-admin/crm/LeadForm` → `size="lg"`. **أول دفعة اتقاست بجلسة صالة حقيقية** (الصالة الرملية
«حامد جيم» بأمر المالك: ٠ أعضاء و٠ مصروفات و٠ إعلانات و٠ عملاء قبلها وبعدها). القياس على `:9110`
(`VITE_API_URL=""` عشان كل نداء يبقى same-origin من خلال بروكسي Vite): الـ`md` **448×483** والـ`lg`
**512×488** (الإعلانات) و**512×690** (العملاء)، الكل `centreDelta [0,0]` وتوكنات واحدة
(`radius 10px` · `border 1px rgb(239,233,221)` · `bg rgb(255,253,249)` · `shadow-none` · حشو 24px)
و`dir="rtl"` من الخصّة و`aria-hidden="true"` على `#root` و`aria-labelledby` موجود و`aria-describedby`
مغيب (مفيش `description`)، وEscape وهي فاضية بتقفل **٣/٣** والفوكس راجع للفاتح **٣/٣**، والزرار الأساسي
`disabled` لحد ما الاستمارة تتعدّى قواعدها. **القفل أثناء pending متقاس من جوّة POST حقيقي محبوس
ومنهجيًا على أربع مسارات: Escape · scrim · X القشرة · «إلغاء» = مرفوضين الأربعة**، والزرارين بقوا
`disabled` + النص «جارٍ الحفظ…» (إضافة `disabled={saving}` على «إلغاء» هي التحوّط المحلي لعيب القشرة
المعلن — إصلاح `shared/Modal` نفسه لسه بوابة مالك). على 390/coarse: اللوحة **358px** و**بلا overflow أفقي** وأزرار الفوتر **48/48** في الثلاث، والمستهدف الوحيد تحت 48 بقى **checkbox التثبيت 16px** في
الإعلانات (مورَّث، مش من التحويل). **التحويل صدفة صرفة في العقد — بس في فرق معلن عن دفعة 5:** الزرار
الأساسي هنا `type="button" + onClick` (مش `type="submit" form="…"`) لأن حالة الاستمارة في نفس المكوّن
والفوتر برّه الـ`form`، و`<form onSubmit>` اتساب شغال لمسار Enter. **الكتابة كانت حقيقية ومخططة
وممسوحة:** الإعلان والمصروفان اتعملوا فعليًّا وظهروا في `GET` مع توست «تم نشر الإعلان» /
«تم إضافة المصروف»، وبعدها التنظيف: العميلان اتحذفوا من `DELETE /api/crm/leads/:id` (٢٠٠ ×٢)،
والإعلان والمصروفان اتحذفوا بـSQL **لإن مفيش endpoint حذف للإعلانات والمصروفات** (معلن).
**عيب منتج حقيقي طلع من مسار النجاح:** `LeadForm` بيبعت `assigned_to: ''` لما خانة «مسؤول» تتساب فاضية
(وده الافتراضي) → `400 Validation failed: assigned_to Invalid uuid`، أي إنشاء عميل محتمل من الشاشة
بيفشل إلا لو مليت «مسؤول». متثبت بإعادة تشغيل نفس الـpayload: بحذف المفتاح → **201**، بـ`null` →
`Expected string`. خارج نطاق التحويل ف**ما اتصلحش** (إصلاح سطر واحد في `LeadForm:58` أو تسامح في
الـschema) — بوابة مالك. **المؤشر بعد الدفعة:** `src/pages` **17 ملفًا / 22 موضعًا** (`src/**` **22/28**)،
والمتبقي كله `gym-admin` **16/21** + `super-admin/AddGymModal` (١) المستني `D6`/`D9`.
**حدّ القياس المعلن:** في headless ديه إشارات الماوس والكيبورد الموثوقة بَتَسْقُط صامتة بعد
`pushState` (متثبت بأربع محاولات: `setFocusEmulationEnabled` و`setWebLifecycleState` و`bringToFront`
وبروتوكولات `pointerdown` مختلفة = **صفر أحداث على `window` capture**)، فالفوات والفتح والإغلاق بقوا
`el.click()` وEscape اصطناعي — وده بيحرّك نفس معالِجات React ونفس `DismissableLayer` بتاعة Radix،
والكتابة نفسها بتاعة التطبيق فوق API حقيقي؛ والإدخال ظلّ `Input.insertText` موثوق (متحقق بطول الحقل).

**منهجية من دفعة 3 بتسري على كل قياس جاي (§52 ط):** (1) أي أمر CDP لازم يخلص بـtimeout — أمر
`Emulation` اللي ما بيردّش علّق الطلق 13 دقيقة؛ (2) تحت `pointer: coarse` مؤشرات
`Input.dispatchMouseEvent` ما بفتحتش المودال — الفتح بـ**Enter موثوق** على الزرار المركَّز؛
(3) ما تربطش regex زرار الحفظ بـ`^…$` — ولا حتى بنص جزئي — لأن النص نفسه بيتحوّل أول ما
الـmutation تطلع (`«progress_activity إضافة»` في §52, و«جارٍ الحفظ...» في §53 فمطابقة
`/إبرام|Sign/` رجّعت `null` والعيّنات اتسجّلت `{txt:null,dis:null}`): **المقياس الصحيح حالة
الزرار (آخر زرار في الفوتر) مش نصّه**، وده اللي بلّغ «Escape مرفوض عند 619ms» في §53;
(4) شدّ `Fetch` ما يشتغلش إلا لو الراية اتشغّلت **قبل** الضغط؛ (5) أي «فشل وصول» في عدّادي
يتشخّص بطلقة مخصصة قبل ما يننسَب للتطبيق (في §52 كان سببه `ENTER()` بدل `ESC()` في جدول المسارات).
(6) **ستاجنج الملفات المشتركة:** `git add` لملف مشترك كامل بياخد معاه شغل الجلسات التانية
اللي لسه ما اتعملهوش commit — وده **صار فعلًا**: `9a02245` بلع نسخة نصّية من §50 فمضمونها ضاع من
`HEAD` (`git show HEAD:LOCAL_TESTING_REPORT.md | grep -c '^## §50'` = **0**) وساب ملزوقة `منفصل.---`.
البروتوكول من هنا: بلوك الجلسة + `git show HEAD:<file>` → `git hash-object -w --stdin` →
`git update-index --cacheinfo`، و`grep -c '^## §'` + `git diff --cached | grep` على علامات الجلسات
التانية قبل كل commit، والتحقق إن الشجرة لسه فيها شغل الغيرين (`MM` في `git status`).
(7) **ممنوع `String.prototype.replace` في تعديل الوثايق:** الـreplacement string بيفسّر `` $` `` و`$'`
و`$&` كرموز مرجعية، فنص عربي أو كود فيه `` `^…$` `` بيلصق **نسخة كاملة من المستند** في منتصف السطر.
ده **صار فعلًا** وقت §53: سكربت تصحيح بلع 215 سطرًا مكررًا وقطع عنوان «# خطة الفورنت-إند الكاملة» في
الجوه. البروتوكول: `split(from).join(to)` أو أداة التحرير الحرفية، وبعدها `wc -l` + `grep -c '^# '`
مقابل `git show HEAD:<file>`. لو الملف اتخرّب، إعادة البناء من `HEAD` + لصقات حرفية أأمن من الترقيع
— والتحقق إن أسطر الشجرة اللي بقت لوحدها ملك الجلسة نفسها قبل الاستبدال.

الهدف: تصفير `fixed inset-0` اليدوي في `src/pages` على `shared/Modal`.
الترتيب: `EditMemberModal` · `ImportMembersModal` · `subscriptions/EditSubscription` · `team/StaffDirectory` · `store/PurchasesPanel` · `store/SuppliersPanel` · `super-admin/contracts/ContractDetailModal` · `ContractFormModal` (**اتحوّلوا وقاسوا حيًّا — §49 §51 §52 §53**) و`subscriptions/AddSubscription` **مُرجَّع للمالك (D9)** — فالمتبقي **المقاس** = `super-admin/{AddGymModal,PlatformAdmins,PlatformMarketing,TenantDirectory}` (4 ملفات / 6 مواضع) + `gym-admin` (19 / 24)؛ و`BillingEngine` **مش مطلوب** لأنه على `shared/Modal` أصلًا (0 مواضع — تصحيح §53).
الحاجة: كل مودال بيتحوّل = **مطابقة العقد القديم** (sizes 24/28/32/42rem) + `disableDismiss={busy}` لو فيه mutation + أزرار الأكشن برا `<form>` بـ`form="id"`.
الخطورة: **متوسطة** (فخّ الـ`animate-out` في الـviewport بلا سطح — §6 بند 13 من الـhandover).
بوابة القبول: لكل دفعة (3–5 ملفات): `tsc` + build + فتح/إغلاق حقيقي بالمتصفح بالـ`setTimeout` مش rAF + `role=dialog` مقروب + صفر `fixed inset-0` في الملفات المتحوّلة.
**أربع حاجات طلعت من دفعة الاستكشاف وبتسري على كل دفعة جايّة (§49):**
(أ) `dir` بقى prop في `shared/Modal` — اللوحة بتتعمل portal على `<body>` برّه أي حاوية صفحة،
فلازم يمرّي `dir={rtl ? 'rtl' : 'ltr'}` عشان اتجاهها ما يعتمدش على `<html>`. **تصحيح premise
(§51 د):** `index.html` مش ماسك `dir="rtl"` للأبد — `AppProvider` بيكتب `document.documentElement.dir`/`.lang`
مع كل تغيير لغة (`src/context/GymBrandContext.tsx:103-106`، من `ccc7287`)، فالواجهة الإنجليزيّة
بتعيد تلوين اللوحة Portaled لوحدها. مقياس المismatch (لغة ar + `<html dir="ltr">`مصنوعة): اللوحة
فضلت `rtl` بفضل الخاصية. القاعدة كسلوك ما اتغيّرتش: **كل مودال متحوَّل يمرّر `dir`**.
(ب) مقروب الـdialog يتاخد بـ`[...querySelectorAll('[role="dialog"]')].pop()` — أول مطابقة بترجع
عقدة الـexit animation وبتطلّع أرقام مقلوبة (45.6px، scrim «مبيقفلش»، فوكس BODY)؛
(ج) استرجاع الفوكس يتقاس على **كل** مسارات القفل وفي نمطَي التركيب
(`<Modal open={flag}>` و`{cond && <Modal open/>}`) — التاني هو الغالب وكان اللي خبّى العيب؛
(د) لقياس `disableDismiss` على mutation حقيقية: شدّ **توقيت** الطلب بـCDP `Fetch.requestPaused`
+ `continueRequest` بعد ~1600ms (الـ`latency` emulation لوحدها ما بتمسكش طلب بيفشل عند النقل في
12ms)، والقياس يتسجّل من عيّنة جوّه الصفحة كل 16ms مش من Node.
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

وبعدين قياس فعلي: متصفح حقيقي على `http://127.0.0.1:9100` (جرّة كوكي منفصلة عن `localhost:9000`)، مع عرض مربوط حرفيًا للحاوية وانتظار بـ`setTimeout`، وقراءة `getComputedStyle` مش الكلاسات، وعطّل الـtransitions قبل قراءة أي لون في الداكن. الأرقام تتوثق في `LOCAL_TESTING_REPORT.md` بنفس الجلسة. **والمرجع المرائي للحالة الشاملة** (الأرقام + الأولويات + حالة الموجات) هو `AUDIT_REPORT_2026-10-17.md` — ملف مشروع متتبَّع في Git، بلوك الفحوص الجاهز وبروتوكول تحديثه في §11 منه؛ أي موجة بتقفل أو بند P0/P1 بيتصوّب يتحدّث فيه في نفس الـcommit. قبل الـcommit: `git status --short` — المحفوظ ملفاتك انتي بس.

---

## 8) التسلسل المقترح للبدء

موجة 0 (قرارات) → **1** (نظيفة) → **2** (وصول) → **4/أ** (جدول الفواتير — بيثبت نمط الدفعات الكبيرة) → **3/أ** (منبثقات نفس الملفات) → **5/components** (ألوان المشتركات، 183) — بعدين الدفلات المتوازية 3/4/5 بتلف على بعض حسب الشاشة، كل شاشة تُلمس مرة واحدة.

الترتيب ده مقصود: موجات 3 و4 و5 بيتقاطعوا في نفس الملفات، فبنلمس الملف واحد ونقفل عليه التلاتة (جدول + مودال + ألوان) بدل ما نرجعله تلات مرات.
