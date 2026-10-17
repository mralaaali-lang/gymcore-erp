# تسليم — استكمال شغل الـPremium UI (جلسة جديدة)

**التاريخ:** 2026-10-16 · **الاتجاه:** Chalk & Brass (فاتح) + Court Green (داكن)
**النطاق المتفق عليه:** توكنات + مكوّنات مشتركة، مش تعديل 60 صفحة يدويًا.
**التعليمات:** لا تقفي غير ما تخلصي المراحل المتبقية، وكل مرحلة تتعمل لها commit بعد تحقق.

---

## 1) اللي خلص (كله متعمله commit ومتحقّق)

| commit | المحتوى |
|---|---|
| `af4a864` | Chalk & Brass: الثيم الفاتح كله في `tokens.css` من غير تعديل أي صفحة |
| `558589f` | دفعة 2: أسماء الـMD3 القديمة (`surface-container-*`, `on-surface*`, `outline*`) بقت بتقرأ التوكنات، فالقديم ما فضلش رمادي بارد |
| `a4b7c1d` | سُلّم سلسلة الرسوم مقاس + كروت الـKPI على التوكنات + `chartTheme.ts` |
| `51f1e9d` | المرحلة 2: عائلة `Skeleton` + `CountUp` (61 موضع skeleton، والـKPI بيعدّ) |
| `104954d` | المرحلة 3 دفعة 1: الداكن + جسر الكلاسات الحرفية + محرك السمة |
| HEAD بعد `104954d` | المرحلة 4 دفعة 1: `shared/Modal` + `shadcn/dropdown-menu` على رادكس — 7 مودالات + قائمتين (الدليل: `LOCAL_TESTING_REPORT.md` §المرحلة 4) |
| `1636b8d` | المرحلة 5 دفعة 1: `ui/DataTable` من جديد فوق `@tanstack/react-table` — MemberList · SalesPage · CashboxPage، وترتيب من السيرفر على اللي يقبله (الدليل: §المرحلة 5) |
| `f505ce9` | إصلاح سطرين مكسورين في السيرفر جوه دفعة غير مُcommitة (`let total` في `createSale` + استيراد `execSync` في `backup.ts`) — كان بيوقّع `tsc` الخلفي |
| HEAD بعد `f505ce9` | المرحلة 5 دفعة 2: MembersPage · MembersReport · PaymentsPage · ExpensesPage على العقد نفسه، + `numeric`/`rowTitle`/`minWidth`، وحذف `.members-table` الميتة، وقياس حيّ على متصفح حقيقي في الوضعين |

**الحالة:** المرحلة 0 و1 و3 (بنية) و4 (دفعة 1) و5 (دفعتين) تمام. المرحلة 2 خلصت ما عدا التوستات
(لها ملف تسليم مستقل: `TASK_TOASTS_SONNER.md`). المتبقي: **المرحلة 6** + تكملة 4 (32 صفحة لسه
`fixed inset-0` يدوي) و5 (51 ملف فيه `<table>`) — تفصيلها في §4.

---

## 2) ملفات لازم تُقرأ قبل أي تعديل

```
src/styles/tokens.css               ← مصدر الحقيقة: :root (عظمي) + .dark (court) + --series-1..8 + --ink-faint
src/styles/shadcn-colors.js         ← الأسماء → var(). أي اسم جديد هنا، مش في tailwind-tokens.js
src/styles/tailwind-tokens.js       ← ألوان الـMD3 القديمة (hex) — الأسماء المحجوزة اتحوّلت لمتغيرات
src/styles/legacy-utils.css         ← جسر الداكن (185 سطر). قواعد الإضافة في §5.2
src/styles/index.css                ← الـimports + قواعد الصدفة (حبر الجداول، tabular-nums، glass-panel)
src/components/dashboard/tokens.ts  ← CARD_CLASS / CARD_CLICKABLE_CLASS / ACCENTS (كلاسات توكن)
src/components/charts/chartTheme.ts ← apexcharts + CSS variables (MutationObserver واحد لكل الرسوم)
src/components/shared/Skeleton.tsx · CountUp.tsx · PageLoader.tsx · StatsGrid.tsx
src/components/layout/ThemeControl.tsx · src/context/ThemeContext.tsx
```

