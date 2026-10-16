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

**الحالة:** المرحلة 0 و1 و3 (بنية) تمام. المرحلة 2 خلصت ما عدا التوستات (لها ملف تسليم
مستقل: `TASK_TOASTS_SONNER.md`). المتبقي: **المرحلة 4 و5 و6** — تفصيلها في §4.

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

### المرحلة 4 — Radix على أسوأ 4 مكرّرات فقط (Dialog / Dropdown / Tooltip)

- جرد أولًا: `Modal/Drawer/Dropdown/Tooltip` في `components/shared` و`components/ui`،
  واختاري الأربعة الأسوأ (focus-trap ناقص / Escape مكسور / aria غايب / tab-order مكسور).
- `react-tooltip` و`react-dropdown-menu` **غير مثبتين** — تثبيت + توثيق في
  `AGENT_HANDOVER.md` §5 بند 1د قبل الاستخدام.
- السلوك المطلوب: focus-trap و`Escape` وaria من Radix، **المودال في نص الشاشة** (اتفاقية
  سارية)، الحشو directional، والألوان من التوكنات فقط.
- الحدود: 4 مواضع بس. أي تحويل جماعي للـclick-outside مرفوض.

### المرحلة 5 — `@tanstack/react-table` على 3 شاشات حصراً

- الشاشات: `MemberList` · `CashboxPage` · `SalesPage` (تحت `src/pages/gym-admin/`).
- `@tanstack/react-table` (+ `react-virtual` لو الصفوف كبيرة) غير مثبتين.
- قواعد التسليم: رأس `--table-head`، خلايا `--table-fg`، `tabular-nums`، ترتيب + اختيار +
  sticky header من TanStack مش مكتوبين يدويًا، التحميل بـ`SkeletonTable` بنفس ارتفاع الصف
  الحقيقي، والصفوف من نفس الـendpoint الحالي (ممنوع mock rows).
- **ممنوع تعميمها على الـ57 ملف** — الرقم مقاس والتقدير: تحويل الكل شهر.

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

1. اقرئي `AGENT_HANDOVER.md` §5 و§6، ثم `LOCAL_TESTING_REPORT.md` §خطة البرميوم
   و§المرحلة 3 (دفعة 1).
2. ابدأي بالمرحلة 4 (Radix) — الاعتماديات الناقصة فيها اتنين بس.
3. أول commit يكون جرد الأربعة المكررة + اختبار focus-trap/Escape/aria قبل وبعد.
4. قرارين §5 معلّقين على صاحب المشروع — متستناش عليهم في شغل تاني، ومتنفّذيش واحد منهم
   لوحدك.