الاتفاقيات الإلزامية موجودة في `AGENT_HANDOVER.md` §5، وأهمها: لا hex في مكوّن مشترك؛
الكارت القياسي `CARD_CLASS`؛ العمق من الحدود مش الظل؛ نص الخلايا `--table-fg` مش أسود؛
`Be Vietnam Pro` أولاً ثم `Alexandria` (ممنوع وجه عربي CDN في رأس السلسلة أو مفتاح `sans`
في الثيم); الحشو اتجاهي منطقي (`text-start`)؛ المودال في نص الشاشة.

---

## 3) الأرقام المقاسة يوم التسليم

| الحقيقة | الرقم |
|---|---|
| كلاسات حرفية في `src/**/*.tsx` | `bg-white` 583 · `text-gray-500` 982 · `text-gray-900` 656 · `border-gray-100` 487 |
| مواضع `<table>` | 82 في 57 ملف |
| مواضع `useState(` | 478 |
| مواضع `showToast(` | 295 |
| `animate-spin` اللي لسه شغال | 30 (كلها مؤشرات انتظار داخل زرار — مقصود) |
| كلاسات `dark:` مكتوبة في الصفحات | 15 (باقي الداكن من الجسر والتوكنات) |
| اعتماديات ناقصة | `sonner` · `@radix-ui/react-tooltip` · `@radix-ui/react-dropdown-menu` · `@tanstack/react-table` · `@tanstack/react-virtual` · `react-hook-form` · `zod` · `cmdk` |
| اعتماديات Radix مثبتة | `react-dialog` · `react-label` · `react-slot` |

---

## 4) المتبقي من الخطة — قابل للتنفيذ كما هو

### المرحلة 4 — Radix على أسوأ مكرّرات Dialog/Dropdown (خلصت دفعة 1)

- **اتعمل:** `src/components/shared/Modal.tsx` فوق `components/shadcn/dialog.tsx`، و
  `src/components/shadcn/dropdown-menu.tsx` (+ `@radix-ui/react-dropdown-menu@2.2.1` في
  `package.json`). اتحوّل 7 مودالات (CashboxPage: بحث/تقرير/مرتجع — HrMainPage: ملف موظف/حضور
  ذاتي/ملخص موارد — BillingEngine: كوبون) وقائمتين (قائمة `⋯` في HrMainPage و`ThemeControl`).
  الاتفاقية بقت في `AGENT_HANDOVER.md` §5 بند **1ح** — اقرئيها قبل أي منبثق جديد.
- **Tooltip متعمد ما اتعملش:** الجرد طلع صفر تكرار (`group-hover` وحيدة فوق أفاتار، `ooltip`
  التلاتة بتوع apexcharts، و`title=` لمربعات ألوان). `@radix-ui/react-tooltip` اتثبتت واتشالت
  تاني — ما نضيفش حزمة ومكوّن لموضع استخدام واحد.
- **المتبقي من نفس المرحلة (مش مطلوب دلوقتي):** 36 ملف / 46 موضعًا لسه `fixed inset-0` يدوي
  (كانوا 38/54 قبل الدفعة دي). المسار الصحيح: تحويل المودالات اللي جوه الشاشات اللي هتلمسيها
  في المرحلة 5/6 (MemberList/SalesPage/POS) بدل دفعة جماعية — وكل تحويل لازم `tsc` + `build` +
  قياس `role=dialog` في المتصفح.
- **الفرق عن المواصفة:** الخطة قالت «أسوأ 4» وطلعت 7+2 — لأن التحويل جوه نفس الملف بيطلب
  الملفات التلاتة معاه (وإلا يبقى في الملف نمطان)، ولأن `ThemeControl` كان بيعيد نفس
  مستمعات `mousedown/Escape` اللي القائمة بتعملهم.

### المرحلة 5 — `@tanstack/react-table` (خلصت دفعة 1 + دفعة 2)

- الشاشات المتحوّلة: `MemberList` · `SalesPage` · `CashboxPage` (جدول اليوم في اللوحتين + لوحة
  البحث المتقدم). المكوّن: `src/components/ui/DataTable.tsx` فوق `@tanstack/react-table@8.21.3`
  (مثبّتة؛ +34 سطر في الـlock فقط). الصدفة القديمة اللي كانت في نفس الملف لسه شغالة بالشكل
  `{key,label}` فصفحتا `OtaUpdateManager`/`SmsGateway` ما اتلمسوش.
- **الفرق عن المواصفة (بمبرر مقاس):**
  - «ترتيب + اختيار + sticky من TanStack»: الترتيب اتعمل على قد ما الـendpoint يستحمل —
    `MemberList` مرتَّب من السيرفر على عمودين موجودين في whitelist الـSQL، و`SalesPage` بلا ترتيب
    لأن `/api/finance/sales` ما بيقبلش `sort` (لو حطينا رأساً ضاغط كان هي ترتيب 20 صف محمّلة
    وتسمّيه ترتيب كل الفواتير). **الاختيار (row selection) اتأجّل**: مفيش شاشة في التلاتة عندها
    فعل جماعي على الصفوف، وإضافته الآن = زر يادي لا endpoint.
  - `SkeletonTable` كانت مطلوبة بنفس ارتفاع الصف: متقاسة ومتطابقة (45px مقابل 45px، والصندوق
    177 مقابل 177 على عرض 900px) فمفيش قفز — بس الرقم ده صح **لأن عرض الحاوية مربوط حرفياً**:
    الـviewport بتاع بيئة التحقق `innerWidth = 0` والأرقام من غيره مغلوطة.
  - `react-virtual` مش مثبتة ولا لزم: مفيش شاشة في التلاتة بتعرض أكثر من 20 صف.
- **دفعة 2 (2026-10-17) خلّصت المرشّحين التانين:** `MembersPage` (إزالة `SORTABLE`/`toggleSort`/
  `sortTh` اليدوية كلها، ~90 سطر مكرر) · `MembersReport` · `PaymentsPage` · `ExpensesPage`. مجموع
  المتحوّل الآن **7 شاشات**، و`DataTable` بقى عنده 3 إضافات من شغل الميدان: `numeric` (نهاية +
  `tabular-nums` افتراضيًا)، `rowTitle` (الـ`title` اللي كان على كل `<tr>`)، `minWidth` (880/900px
  بدل قاعدة `.members-table` في `index.css` — اتحذفت مع كل مواضع استخدامها). الترتيب متوثّق مقابل كل endpoint:
  `reports/members` 4 أعمدة من `SORTS` البيضا، و`payments`/`expenses` **صفر** زرار لأن السيرفر
  ما بيقبلش `sort` خالص. القياس بقى **حيًّا على متصفح حقيقي** (جولة `npm run dev` :9100 + باكند
  :4000 بجلسة مديرة) بدل حاوية `vite preview`: خلايا `rgb(74,66,57)`/`rgb(238,240,232)`، ضغطة رأس
  فعلية → `sort=member_name&order=asc` [200] و`sort=remaining&order=asc` [200]، مؤشر نحاسي
  `rgb(166,124,46)`/`rgb(216,178,106)`. طلع منها عيب تباين واحد اتصلّح: `bg-brass-soft text-pine`
  = **2.66** في الداكن → `dark:text-foreground` = **5.83**. المتبقي من النمط اليدوي: **51 ملف فيه
  `<table>`** — والمرحلة 5 دي مش هتتعمم في دفعة واحدة.
- **ممنوع تعميمها على الباقي (51 ملف)** في دفعة واحدة — تحويل الكل شهر، والدفعات تُقاس بالشاشة اللي
  بتلمسها المرحلة 6.

### المرحلة 6 — نماذج / بحث / POS / حيّ

- **RHF + zod:** للنماذج الكبيرة فقط (عضو، دفعة، onboarding wizard). الـ478 `useState`
  مش هدف — النموذج المستهدف عنده 8+ حقول وvalidation. `react-hook-form` و`zod` غير مثبتين.
- **cmdk:** متشتغلش عليه قبل وجود endpoint بحث حقيقي (قاعدة «ممنوع mocks»). لو مش موجود،
  استأذني صاحب المشروع قبل ما تضيفي `/search` في السيرفر.
- **POS touch grid:** أزرار لمس ≥48px من توكنات الصدفة، بدون ألوان حرفية.
- **Live pulse:** فوق الـWebSocket الموجود — عدّاد/نقاط حيّة في التوب بار، بدون polling.

### التوستات (sonner)

مرحلة 2 الأخيرة، لها brief مستقل في `TASK_TOASTS_SONNER.md` (ملف `ToastContext.tsx` كان
تحت تعديل جلسة تانية وقت التسليم).

---

## 5) قرارين محتاجين موافقة صاحب المشروع — متاخديهمش لوحدك

1. **`text-gray-400` في الوضع الفاتح = 2.54 على الورق** (تحت AA). في الداكن سليم (5.23 بعد
   `--ink-faint`). الإصلاح سطر واحد في `:root` بيأثر على نصوص باهتة في كل مكان.
2. **الأبيض على `#10b981` (زرار الفعل) = 2.54:1** في الوضع الفاتح. خيارين: تغيّري الـprimary
   للوضع الفاتح (123 موضع بيقرأوا `--primary`)، أوسيبيه وتعتبري القرار بصري.

**متأجل وموثّق:** codemod الألوان الحرفية للصفحات (`bg-white`/`text-gray-900`/`border-gray-100`)،
ترحيل `shadow-*` ونصف القطر، وعيب النسبة المئوية في bidi.

### 5.2 قواعد جسر الداكن (`legacy-utils.css`) — قبل أي إضافة

- كل قاعدة لازم تكون مسبوقة بـ`.dark`؛ الاستثناء الوحيد بلوك حبر الجداول
  (`table:not(.no-shell-ink) .text-gray-900/.text-gray-800`).
- كل كلاس تضيفيه لازم يكون مستخدماً فعلاً في `src` — أي كلاس ميت يتحذف.
- الطبقات الشفافة (`bg-white/5`, `border-white/20`) والتعبئة الممتلئة (`bg-emerald-600` =
  فعل الصالة) **ما تلمسهاش**.
- سكربت الفحص (كان في مجلد الجلسة باسم `bridge-check2.mjs`) بيعرض: الكلاسات الميتة، أي
  `var()` مش معرّف في `tokens.css`، وأي قاعدة ملهاش `.dark` — شغّلوه بعد أي تعديل.

---

## 6) مزالق مُجرَّبة — متعيدش اكتشافها

1. `@import` لازم يكون في أول `index.css` قبل أي قاعدة، وإلا Vite بيرفض بهدوء (ده اللي
   عمل «CSS فاضي» مرة). `legacy-utils.css` مستورد في السطر 2.
2. Tailwind بيدمج الكائنات المتداخلة: `surface: { containerHigh }` بيصطدم مع
   `surface-container-high` القديمة — أي إعادة ربط لأسماء الـMD3 تُكتب مسطّحة (flat).
3. apexcharts ما يحلّش `var()`: بيحط الألوان في SVG presentation attributes. يوصله hex
   محسوب من `chartTheme.ts` (`useShellPalette`). بالعكس: `style={{ stroke: 'hsl(var(--x))' }}`
   في React بيحلّ، فـSparkline آمن.
4. هذا البناء من apexcharts بيسمح في `tooltip.style` بـ`fontSize/fontFamily/background`
   بس — الحدود والحبر من `tooltip.theme: 'light'|'dark'`.
5. `table:not(.no-shell-ink)` (0,2,0) بيخسر قدام أي كلاس لون على `<td>` — عشان كده بلوك
   `text-gray-900` جوه الجدول ضروري.
6. `SearchWorkspace` ممنوع داخل الـsubagents — البحث المركّب من الجلسة الرئيسية.
7. الملفات CRLF: استبدال multi-line بـnode/regex بيفشل بصمت — استخدمي Edit أو sed لسطر واحد.
8. cwd بيرجع لكل أمر جديد: ابدئي كل Bash بـ`cd /d/_proj/gymcore-erp`.
9. `:9000` بيقدم build الكونتينر القديم. التحقق الحقيقي: `npm run dev` أو
   `docker compose build frontend && docker compose up -d frontend`.
10. أدوات الـshell كانت بترجع أخطاء إخراج في بعض الأدوار — لو حصلت، حولي لـRead/Glob.
11. **`tailwind-merge` ما يعرفش الأسماء المخصصة:** `cn('rounded-xl …', 'rounded-shell …')`
    بيسيب الاتنين، والفوز بترتيب الـCSS — و`rounded-xl` هنا = 1.5rem (مقياس bootstrap) فما
    تتفاجيش إن المودال طلع 24px. القاعدة: طبقة `shadcn/*.tsx` ما تحملش radius/لون حدود/حشو/ظل.
12. **مُعدّل ألفا خارج سلّم `opacity` يسكّت بصمت:** `bg-series-6/12` انكتب وما اتولّدش منه أي
    قاعدة في الـCSS المبني (السلّم 0/5/10/20/…) — استخدمي `/10` أو `/[0.12]` واتأكدي بـgrep في
    `dist/assets/*.css`.
13. **الـviewport بلا سطح بيجمدّ ساعة الأنيميشن:** `data-[state=closed]:animate-out` بيخلي
    Radix `Presence` مستنية `animationend` مش جاية → السكريم بيفضل mounted والـscroll lock
    على الـbody، و`:focus` ما بيطابقش، و`.click()` البرمجي ما بينقلش الفوكس. قبل ما تكتب
    «المكوّن مكسور»: عطّلي الأنيميشن بـ`*{animation:none!important}` أو قارني برادكس عاري.
14. **نفس الـviewport بيدي `innerWidth = 0`:** أي قياس عرض/ارتفاع/التفاف بلا عرض حرفي طالع
    غلط — أول قياس لصف الجدول طلع 85px (كل عمود انضغط لمحتواه) وكان 45px صح بعد ما ربطت
    الحاوية بـ`style={{width: 900}}`. و`requestAnimationFrame` مفيش ساعة ليه: الانتظار بيه
    بيسبب timeout بعد 15 ثانية — استخدمي `setTimeout`.
15. **محاذاة الجدول المنطقية مش `text-right`:** `text-right` = بداية في RTL و**نهاية** في LTR،
    فالجدول المكرر يدويًا بيتمشى صح بالعربي وغلط بالإنجليزي. في `DataTable` المحاذاة
    `text-start/text-end` والعمود الرقمي `numeric` (نهاية + `tabular-nums`).
16. **الترتيب المحلي على صفحة محمّلة = ادعاء:** `/api/finance/sales` ما بيقبلش `sort`، و
    `/api/members` عنده whitelist من ست مفاتيح (`member_name|created_at|end_date|remaining|
    visits|last_visit`). عمود مش في المفيدين = `sortable:false`؛ لو محتاجة ترتيب له، يتعمل
    مفتاح عند السيرفر (قاعدة «ممنوع mocks») مش reduce في المتصفح.
17. **`bg-brass-soft text-pine` كذاب في الداكن:** المتغيّر الداكن `#6b5a33` مفتاح hover مش خلفية
    نص، والاقتران طالع **2.66** مقيس computed رغم إن نفس الكلاس في الفاتح = **9.96**. أي شارة/أفاتار
    `bg-brass-soft` فيه نص يحتاج `dark:text-foreground` (5.83). اتصلّح في `MembersReport`، ولسه
    موجود في `MemberList` (أفاتار الحرف الأول).
18. **المتصفح الحقيقي ليه عقد مخصوصة (اكتُشفت في قياس دفعة 2):** نقرة MCP على زرار `submit`
    **ما بتشغّلش** معالج React — القيم اتحطّت والنقر حصل ومع ذلك مفيش أي `POST /auth/login` في
    الشبكة؛ الحل `form.requestSubmit()` من `evaluate_script` (بينما `.click()` على أزرار رءوس
    الجدول وروابط السايدبار بيشتغل عادي). والتاني: `grep` من الشيل بياكل escape كلاسات Tailwind
    (`hover\:bg-muted`، `max-md\:text-base`، `dark\:text-foreground`) و بيرجع **false-negative** —
    افحصي `dist/assets/*.css` بـnode `indexOf`.
19. **البيئة مش محتكرة لجلستك:** في نص القياس الحيّ رجعت كل الجلسات `Session has been revoked`
    وفاضت قاعدة الأعضاء (`/api/members` → `total: 0`) لأن جلسة موازية شغّالة على نفس الـDB،
    والباكند native بيقود كرونو `subscriptionCleanup`/`subscriptionEnforcement` على نفس البيانات.
    اللوجاوت كمان بيمسح `localStorage` كلها — بمن فيهم `gymcore-theme` (فالرجوع light مش عيب في
    الثيم). أي قياس حي: سجّلي دخولًا من جديد أولًا، واقرئي الاستجابة بـ`fetch` بنفس الجلسة قبل ما
    تستنتجي من الـDOM.

---

## 7) روتين التحقق المطلوب لكل خطوة

```bash
cd /d/_proj/gymcore-erp
npx tsc --noEmit     # يجب 0 (strict + noUnusedLocals/Parameters)
npx vite build       # يجب ✓
```

وبعدين قياس فعلي مش بالعين:
- سكريبت WCAG لأي لون جديد (مثال: `dark-contrast.mjs` في مجلد الجلسة).
- صفحة تحقق تتبنى في `dist/` (مستثناة من git)، تتServe بـ`npx vite preview --port 5199`
  مؤقتًا، وقيس `getComputedStyle` والنسب بـ`evaluate_script` عن طريق متصفح الـMCP
  (`take_screenshot` محتاج surface ظاهر، فـevaluate_script هو الطريق المضمون). اقفلي
  السيرفر بـ`netstat -ano | grep 5199` ثم `taskkill //PID <pid> //F` وامسحي الملف.
- قبل الـcommit: `git status --short` — العمل المحفوظ يكون ملفاتك انتِ بس (تحت §8).

---

## 8) ملفات جلسة تانية — متلمسهاش ومتعمليش add ليها

```
server/**                                    (12 ملف: app, controllers, cron, middleware)
src/context/ToastContext.tsx                 (إعادة تصميم توست قيد العمل)
src/pages/settings/SettingsPage.tsx          (تنظيف تبويبات)
src/routes/index.tsx                         (مسارات مكررة + /admin/hr)
src/services/api.ts
```

أي `git add -A` هنا هيسرق شغل جلسة تانية. أضيفي ملفاتك بالاسم.

---

## 9) قيود دائمة (من ذاكرة المشروع)

- **ممنوع أي mock/بيانات ثابتة** في كود المنتج — أي شاشة محتاجة بيانات تحتاج endpoint.
- **ممنوع لمس hashes/secrets** — أي إعادة تعيين باسورد تتكتب كسطر أمر المستخدم يشغّله.
- **مرحلة واحدة موثّقة ومعمل لها commit لكل دورة**، وباب الاقتراحات: اسألي قبل تعدّي حاجة
  خارج النطاق المتفق عليه. **مفيش `push` في نص الجلسة.**
- هوية الصالة في السايدبار بس؛ المودال في نص الشاشة؛ الرد بالمصري والإنجليزي/الكود في سطر
  لوحده؛ ومراجعة إملائية للعربي قبل التسليم — افحصي أي حرف آسيوي شارد:
  `grep -nP '[\x{3400}-\x{9fff}\x{3040}-\x{30ff}]' <الملفات>`.

---

## 10) نقطة البداية

1. اقرئي `AGENT_HANDOVER.md` §5 (بند **1ح** للمنبثقات وبند **1ط** للجداول) و§6، ثم
   `LOCAL_TESTING_REPORT.md` §المرحلة 4 و§المرحلة 5 (بدفعتَيها).
2. **المرحلة 5 دفعة 2 خلصت** (MembersPage · MembersReport · PaymentsPage · ExpensesPage، و`index.css`
   اتنضّف من `.members-table`). المرشّحين التالين بنفس العقد لو عايزة تكملي في الجدول: شاشات
   الفواتير والديون والمشتريات — وكل واحدة لازم تتقارن مع whitelist الترتيب بتاع endpointها الأول
   (`/api/finance/*` كلها ما بتقبلش `sort`). **مطلوب قرار/عمل بسيط معلّق:** إعادة قياس شارة العدّ
   في الداكن على صفوف حقيقية (الجلسة سقطت في نصها)، وسطر `dark:text-foreground` في `MemberList`
   (عيب 2.62 الموثّق في §6 بند 17) — ده محتاج موافقة المالك لأنه برة نطاق الدفعة اللي اتعملت.
3. **أو المرحلة 6** (RHF+zod للنماذج الكبيرة · cmdk — مش قبل endpoint بحث حقيقي · POS touch
   grid · live pulse فوق الـWebSocket الموجود). `react-hook-form` و`zod` لسه **غير مثبتين**.
4. **المتبقي من المرحلة 4 (موثّق، مؤجّل):** مقاس بعد دفعة 2 — **32 ملف / 41 موضعًا** لسه
   `fixed inset-0` يدوي في `src/pages` — تتحوّل مع الشاشات اللي بتلمسها الدفعات، مش دفعة واحدة.
5. قرارين §5 معلّقين على صاحب المشروع (تباين `text-gray-400` في الفاتح = 2.54، والأبيض فوق
   `#10b981` = 2.54) — متستناش عليهم في شغل تاني، ومتنفّذيش واحد منهم لوحدك.
6. قبل أي قياس في بيئة التحقق: اربطي عرضاً حرفياً للحاوية (`innerWidth = 0`) وانتظري بـ
   `setTimeout` مش rAF (§6 بند 14).
