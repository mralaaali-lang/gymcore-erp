# 🤖 AGENT HANDOVER — GymCore ERP (استلام وتكملة المشروع)

**آخر تحديث:** 2026-10-10 — **الفرع:** `railway-staging` (يُتابِع `origin/main`) — **الحالة:** يعمل محلياً بالكامل، ~304 ملفات معدّلة غير مُcommitة.

---

## 1) ما هو المشروع؟

SaaS متعدد المستأجرين لإدارة الصالات الرياضية (مصر أولاً 🇪🇬): React 18 + Vite + TypeScript واجهة (`src/`)، Express + TypeScript باكند (`server/src/`)، PostgreSQL 17 + RLS، Redis، PWA عربي RTL افتراضياً + إنجليزي.

**الأدوار:** `super-admin` (منصة) | `manager/receptionist/coach` (صالة — دور واحد للإدارة: المدير، بلا Owner) | `player/member` (عضو).

---

## 2) التشغيل المحلي (الوضع الحالي — لا تغيّره بلا سبب)

| الخدمة | التشغيل | المنفذ | ملاحظة |
|---|---|---|---|
| PostgreSQL 17.11 | حاوية Docker `gymcore-db` (postgres:17-alpine، volume `postgres17_data`) | **5433** | قاعدة `gymcore` الموحَّدة (11 صالة + 2463 عضو — دُمجت من المحلي 2026-10-11، §20). الـ native في `C:\pgsql` **موقوف ومُهجور** (أرشيف فقط) |
| Redis | حاوية Docker `gymcore-redis` (redis:7-alpine) | 6379 | النسخة الـ native القديمة (D:\_tools\redis) لم تعد مطلوبة — لا تُشغّلها مع Stack Docker بنفس الوقت |
| Backend | `npm run dev` في `server/` (ts-node-dev, يعيد التشغيل + **يشغّل الميجريشنات تلقائياً** عند الإقلاع) | 4000 (+WS 4001) | سجلات `server/dev-backend.{out,err}.log` |
| Frontend | `npm run dev` في الجذر (Vite + بروكسي `/api /auth /platform /health /uploads` → 4000) | 9000 | علامة التحقق: HTML يحوي `@vite/client` |

**الدخول:** سوبر `mr.alaaali@gmail.com` / `Alaa@2026` — مالك `owner@<subdomain>.com` / `Owner@123` (مدير `Manager@123`، استقبال `Rec@1234` ⚠️ 8 أحرف إجباري، مدرب `Coach@123`).

**البيئة:** Node في `C:\Program Files\nodejs` **ليس في PATH** — ابدأ كل أمر بـ `$env:PATH = "C:\Program Files\nodejs;$env:PATH"`. سياسة التنفيذ تمنع `npm.ps1` أحياناً → استخدم `npm.cmd` في `Start-Process` أو `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`. ملفات `.env`: `server/.env` (أسرار محلية، gitignored) + `.env` الجذر (`VITE_API_URL=http://localhost:4000/api/v1`).

---

## 3) إجراءات البيانات (احفظ الترتيب)

```powershell
# تصفير كامل + إعادة التغذية (سكربت واحد):
.\server\scripts\reset-local.ps1   # drop→create→extensions→migrate→seed10→seed:engagement→bootstrap
# (يفصل اتصالات DB أولاً، ويكتب التقدم في backups/reset-status.json + السجل reset.log)
# متاح أيضاً بزر من الواجهة: مدير التحديثات (OTA) ← إعادة ضبط (تأكيد مزدوج + حالة حية، مرفوض في الإنتاج)
# السيد الرئيسي: npm run db:seed10 (ملف seedTenGyms.ts: 10 صالات × 2460 عضو + حضور/حصص/POS/صندوق/ولاء/PT)
# سيد التفاعل (إضافي آمن): npm run db:seed:engagement (فواتير/تذاكر/بث/إشعارات — يمسح جداوله فقط)
# نسخ: pg_dump -Fc → backups/ (مُتجاهل Git) | استرجاع مُختبر 100% في gymcore_restore_test
```

**الميجريشنات:** `server/migrations/` حتى `054_members_updated_at.sql`. إصلاحات مخطط حرجة سابقة: `018` (تشفير الهاتف vs NOT NULL)، `053` (أعمدة TOTP)، `054` (updated_at + trigger).

---

## 4) خريطة المعمارية السريعة

- **المسارات:** `src/routes/index.tsx` (84 مساراً) + `routeConfigs/` (قديم، متجاوز — لا تعتمد عليه). `DashboardRouter` يوجّه حسب الدور.
- **⚠️ ازدواج البادئة:** الراوتر معلّق على `/api/v1` **و** `/` معاً → endpoints الصالة الحقيقية مثل `/api/v1/api/members` (نعم، مكررة — حقيقية وليست خطأ).
- **الأصالة:** كوكيز HttpOnly + CSRF (`GET /platform/csrf-token` → هيدر `X-CSRF-Token`) لعمليات المنصة المُغيّرة. الجلسات تُتحقق كل طلب وقد تتقادم — في الاختبارات سجّل دخولاً جديداً عند 401/403.
- **التقارير:** `server/src/controllers/platformReports.ts` — كل أعمدة `billing_invoices` الحقيقية: `total_amount/paid_amount` (لا يوجد `amount`!)، تواريخ الأعضاء `created_at/updated_at`، جغرافيا `address_country` (لا `address/city/zip`!)، `members` بلا `notes` (استخدم `blacklist_reason`).
- **أعمدة `gyms` الحقيقية:** name/subdomain/plan_tier/is_active/currency/phone/address_street/address_state/address_country/timezone/language/logo_url (+ لا email/city/zip/units!). أي استعلام يستخدم غيرها = 500.
- **الحالة المحذوفة نهائياً:** ZATCA (كونترولر+خدمة+مسارات+واجهة — صفر occurrences)، زرّا الإعدادات/الأمان من مركز التحكم، إجبار الـ onboarding للسوبر أدمن.

---

## 5) الاتفاقيات (إلزامية)

1. **التصميم:** لغة **Chalk & Brass** (انظر 1هـ) تُقرأ من التوكنات، وتُمرَّر عبر المكوّنات المشتركة فقط (`shared/PageHeader,StatsGrid,FilterBar,UnifiedTabs,PageLoader,ExportButton` + `ui/Card,Button,StatusBadge` + `dashboard/*`) — لا ألوان حرفية في الصفحات الجديدة. **ممنوع mocks جديدة** — أي بيانات تعرضها صفحة يجب أن تأتي من endpoint حقيقي (أو تُترك placeholder صريح).
1ب. **التوكنات (من 2026-10-16):** مصدر الحقيقة الوحيد للألوان `src/styles/tokens.css` — ثلاثيات HSL عارية بأسماء shadcn (`--background, --foreground, --card, --popover, --primary, --secondary, --muted, --accent, --destructive, --border, --input, --ring`) + `.dark` بمقياس **Court Green** (لا Obsidian — عيار داكن محايد كان يخلط النحاس بالأزرق البارد). موصولة في `src/styles/shadcn-colors.js` ثم `tailwind.config.js`، فالكلاسات (`bg-primary/10`) تشتغل عليها مباشرة. أي لون جديد = متغير هناك، لا hex داخل كلاس. `cn()` في `src/lib/utils.ts` و`components.json` جاهزان لمكوّنات shadcn/Aceternity.
1ج. **منطقة ما قبل الدخول:** هويتها كلها في متغيرات `--auth-*` (`tokens.css`) مكشوفة كألوان Tailwind باسم `auth-accent / auth-accent-strong / auth-accent-deep / auth-amber` + تدرّجان جاهزان `--auth-root-bg` و`--auth-cta-bg`. ممنوع كتابة `bg-[#06b6d4]` أو تدرّج حرفي في أي شاشة عامة — الاستثناء الوحيد `AUTH_ACCENT` في `components/auth/AuthAmbience.tsx` (نص حرفي لمكوّن الـ PWA).
1د. **مكوّنات shadcn/Aceternity (من 2026-10-16):** تُنسخ في `src/components/shadcn/` بأسماء الملفات الرسمية (kebab: `button.tsx`, `card.tsx`, `dialog.tsx`) وتُستورد عبر البادئة `@/` (`@/components/shadcn/button`, `@/lib/utils`) — الـ alias معرّف في `tsconfig.json` و`vite.config.ts`. `components.json` يوجّه `ui` لهذا المجلد تحديداً: **ممنوع** أن تكتب `shadcn add` أو نسخة يدوية داخل `src/components/ui/` (أما `Button.tsx` و`Card.tsx` القديمة فواجهاتها مختلفة وتعتمد عليها 60+ صفحة، والترحيل خطوة خطوة بمرآة خصائص لا باستبدال). أي مكوّن منسوخ: ألوانه من التوكنات فقط، وحشو اتجاهي بخصائص منطقية (`text-start`، `[inset-inline-end:…]`) لأن المشروع RTL — لا `left-4/right-4` في مكوّن مشترك. الـ Dialog مركزي دائماً (اتفاقية المودال في الذاكرة). الاعتماديات المثبّتة: `@radix-ui/react-slot|react-dialog|react-label` + `lucide-react` + `class-variance-authority` + `tailwindcss-animate`.
1هـ. **صدفة Chalk & Brass (من `af4a864`):** الثيم الفاتح = ورق عظمي `#f5f3ee` + حبر غرافيتي `#2b2620` + بطاقات `#fffdf9` + خطوط شعرية، بـ emerald للفعل فقط ونحاس كلون لمسة ثانوية (`--brass`/`--brass-soft`) و`--pine` للهوية. ممنوع أي `bg-white`/`text-gray-900`/`shadow-*` جديد في مكوّن مشترك — الكارت القياسي `CARD_CLASS` = `bg-card rounded-shell border border-hairline p-5 md:p-6` (بلا ظل: العمق من الحدود لا Blur). نصف القطر كله من `--radius` عبر `rounded-shell`، فيُغيَّر في سطر. **الخلايا الرقمية/الجداول لا تكون سوداء أبداً:** `--table-fg` و`--table-head`، ويغطيها `table:not(.no-shell-ink)` في `index.css` — أي جدول جديد يحتاج لوناً خاصاً على `<td>` يكتبه صراحة، والخروج من القاعدة بـ `no-shell-ink`.
1و. **الخط (قاعدة بعد الانتكاسة):** `Be Vietnam Pro` أولاً دائماً لأنه المستضاف محلياً والحرف اللاتيني والأرقام، و`Alexandria` (woff2 في `public/fonts/`) بعده مباشرة للعربي، ثم سلسلة النظام. **ممنوع** وضع وجه عربي CDN-only في رأس أي سلسلة أو إضافة مفتاح `sans` في ثيم Tailwind (يستبدل خط `html` في preflight) — أي خط جديد يُجرَّب self-host ومقارنة مرئية قبل لمس `index.html`/الثيم. تفصيل الأدلة في `LOCAL_TESTING_REPORT.md` §الانتكاسة و§خطة البرميوم.
1ز. **الوضع الداكن (من دفعة 2026-10-16):** الشاشات القديمة حاملة ~2.7 ألف كلاس حرفي، فبدل تعديلها سطر‑سطر يوجد **جسر** في `src/styles/legacy-utils.css`: قواعد `.dark .bg-white { … hsl(var(--card)) }` تعيد تعريف اسم الكلاس نفسه تحت الداكن (specificity ‏0,2,1 يتغلب على ‏0,1,0 بلا `!important`). القواعد المفروض إنها ثابتة ومُتحقَّق منها سكربتياً: (أ) لا تضيف أي قاعدة بلا بادئة `.dark` إلا بلوك `table:not(.no-shell-ink) .text-gray-900/.text-gray-800` (حبر الخلايا في الوضعين)، (ب) كل كلاس يجب أن يكون مستخدماً فعلاً في `src` — أي كلاس ميت يُحذف، (ج) الرموز الشفافة (`bg-white/5`، `border-white/20`) والتعبئة الممتلئة (`bg-emerald-600` = فعل الصالة) لا تُلمَس. **الافتراضي light**: `ThemeContext` عنده `light|dark|system` و`resolvedTheme`، ولا يتبع إعداد النظام إلا لو المختار `system` — لأن الداكن ينزل مجموعة مجموعات. سكريبت `index.html` يطبّق نفس المفتاح `gymcore-theme` قبل أول رسم (عقد بينه وبين `applyTheme()`: الكلاس، المفتاح، قيم `theme-color`)، والزّر في `components/layout/ThemeControl.tsx` بالتوب بار.
1ح. **المنبثقات المشتركة (من دفعة 2026-10-16):** أي مودال = `components/shared/Modal.tsx` (فوق `components/shadcn/dialog.tsx`) — **ممنوع** كتابة `fixed inset-0` يدوي في `src/pages`؛ أي قائمة/منيو = `components/shadcn/dropdown-menu.tsx` (رادكس، معتمَد بـ`@radix-ui/react-dropdown-menu`). توزيع الطبقات إلزامي: طبقة الـprimitive (`shadcn/*.tsx`) تخطيط وأنيميشن فقط، والصدفة كلها (`bg-card` + `border-hairline` + `rounded-shell` + الحشو + `shadow-none`) من المُستدعي — لأن `tailwind-merge` لا يفكّ التعارض بين الأسماء المخصصة والكلاسات الأساسية فتفوز الأخيرة بترتيب CSS. المودال مركزي دائمًا (اتفاقية المودالات)، ولا يفتح درجًا جانبيًا. أحجام Modal ‏`sm|md|lg|xl` = 24/28/32/42rem (هي اللي الصفحات القديمة كانت تستخدمها)، وزر الحذف/الخطر في القوائم = `variant="danger"` (لون `--series-6` لا `text-red-600`). مودال فيه mutation شغّالة يمرّر `disableDismiss={busy}`، وأزرار الأكشن خارج الـ`<form>` تُربط بـ`form="<id>"`. **Tooltip متعمد ما اتعملش**: الجرد طلع صفر تكرار (واحد فوق أفاتار + تلاتة apexcharts + `title=` لمربعات ألوان) — ما نضيفش مكوّن لموضع استخدام واحد. تفصيل الأدلة في `LOCAL_TESTING_REPORT.md` §المرحلة 4.
1ط. **الجداول (من دفعة 2026-10-17، واكتملت دفعتها الثانية في نفس التاريخ):** أي شبكة صفوف في `src/pages` = `components/ui/DataTable.tsx` (فوق `@tanstack/react-table`، معتمَد بـ`@tanstack/react-table@8.21.3`) — **ممنوع** كتابة `<thead>`/`<th className="text-right …">` يدوي في صفحة جديدة. العقد: العمود `{ key|value, label|header, cell, sortable, sortDescFirst, numeric, align, width }`، والشكل القديم `{key,label}` لسه مقبول (صفحتا `OtaUpdateManager`/`SmsGateway` تعمل به). الصفحات المُحوَّلة: `MemberList` · `SalesPage` · `CashboxPage` (دفعة 1) + `MembersPage` · `MembersReport` · `PaymentsPage` · `ExpensesPage` (دفعة 2). قواعد إلزامية: (أ) **الترتيب opt-in ويُطابق الـendpoint** — `/api/members` عنده whitelist (`member_name|created_at|end_date|remaining|visits|last_visit`) فتُرتَّب الأعمدة الموجودة فيها فقط مع `manualSorting` + `sorting`/`onSortingChange`، و`/api/reports/members` عنده أربع (`member_name|active_end_date|visits|subs_count`)، و`/api/finance/sales|payments|expenses` **لا تقبل `sort` إطلاقًا** فجداولها بلا ترتيب نهائيًا (الترتيب المحلي لصفحة محمّلة = ادعاء غير صحيح)؛ (ب) `enableSortingRemoval:false` وترتيب عمود واحد لأن عقد السيرفر `sort=<key>&order=asc|desc`؛ (ج) المحاذاة منطقية `text-start/text-end` وليست `text-right` (الأخيرة نهاية في الإنجليزي)، والمبالغ والعدّات `numeric` (= `end` + `tabular-nums`، و`align` الصريح يكسبها)؛ (د) الجدول داخل كارت/مودال يمرّر `bare` (لا يُُلغى الإطار بـclassName لأن `tailwind-merge` لا يعرف `rounded-shell`)؛ (هـ) جسم قابل للسكرول بـ`maxHeight` (الرأس يبقى `sticky`)، و`footer` لسطر الترقيم داخل نفس الصدفة، و`empty` لحالة الفاضي، والقيمة المفقودة تظهر `—` لا فراغ؛ (و) `minWidth="880px"` بدل أي قاعدة CSS خارجية للعرض الأرضي على الموبايل، و`rowTitle` هو الـ`title` الظاهر على الصف المرتبط بـ`onRowClick` — **ممنوع** إرجاع قاعدة `.members-table` في `index.css` (اتحذفت مع كل مواضع استخدامها). صف الجدول الفعلي 45px يساوي `SkeletonTable` سطر بسطر (متقاس على عرض 900px) — أي تغيير في حشو `DataTable` يكسر مطابقة السكيلتون. تفصيل الأدلة والقياسات الحية في `LOCAL_TESTING_REPORT.md` §المرحلة 5 (دفعتا 1 و2).
1ي. **الفوكس والوصول (من موجة 2 — 2026-10-17):** أرضية فوكس عامة في `src/styles/index.css`: `:where(a, button, [role=button], input, select, textarea, summary, [tabindex]:not([tabindex=-1])):focus-visible { outline: 2px solid hsl(var(--brass)); outline-offset: 2px }` — **لا تكتب `outline-none` في أي حقل جديد من غير بديل**، و**لا تستبدل الأرضية بـ`focus:ring` في الصفحات** (الـ52 موضعًا اللي ليها ring/border خاص بيغطّيهم سطر «التنحي» `[class*="focus:ring"]:focus, … { outline-color: transparent }`؛ أي كلاس استبدال جديد يتضاف للقائمة دي لو اتستخدم). لون المؤشر **`--brass` مش `--ring`**: `--ring` = emerald وقياسه 2.29 على العظم/2.50 على الكارت تحت حد 3:1 (WCAG 1.4.11)، و`--brass` = 3.42/3.73 فاتح و8.09 داكن — وتغيير `--ring` نفسه قرار المالك (69 موضع `ring-ring` + كل shadcn). المخرج الوحيد من الأرضية = كلاس `no-focus-floor` على العنصر اللي الـwrapper بتاعه بيرسم مؤشره (`focus-within:*` في شاشات ما قبل الدخول — مستخدم على 10 حقول في 4 ملفات)؛ **ممنوع** استخدامه كمخرج كسول. `prefers-reduced-motion` محطوط (مدد 0.01ms) — أي أنيميشن جديد ما يحتاجش استثناء. في `DataTable`: الصف `tabIndex={0}` + Enter/Space لما `onRowClick` موجود، والحارس `event.target !== event.currentTarget` إلزامي (زرار جوه الخلية بيرفع Enter بنفسه)، والاسم الصوتي للشبكة = prop `caption` (يُرسم `<caption class="sr-only">`) **لا** `aria-label` على `<table>`. في `AppLayout`: skip link `sr-only` → `focus:fixed focus:top-3 focus:start-3 focus:z-50` على صدفة الكارت + `<main id="main-content" tabIndex={-1}>` — أي تخطيط جديد للصدفة يحافظ على العنصرين دول، والحشو المنطقي بـ`start-*` (مش `left/right`) لأن المشروع RTL. في `shared/Modal` (Radix Dialog): حبس الفوكس وEscape والعزل بتاع الخلفية متقاسة حيًا بـTab/Enter/Esc حقيقي — لكن **مفيش `aria-modal`** (Radix 1.3.1 بيستخدم `hideOthers` فبيتحط `aria-hidden="true"` على `#root`، وده المحقق اللي لازم تتأكد منه)، و**استرجاع الفوكس للعنصر الفاتح مش جوه Radix** — كان بيقع على `body` بعد القفل لأن `react-remove-scroll` بينقله لجوه المودال قبل ما `FocusScope` يحفظ «السابق»، **واتحل في `Modal.tsx` نفسه**: الفاتح بيتحفظ في render phase (قبل تركّب الـportal) و`onCloseAutoFocus` بـ`preventDefault()` بيرجّعه، مع حارس `document.contains` للفاتح اللي بيتمسح بعد الـmutation. العقد: **`Modal` بيملك الحفظ والاسترجاع — أي صفحة أو مودال جديد ممنوع يعمل الحساب الخاص بيها**، و**ممنوع** تضيف `aria-modal` بنفسك (العزل ده شغل `hideOthers`). القياسات الحية كاملةً والتغيير الـDB المعلَن (`manager@first-gym.com` بقى `is_active = true`) في `LOCAL_TESTING_REPORT.md` §موجة 2.
2. **التحقق:** `npx tsc --noEmit` (أمامي وخلفي، `noUnusedLocals/Parameters` مفعّلة) + `npm run build` بعد أي تعديل واجهة.
3. **i18n:** مفاتيح `ar.json/en.json` (تكافؤ 100% — حافظ عليه) للقوائم (`nav.*`) والهيدر واللوحات؛ بقية الصفحات ternaries داخلية (`isRtl ? ar : en`) — لا تخلط النظامين في ملف واحد بلا داعٍ. الافتراضي `ar` + `ar-EG` للتواريخ + `EGP/ج.م`.
4. **الأيقونات:** محاكي `src/lib/lucide-react.ts` حُذف نهائياً (2026-10-16) ولا يُرجَع أبداً — أي استيراد من `lucide-react` اليوم يذهب للحزمة الحقيقية (مثبّتة الآن لأن مكوّنات Aceternity مكتوبة عليها). التوزيع الحالي: الصفحات الـ63 تستورد `@phosphor-icons/react` مباشرة، والمكوّنات المشتركة/المنسوخة من Aceternity تستخدم `lucide-react`، وMaterial Symbols باقٍ في الخطوط القديمة. لا مكتبة رابعة، وأي اسم phosphor متبقٍّ كاسم محلي (`CheckCircle as CheckCircle2`, `Warning as AlertTriangle`, `List as Menu`, `Pencil as Edit3`, `Gear as Settings`, `Envelope as Mail`, `EyeSlash as EyeOff`, `Barbell as Dumbbell`) مقصود لتقليل الدفوع — تحويلها لعملية لاحقة.
5. **السيد:** أي جدول جديد يُغذّى في `seedEngagement.ts` (إضافي) لا في `seedTenGyms.ts` (تأسيسي). راجع قيود CHECK/FK من `information_schema` قبل الإدخال (الأخطاء السابقة كلها من هذا النوع).
6. **التوثيق:** أي إصلاح/قرار يُضاف لـ `LOCAL_TESTING_REPORT.md` (سجل حي) + هذا الملف عند تغيّر الإجراءات. **ومرجع الحالة والأولويات (مرائي):** `AUDIT_REPORT_2026-10-17.md` — لقطة تقييم مقيسة بالأوامر (بصمة/فحوص/P0-P2) وفيه §9 المراجَعة المرائِية و§10 حالة التقدم و§11 بروتوكول التحديث مع بلوك الفحوص الجاهز؛ أي milestone يغيّر رقمًا أو يقفل بند P0/P1 يحدّثه في نفس الـcommit، وممنوع فيه طباعة أي قيمة اعتمادية.

---

## 6) المزالق المجربة (لا تعيد اكتشافها)

- **مصدر بيانات واحد (2026-10-11):** Docker وحده — `server/.env` صار `DATABASE_URL=postgresql://gymcore:***@localhost:5433/gymcore` و`reset-local.ps1` يستهدف 5433/gymcore. إبقاء حاويات الـ backend/frontend مبنية من الكود الحالي (`docker compose up -d --build`) ضروري — الصور القديمة تعرض كوداً قديماً (حادثة 42 ساعة موثقة). لا native postgres بعد اليوم؛ `C:\pgsql` للتصدير/الأرشفة فقط.
- **PowerShell:** بلا `&&`، الاقتباس `\'{\"a\":1}\'` يُفسد JSON في curl — استخدم ملف `@file.json`. `Select-String` بلا `-Recurse`.
- **الجلسات:** 401/403 بعد تغيير كلمة مشرف = سجّل دخولاً جديداً (الجلسات تُبطل). كلمات المرور: دخول الموظفين ≥8 أحرف، مشرف المنصة ≥8 (كبير+صغير+رقم).
- **ts-node-dev:** أي حفظ في `server/src` يعيد التشغيل ويعيد الميجريشنات (بطيء ~دقائق مع triggers) — لا تستعجل health check.
- **Vite:** ملف `.env` الجذري يُقرأ عند الإقلاع فقط — أعد تشغيل Vite بعد تغييره (HMR لا يكفي للمتغيرات).
- **ApexCharts:** ممنوع تمرير `undefined` صريح في options (يمحو الافتراضيات وينهار `globalVars`) — احذف المفتاح. ومخطط `line` كان يُعرض أعمدة (مُصلح في `Chart.tsx`).
- **ترتيب أعمدة INSERT:** عدّ القيم مقابل الأعمدة يدوياً — 3 انهيارات سيد سابقة من هذا.
- **الـviewport بلا سطح (قياسات المرحلة 5):** `window.innerWidth = 0` و`innerHeight = 0` في بيئة التحقق هنا، فأي عنصر عرضه تلقائي ينكمش لمحتوى العمود ويتلفّع — أول قياس لارتفاع صف طلع 85px بدل 45px. **اربط عرضاً حرفياً** (`style={{width: 900}}` على الشجرتين) قبل أي قياس ارتفاع/التفاف/محاذاة. و`requestAnimationFrame` لا ساعة له (النص ينتظر للأبد ويسبب timeout بعد 15s)، فانتظر بـ`setTimeout`. المزلقان دول مع بعض نفس سبب تجميد ساعة الأنيميشن المكتشف في المرحلة 4.
- **`tailwind-merge` والأسماء المخصصة (تأكيد المرحلة 4 على الجداول):** `rounded-shell`/`border-hairline` مش معروفة لديه، فتمرير `className="rounded-none border-0"` على مكوّن يحمل الصدفة يسيب الاتنين في الناتج وترتيب CSS هو اللي بيحكم — الحل كان prop صريح (`bare`) بدل override. وأياً كان المُعدِّل، تأكّد إن الكلاس **مولّد** في `dist/assets/*.css` (`grep -oF`) قبل التسليم: `bg-series-6/12` مثلاً ما كانش بيولّد حاجة لأن 12 مش في مقياس الـopacity، من غير أي تحذير.
- **حقول وهمية في `/api/members`:** الرد ما فيهوش `join_date` ولا `status` (فيه `created_at` و`subscription_status`)، والأنواع في `api.ts` اختياريّة فالـTS ما بيشتكيش. أي صفحة تقرأ `m.join_date` أو `m.status` بتطلع عمود فاضي أو شارة «موقوف» لكل الصف — `MemberList` كانت كده فعلاً في `/trainer/clients` و`/reception/members`. اطبع الحقول من الـSQL قبل ما تعتمد عليها.
- **نص أبيض فوق `--primary` = 2.54 (مستند في §خطة البرميوم):** emerald-500 مع `#ffffff` لا يجتاز AA،
  وهو عيب سابق للصدفة الجديدة وليس بسببها. أي قرار بتغميق `--primary` أو تغيير `--primary-foreground`
  يمسّ 123 موضعاً + أزرار كل الشاشات، فلا يُتَّخذ ضمن دفعة ألوان — يُعرض على المالك برقمين قبله وبعده.
- **1700+ كلاس حرفي في الصفحات:** `bg-white` (585) و`text-gray-900` (663) و`border-gray-100` (491)
  ما زالت مكتوبة في `src/**/*.tsx`، فلا تتوقع أن تتبع صفحة قديمة التوكنات. دفعة الألوان المستقلة
  (استبدال نصّي محكم + `tsc`/`build`) هي الحل؛ ومقياس `surface-container-*` في `tailwind-tokens.js`
  hex بارد خارجها لأنه لا يقرأ المتغيرات (35 موضعاً).
- **tailwind-merge ما يعرفش الأسماء المخصصة (دفعة 2026-10-16):** `rounded-shell` و`border-hairline`
  و`bg-series-6/10` كلاسات project-locals، فـ`cn()` بيسيبها هي والكلاس الأساسي **الاتنين** في
  الـclass النهائي والفوز بترتيب الـCSS. النتيجة الفعلية: `components/shadcn/dialog.tsx` كان حامل
  `rounded-xl` — والمشروع بيعرّف `rounded-xl = 1.5rem` (مقياس bootstrap في `tailwind.config.js`) —
  فالـModal كان بيطلع 24px بدل `--radius` ‏(10px) رغم إنه بيمرّر `rounded-shell`. القاعدة: طبقة
  الـprimitive ما تحملش radius/لون حدود/حشو/ظل، والمُستدعي يدي الصدفة كاملة.
- **مُعدّل ألفا خارج سلّم `opacity` يسكّت بصمت:** `bg-series-6/12` اتكتب وما اتولّدتش أي قاعدة
  في الـCSS المبني (السلّم 0/5/10/20/25/30/…) فلا خطأ ولا تحذير — العنصر ببساطة ملوش hover wash.
  استخدم درجة من السلّم (`/10`) أو صراحة `/[0.12]`، ودائمًا `grep` في `dist/assets/*.css` قبل ما
  تقول إن القيد اشتغل.
- **الـheadless viewport بيجمّد ساعة الأنيميشن:** في environment ملوش surface ظاهر
  (`take_screenshot` بيرفض بـ`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`، و`:focus` ما بيطابقش)،
  `data-[state=closed]:animate-out` بيخلّي Radix `Presence` مستنية `animationend` مش جاية
  (`playState: running, currentTime: 0`) فالسكريم بيفضل mounted والـscroll lock على الـbody
  والإرجاع للفوكس باين غلط. دي مش عيوب المكوّن: عطّل الأنيميشن بـ`*{animation:none!important}`
  أو قارن برادكس عاري قبل ما تحكم، وافتكر إن `.click()` البرمجي ما بينقلش الفوكس فاختبارات
  «الفوكس مرجعش للزر» تكون artifacts.
- **`--brass-soft` الداكن مش خلفية نص (دفعة الجداول 2026-10-17):** المتغيّر معرّف «مفتاح hover دافي»
  (`#6b5a33`، 2.20 مقابل الكارت)، فأي `text-pine` فوقه في الداكن = **2.66** (مقيس computed، والاقتران
  نفسه في الفاتح **9.96**) رغم إن الاسم واحد في الوضعين. القاعدة: أي شارة/أفاتار `bg-brass-soft`
  يحمل نص يحتاج `dark:text-foreground` (يرفعه لـ**5.83**). الجرد الشامل (`grep bg-brass` على `src/**`)
  طلع **موضعين فقط** والاتنين متظبّين: `MembersReport.countChip` و`MemberList` (أفاتار الحرف الأول،
  14px/700 = نص صغير فالمقياس المطلوب 4.5). أي `bg-brass-soft` جديد: تُقاس النسبة في الوضعين قبل
  التسليم، مش بالعين.
- **القياس الحيّ في المتصفح ليه قواعد مخصوصة (2026-10-17):** (أ) نقرة MCP على زرار `submit` **ما
  بتشغّلش** معالج React — القيم تتحط بضبط وما بيروحش `POST /auth/login` نهائيًا؛ استخدم
  `form.requestSubmit()` من `evaluate_script` (بينما `.click()` على أزرار رءوس الجدول وروابط
  السايدبار بيشتغل عادي). (ب) `grep` من الشيل بياكل escape كلاسات Tailwind (`hover\:bg-muted`،
  `max-md\:text-base`، `dark\:text-foreground`) وبيرجع **false-negative** — افحص `dist/assets/*.css`
  بـnode `indexOf`. (ج) اللوجاوت بيمسح `localStorage` بالكامل فمفتاح `gymcore-theme` بيروح معاه
  وترجع light لوحدها — لا تفسّر ده على إنه ثيم مكسور.
- **البيئة المشتركة مع الجلسات الموازية (2026-10-17):** أثناء التحقق الحيّ سقطت الجلسة كلها بـ
  `Session has been revoked` وفاضت قاعدة الأعضاء (`/api/members` → `total: 0`) على نفس DB الـdocker،
  والباكند native اللي شغال بـ`npm run dev` بيؤدّي كرونو `subscriptionCleanup`/`subscriptionEnforcement`
  على نفس البيانات. أي قياس حي لازم ياخد في حسبانه إن صالة التطوير دي مش محتكرة لجلسة واحدة،
  ويفضّل إعادة اللوجين وقراءة الاستجابة (`fetch` بنفس الجلسة) قبل الاستنتاج من الـDOM.
- **أي 401 من endpoint خاص بالصالات في جلسة السوبر ادمن = طرد من المنصة (2026-10-17):** فرع الـ 401 في
  `src/services/api.ts` بيقول: مفيش `refresh_token` + `getStoredRole() === 'super-admin'` →
  `clearTokens()` ثم `window.location.href = '/login'` (توجيه **قسري** بيهدم سياق المتصفح كله).
  فالمطلوب إن أي مكوّن مشترك بينادي على endpoint من `/api/*` (ده `requireRole('manager')` على
  السيرفر، وكوكي المنصة مرفوض فيها — قِيس: `/api/settings` → 401 بينما `/platform/auth/session` →
  200 بنفس الكوكي) يقيّد الطلب بـ`enabled` مربوط بالدور. `Sidebar:155` كان بيجيب لون البراند من
  `getSettings` بغير قيد، فالسوبر ادمن كان بيطير بره المنصة في نفس لحظة فتح اللوحة؛ اتصلح بـ
  `enabled: role === 'gym-admin'` + `retry: false` (`AppLayout` و`TopNav` كانوا صح بالفعل).
  القاعدة: `role` هنا أدوار الواجهة (`ROLE_MAP`: manager/owner → `gym-admin`) مش أدوار السيرفر.
- **الحقل الاختياري بالـ`''` يسقط في zod (إضافة صالة 2026-10-17):** `z.string().email().optional()`
  بيقبل `undefined` **مش** `''`، فالمعالج اللي بيبعت الحقول الفاضية كان بيرفض كل محاولة إنشاء
  صالة بـ«Validation failed». العقد بقى `.or(z.literal(''))` لـ`gym_email`/`contact_email`
  (زي `loginSchema`)، والواجهة تبعت `form.gym_email || undefined`. **وما تطمسش `details`:**
  `middleware/validate.ts` بيرجع `{error, details:[{field,message}]}` — اقرأ `details` في
  `onError` وإلا المستخدم يفضل شايف كلمة واحدة غامضة.
- **المتصفح بيعمل autofill لنماذج المنصة (2026-10-17):** في `/super-admin/tenants/new` Chrome
  حطّ بريدًا شخصيًا محفوظًا في خانة بريد المدير وكلمة سر محفظتك في خانة كلمة السر. أي تجربة حيّة
  على النموذج ده لازم تتوقف عند ظهوره، والتحقق يتحوّل لـAPI ببيانات اختبار صريحة ثم
  `DELETE /platform/gyms/:id` (مطلوب `{"confirmation":"DELETE"}` + `X-CSRF-Token`) فما تسيبش
  صالة زائدة في الـDB المشترك.
- **البذرة التجريبية في مسار الإنتاج (اتشالت 2026-10-17):** `server/src/seed/seedNewGym.ts` كان
  بيحشي كل صالة جديدة بـ15 عضو ملفق (صور `ui-avatars.com`، تليفونات `+9665…`) + اشتراك `active`
  لكل واحد + حضور 7 أيام + 6 منتجات (باركود `200000`–`200005`) + 4 تصنيفات مصروفات، وبيرفع
  `gym_usage_counters.current_members_count` لـ15. دلوقتي الدالة logging بس والصالة بتفتح فاضية
  (المقاييس في `LOCAL_TESTING_REPORT.md` → «إصلاحات جلسة السوبر ادمن»، البند 3).
  **ما ترجعش تبذر بيانات وهمية في أي مسار إنتاجي** — قاعدة صفر mock؛ ولو اللوحة الفاضية باينَة
  ناقصة فالحل checklist حقيقي، مش بيانات مزروعة. `seedDefaultSports`/`seedDefaultOffers` لسه
  مُصدَّرة لأن `gymReset` و`onboarding` بيستخدموهم، ونداء `seedNewGym` سيبته seam في
  `platformGyms.createGym` (الملف عليه diff لسه uncommitted من جلسة موازية).
  **الفجوة المتبقية:** `onboarding.ts` بيزرع 4 عروض اشتراك ومعالج المنصة ما بقاش — يعني أي صالة
  اتعملت من المنصة لازم مديرها يعمل عروض بنفسه قبل أول `createMember(plan_id)` أو check-in يدوي.
- **حذف صالة كان مستحيل بعد أول دخول لمديرها → اتصلح soft delete (2026-10-17):** `DELETE FROM gyms`
  كان بيرجع **500** بقيد `activity_logs_staff_user_id_fkey`، و`activity_logs` append-only (triggers
  بيرفع `TABLE_IS_IMMUTABLE`) فمفيش طريقة لمسح سجل المدير — القياس على الصف الحقيقي أكّد الـ23503.
  `deleteGym` دلوقتي `UPDATE gyms SET deleted_at = CURRENT_TIMESTAMP, is_active = false` +
  `UPDATE staff_users SET is_active = false` جوّا `BEGIN/COMMIT` **صريح** (`getAdminClient()`
  بيفتح معاملة ضمنية، وأي فاشل يسيبها `25P02`)، والردّ محتفظ بنفس الشكل فما اتغيّرش `api.ts`.
  **بقايا مُعلنة:** صالة الاختبار `4f4972e5…` فضلت مُأرشفة بسطور الـlogs بتاعتها — مسحها الجذري
  مستحيل من غير كسر قاعدة التدقيق. الحذف الجذري الحقيقي (purge + نقل الـlogs لأرشيف) لسه بند.
- **`:9000` مش الـdev server — دي صورة Docker:** :9000 بتخدم `dist` متبني **جوه الـimage**، فالإصلاحات
  اللي على القرص ما بتظهرش هناك لحد ما تعمل `docker compose build frontend backend && up -d`
  (الـdev server الحقيقي على :9100). مزلق التحقق من ده: `GET /auth/me 401` في الكونسول كان **عرضًا**
  لطبيعي لجلسة منصة، مش العطل — العطل كان `/api/settings` اللي بيسأله الـbundle القديم.
  **أي rebuild ياخد الـworking tree كله**، ف:9000 مش مرآة لـ`main`.
- **بصمة التحقق لازم تتقاس على build سليم الأول:** البحث عن `enabled:"gym-admin"` طلع **0** في
  القديم والجديد معًا لأن esbuild بيقلّل لـ`enabled:r==="gym-admin"`. اكتب البصمة من `dist` معروف
  إنه صح، وإلا هتتّهم الكود وهو بريء.
- **التاب المخفي يجمّد الـtransitions فالقياس يكدب:** في `visibilityState=hidden`،
  `getComputedStyle(el).backgroundColor` على عنصر فيه `transition-colors` بيرجع قيمة **ما قبل**
  التغيير (الداكن قِيس على كارت POS وطلع ورق فاتح بينما `--card` نفسه كان بقيمة الداكن). الحل:
  `el.style.transition='none'` قبل القراءة، أو قارن بعنصر جديد نفس الكلاسات في نفس الـDOM.
- **`localhost` و`127.0.0.1` جرتين كوكي مختلفتين:** الكوكي host-based مش port-based — فتح الـdev
  server على `http://127.0.0.1:9100` بيسمح بدخول حساب اختبار من غير ما تطير جلسة المالك المفتوحة
  على `localhost:9000` (والعكس). ده أنضف طريق للتحقق بالمتصفح.
- **`planGuard` بيمنع إضافة منتجات على Starter:** `POST /api/products` محتاج ميزة `products`،
  و`gym_effective_features` للـStarter = `{attendance, dashboard}`. صالات الاختبار للـPOS/المتجر
  لازم تتسند على خطة فيها الميزة (أو وحدة إضافية) قبل ما تتهم الواجهة بالخلل.
- **مسح بيانات الديمو من صالة موجودة:** `server/scripts/remove_demo_seed_data.sql` — للأمر نفسه
  transaction مفتوحة على `SELECT` تحقق و`COMMIT` معلّق (المالك يكتبها). الـdry-run اتعمل:
  `SELECT 15 / DELETE 52 / DELETE 15 / DELETE 15 / DELETE 6 / DELETE 4 / UPDATE 1` ثم تحقق
  `members 0 · subs 0 · attendance 0 · offers 4 · sports 7 · counter 0`، والـabort سيّب الأصل
  كما هو (قُيِّت تاني: 15 / 52 / 15).
- **Railway staging (2026-10-12، تحدَّث 2026-10-17):** النشر بـ `railway up` من الجذر (سياق build = repo root).
  بروكسي Railway يوصل للـ replica على **منفذ 8080** إن لم يُضبط Application Port — nginx يlisten على 80+8080 معاً. بعد كل redeploy للـ backend **أعد نشر الـ frontend** (nginx يظلّم DNS لـ `backend.railway.internal` عند الإقلاع وإلا يجمّد البروكسي) — كان الرفع التلقائي (§29) بيخلي كل push يبني الخدمةين معاً، **ده وقف من 2026-10-17** (شوف §6د) فالدفع والنشر بقوا خطوتين. `railway service restart` يتعطّل أحياناً — `railway up -d` أضمن.

---

## 6د) الدفع لم يعد نشرًا — قاعدة المالك (2026-10-17)

المالك قرر: **`git push` يبقى للنسخة، والرفع لـ staging قرار يدوي في كل مرة**. أي agent
قبل ما يدفع يسأل «أرفع ولا نسيبه على الريبو؟» وما يعتبرش الدفع = نشر.

- **اللي اتعمل:** auto-deploy اتقفل لخدمة الـ backend والـ frontend على مشروع
  `gymcore-staging` / environment `production`:
  `railway api 'mutation { serviceInstanceAutoDeployUpdate(input: {projectId, environmentId, serviceId, enabled: false}) { enabled } }'`
  serviceId: backend `64b179de-64a8-4e6a-a4c5-247013cb6913` — frontend `043d0844-680f-4a04-b4c3-0fbb4ddf3c01`
  projectId `3afee7fa-2cf0-4b90-a81f-832ebba65f36` — environmentId `1e7438e0-61de-457a-b5dd-5c9d53a607f9`.
- **التحقق:** read-back بـ`Query.serviceInstanceAutoDeployStatus` → `enabled: false` للاتنين،
  و`canEnable: false` بـ`reason: "NO_INSTALLATION"`. **معناها عمليًا:** إعادة التشغيل من الـCLI
  ما تكفيش — لو المالك عايز يرجّع الرفع التلقائي لازم من الـDashboard (إعادة ربط الـGitHub App)
  أو يفضل يعمل النشر اليدوي `railway up -d` من الجذر.
- **النشر اليدوي بعد كده:** `git push` (توثيق/نسخ) وبعدها لو المالك وافق:
  `railway up` للخدمة المطلوبة من الجذر، أو `railway up -d`. الـmigrations بتشتغل لوحدها عند
  إقلاع الباكند (`app.ts:150` → `runMigrations()`)، فمفيش خطوة SQL إضافية على staging.
- **حذارِ من `railway variable list`:** الطباعة بتعرض **القيم** (مرّة طلعت `JWT_SECRET` في سجل
  جلسة). أي فحص للمتغيرات لازم يكون بقراءة الأسماء بس من غير ما القيم تظهر، وما ينفعش القيم
  تتكتب في أي ملف أو تقرير. **مطلوب من المالك:** يدير `JWT_SECRET` جديد على staging لأن القديم
  اتعرض في نص tool output (إدارته بتطلع كل الجلسات الحالية — طبيعي بعد الدوران).

## 6هـ) دخول staging: التشخيص الصح (2026-10-17)

- staging عليها **ديتابيز منفصلة** (Railway Postgres، حجم ~118MB) — بيانات/كلمات سر ديتابيز
  التطوير المحلي ما بتطابقهاش. القياس: `platform_admins` على staging = **1 صفوف نشط**
  (`SELECT count(*) ... FROM platform_admins` من جوّه الكونتينر بـ`railway ssh -s backend`،
  بدون قراءة أي عمود سرّي) — ففرضية «الجدول فاضي» بتاعة §34ك **مش متحققة** النهارده.
- `/login` بيعمل attempt على `/platform/auth/login` الأول وبعدين fallback `/auth/login`
  (`AdminLoginPage:166` و`:177`)؛ اتقاس من المتصفح على staging: `/platform/auth/login → 401`
  و`/auth/login → 401` و«Invalid email or password.» يعني **مسار المناداة والنشر والـCORS
  سليمة** (preflight على `/platform/auth/login` رجّع 204 بصلاحيات CORS صح) فالسبب **بيانات
  غير مطابقة لكلمة السر على ديتابيز staging**، مش بلاء توجيه زي عطل المحلي.
- **الطريق الآمن للمالك (من غير ما Agent يلمس كلمة سر):**
  `https://frontend-production-abdd.up.railway.app/forgot-password?area=admin` — على staging
  مفيش `SMTP_*` مت ضبط، فـ`services/email.ts:52` بيطبع رابط الريست في اللوجات بدل ما يبعتّه:
  `railway logs -s backend --lines 120 | grep -A3 "SMTP not configured"` → الرابط فيه token
  **سر** فافتحه في متصفحك انت وما تسيبوش يترجَّ في نص ولا في commit. الرابط صالح 30 دقيقة
  وبيوصلك لـ`/reset-password?token=…&type=platform`.
- **مزلق قياس:** لوجات الـHTTP على Railway بيوصلوا متأخرين (قياس: محاولة متصفح الساعة 04:06
  ما كانش ليها سطر في `railway logs --http` في نفس اللحظة) — فـ«مفيش سطر في اللوج» **ما
  معناهوش** إن الطلب ما اتعملش؛ اتأكد من المتصفح (fetch/XHR hook) قبل أي استنتاج.

## 6و) طبقة خصم الباقات (§46) — العقد الجديد وطريقة فحص شاشات المنصة (2026-10-17)

- **العقد المالي (لا يُكسر):** `billing_plans.price_monthly/price_yearly` = **السعر المحمَّل فعلًا**.
  أي كود أبرام أو فوترة أو شاشة تسعير يقرأ العمودين دول وبس. `list_price_*` (المشطوب) و
  `discounted_price_*` («الآن») و`discount_active` طبقة عرض/استرجاع: مفعّل ⇒ `price_* = discounted_*`،
  معطّل ⇒ `price_* = list_*`، وحذف الخصم بيمسح الطبقتين و`price_*` بيرجع للكامل. كل الاشتقاقات في
  `server/src/services/planPricing.service.ts` (نقية + 8 اختبارات) — أي إضافة جديدة تُكتب هناك لا
  في الـcontroller.
- **الباقة المعطّلة ≠ محذوفة:** `planPrice()` بيرفضها عند الإبرام (`404 PLAN_NOT_FOUND`)، لكن
  الفوترة بتقرأ `platform_contracts.price` (لقطة التوقيع) فالعقود القديمة (11 حاليًا) ما بتتأثرش.
  `deleteBillingPlan` بيعطّل بدل الحذف لما في مراجع، و`?include_archived=true` هو الوحيد اللي
  بيُظهر القديمة — شاشات الإبرام وإضافة صالة لازم تفضل على الافتراضي.
- **فحص شاشات المنصة من غير دخول المالك:** `platform_admins` محليًا فيه حساب المالك فقط، ولازم
  ما يلمسش حد بياناته. البديل المجرب: سكربت `ts-node --transpile-only` **داخل `server/`**
  (عشان `pg` يتحلّ) يستورد الـcontrollers نفسها ويستدعيها بـ`req` وهمي
  (`{headers:{},query:{},params:{},body:{}}`) و`res` وهمي يجمع `status/json` — مسار auth كامل بره،
  والباقي حقيقي (SQL فعلية، تحققات فعلية، كتابات فعلية). `logPlatformAudit` بتقبل `req` اختياري
  فأسطرها بتتنزل بـ`actor_id IS NULL`؛ عدّها في التقارير (12 هنا) لأنها append-only وما تتمسحش.
  التنظيف بنفسي: نفس السكربت يحذف صفوف التجربة، و`SELECT count` يتأكد إنها صفر.
- **مزلق react-query (TS2769):** أي دالة API بتقبل اختياريًا object
  (`listBillingPlans(opts?)`) لازم تتلف في `queryFn: () => fn(opts)` — الممرر المباشر بيوصله
  سياق الاستعلام كـ`opts` و`QueryFunction` بيرفض الأنواع. والأفضل خليك ثابت في المفتاح:
  `['billing-plans', 'catalog']` (مفاتيح بـboolean بتكسر الـtype، والمفتاح المتغير بيعيد الجلب
  كل ما المستخدم يبدّل عرض).
- **مزلق «الفُلتر اللي بيكشف نفسه» (§46.1، مقاس على staging):** شاشة الباقات كانت بتجلب
  `includeArchived: showArchived` وبتعرض checkbox «عرض المؤرشفة (N)» فقط لما `archivedPlans.length > 0`
  — يعني الخيار محتاج المؤرشفة تكون جاية **قبل** الضغط: dead end أبدي (القياس: `label = 1`,
  `input[type=checkbox] = 1` = تبديل الشهر/السنة بس، ومفيش «عرض المؤرشفة» في الـDOM).
  القاعدة: شاشة **إدارة** الكتالوج تجلب النشط + المؤرشف دايمًا، و`showArchived` يفضل فلتر **عرض**.
  لو عملت كده، راجع إن مفيش منتقيات تانية بتتغذى من نفس الـquery (`plans` في `BillingEngine`
  مستعملة في موضعين للـpartition بس — مقاس بالـgrep) عشان الباقات المؤرشفة ما تدخلش قوائم الإبرام.
- **الأرقام العربية-الهندية (`٠١٢٣٤٥٦٧٨٩`) ممنوعة في النصوص المخلوطة:** `من ١٢ دفعة` جنب
  `5,000.00 ج.م` و`ضريبة ١٤٪` جنب `700.00` بتبان رديئة في نفس السطر. أي رقم في جملة عربية
  يتكتب غربي زي باقي الأرقام، وأي `dir="ltr" font-mono` بيتحوّل معاه. (`BillingEngine` بقى 0
  مواضع عربية-هندية بعد §46.1.)
- **مزلق zod (`.partial()`):** `updateCouponSchema = createCouponSchema.partial()` كان **بيسرّب
  `.default('percentage')`** جوه التحديث، فأي PUT بدون `type` بيرجّعه من غير ما المستخدم يطلب.
  schemas التحديث تُكتب صراحة (`.nullish()` لكل حقل) مش `.partial()` على schema فيه defaults.
- **مزلق الـmigrations المتراكمة:** `billing_coupons` كان له شكلين (022 و043) والواجهة بتقرا
  أعمدة 022 على قاعدة 043 → **500** قبل أي تعديل. قبل ما تكتب CRUD: `\d <table>` على قاعدة
  التطوير وشوف الأعمدة الفعلية، وسوّي الصيغة بـmigration تسوية (`080`) مع backfill
  `coalesce(current_uses, used_count, 0)` (الأقدم الأول) بدل ما تعمل UI على التخمين.

## 6ز) الترتيب الملزم: المحلية أولًا، وstaging بأمر صريح (2026-10-17)

- **قاعدة المالك (اتذكّرت تاني بعد §46):** الشغل بيتعمل ويُقاس على **النسخة المحلية** أولًا،
  والرفع لـstaging **ما بيتمش إلا بأمر صريح منه** — أمر «ادفع وخليه على staging دلوقتي» مرة واحدة
  ما بيغطيش الدفعات اللي بعدها. الدفع (`git push`) والنشر (`railway up`) قرارين منفصلين، وكل
  واحد بموافقة لوحده.
- **`railway up` بيرفع شجرة العمل مش الـcommit:** عشان كده طلب «ارفع مجلد Work بالكامل» كان لازم
  يتاخد صراحة. لو عايز نشر commit معين فقط: `git worktree add` من جوّه المشروع أو stash بموافقة
  المالك — ومحاولة worktree بره المجلد اترفضت من classifier.
- **ليه `:9000` بيفضل على القديم بعد أي commit (الفخ اللي اتكرر):** `frontend` في
  `docker-compose.yml` **بلا volumes** والصورة multi-stage بتخبّز `dist` وقت البناء — فالكونتينر
  بيخدم **أثر بناء**، مش الشجرة. القياس التفريقي السريع:
  `curl -s http://localhost:9000/ | grep -oE 'assets/[A-Za-z0-9._-]+\.js'` مقابل
  `ls -t dist/assets/index-*.js` و`docker images --format '{{.Repository}}\t{{.CreatedSince}}'`.
  لو اختلفوا ⇒ محتاج إعادة بناء، مش عطل كود: `docker compose build frontend backend &&
  docker compose up -d backend frontend` (محلي فقط، ملوش أي أثر على staging).
- **سطحان محليان، وظيفتان:** `:9100` (Vite dev) = الشجرة لحظيًا؛ `:9000` (Docker/nginx + باك-إند
  مترجَّم) = نفس شكل الإنتاج لكن محتاج rebuild لكل دفعة. كتب قديم في التقرير (قسم «الواجهة القديمة
  على `:9000`») كان يقول «`:9000` يخدم ViteDev» و«لا تُشغّل `docker compose up` أثناء التطوير لأنه
  بيسرق 9000/6379» —
  الترتيب الحالي مختلف: compose اخد `9000` رسميًا وVite على `9100`، فأي كلام عن «منفذ مسروق» لازم
  يتأكد من `docker ps` + `netstat` مش من الذاكرة.
- **مزلق `curl` على `localhost`:** خادم التطوير مربوط **IPv4 فقط** — القياس:
  `http://127.0.0.1:9100/` = **200**، `http://localhost:9100/` = 200، لكن `http://[::1]:9100/` =
  **`000`**. ساعة `%{http_code} = 000` على `localhost` معناها **تحليل اسم مش خادم موقوف** (ده بالظبط
  اللي خلاني أكتب «`:9100` موقوف» في §46.2 وارتجعت). القاعدة: قياس أسطح التطوير على `127.0.0.1`
  دايمًا، و`--max-time 5`.
- **الـchunks بتاع الـlazy pages:** الصفحات متقسّمة، فأي تحقّق «الكلمة دي موجودة في الحزمة؟» على
  `index-*.js` بيفشل ظلمًا — دوّر على chunk الصفحة (`BillingEngine-*.js`). داخل Alpine نفّذ
  `grep -o '<مفتاح نصي>' … | wc -l`: النصوص العربية بتعدي زي ما هي (مش `\uXXXX`)، بس الأسماء
  المحلية (زي `srLabel`) بتمحي في الـminify فما تصلح دليل.
- **الأرقام العربية-هندية (§34هـ قرار قديم مش جديد):** `٠-٩` ممنوعة في أي نص مخلوط مع أرقام
  غربية/عملة. محليًا بعد §46.1: `BillingEngine-*.js` = **0**، لكن لسه في
  `GymAdminDashboard-*.js` (5) و`index-*.js` (5) — بند مفتوح، ما اتلمسش لحد ما المالك يقرر.
- **الفرق بين «كود قديم» و«بيانات مختلفة»:** قاعدة staging ≠ قاعدة المحلي. الأساسية على المحلي
  `price_yearly 3900 / list 5000 / discount_active t`، وعلى staging طبقتها اتمسحت — ده **حالة
  بيانات** مش عطل كود، ومتنصلحش بـpush.

---

## 7) المتبقي (مرتب بالأولوية)

1. **دفعة ألوان الصدفة (بموافقة المالك أولاً):** استبدال نصّي محكم في `src/**/*.tsx` —
   `bg-white`→`bg-card`، `text-gray-900`→`text-foreground`، `border-gray-100`→`border-hairline` —
   تحقّق بـ `tsc` + `build` وcommit مستقل. بعده دفعة الهندسة (`rounded-3xl`→`rounded-shell` وحذف
   `shadow-sm`) ثم إعادة تلوين `StatsGrid.colorMap` ومخططات ApexCharts بلغة Chalk & Brass.
   لم تُنفَّذ لأن النطاق المتفق عليه كان «توكنات + مكوّنات مشتركة» لا الـ60 صفحة.
2. **تبويبات `renderPlaceholder`** (فوترة/تقويم/موقع/تسويق/تقارير POS): الشكل موحّد والربط الخلفي ناقص — endpoints موجودة جزئياً (حصص/إحالات/مدفوعات).
3. **فجوات EN** في صفحات (SetupChecklist/TrainerDashboard/FinancialReports/LeadKanban/useGymDashboard) — عربية فقط حالياً.
4. **توحيد الأيقونات** لنظام واحد (13 ملفاً يخلط) + إزالة `Plus` المكرر مع `add`.
5. **`DataTable` المشتركة (بند 1ط):** خلاياها المخصصة والترتيب السيرف-side شغالين من دفعة
   2026-10-17 ومستخدَمين في 7 شاشات — الباقِي **51 ملف فيه `<table>`** لسه يدوي، والترحيل دفعات
   (المالية/الفواتير ثم التشغيل ثم الفريق) لأن كل دفعة محتاجة مقارنة whitelist ترتيب مع الـendpoint بتاعها.
6. **Staging (Railway):** ✅ يعمل (2026-10-12 §21) — backend+frontend Online؛ الدومينات `frontend-production-abdd`/`backend-production-9b567`؛ **منذ §29: الرفع تلقائي — كل `git push origin main` يبني وينشر عبر GitHub App + Deployment Triggers (فرع main)**؛ إعدادات إلزامية: backend rootDirectory فارغ + dockerfilePath `/server/Dockerfile.prod`، frontend rootDirectory `.` (تفاصيل §29). `deploy.sh`/«ارفع» لم عادا لازمين إلا كطوارئ. **ديون دمج الصفحات: منتهية — اكتملت السلسلة بـ §27** (الفريق §22، المتجر §23، الديون/الإعلانات §26، backup/migration → تبويبات الإعدادات §27).
6. **مؤجل بقرار:** ZATCA، استشارة قانونية، بوابات دفع حقيقية (نقدي/يدوي أولاً — راجع `PAYMENT_COLLECTION_STRATEGY.md`).
7. **ديون تقنية:** `routeConfigs/` قديم، `UIContext` غير مُmount، `superAdminUtils.tr` مكرر، تحذير حجم chunks في البناء.
   **من دفعة 2026-10-17 (الصالة الفاضية):** (أ) ✅ اتصلح — `deleteGym` بقى soft delete + تعطيل
   الحسابات، والمطلوب بعده لو المالك عايز حذفًا فعلي: **hard purge** ينقل `activity_logs` لجدول
   أرشيف قبل الحذف (الجدول الحالي append-only فالقيد `activity_logs_staff_user_id_fkey` بيمنع أي
   حذف جذري لأي صالة سجل مديرها دخول). (ب) توحيد حالة المصنع: `onboarding.ts`
   بيزرع `seedDefaultOffers` ومعالج المنصة لا، فاختار مسار واحد (إما البذرة الكتالوجية في
   الاتنين أو ولا واحد مع checklist يوضح إن العروض مطلوبة قبل أول عضوية).

## 8) الملفات المرجعية

`LOCAL_TESTING_REPORT.md` (سجل حي شامل) • `DOCKER_GUIDE.md` (Docker) • `PROJECT_ANALYSIS_DOCUMENTATION.md` (جرد النظام) • `ACTION_PLAN_PRODUCTION_READY.md` (الخطة) • `PAYMENT_COLLECTION_STRATEGY.md` (التحصيل) • `server/scripts/reset-local.ps1` (التصفير) • `server/scripts/remove_demo_seed_data.sql` (مسح بيانات الديمو المزروعة في صالة موجودة).

## 9) جلسات متوازية (3 جلسات) — البروتوكول والملكيات (2026-10-17)

الجلسات اتوزعت: **A = فرونت-إند** (`src/**`، Vite `127.0.0.1:9100`) • **B = باك-إند**
(`server/src/**` و`server/tests/**` وmigrations `081–099`، `ts-node-dev :4000`) • **C = الدمج
والتحقق الحيّ** (`docker-compose.yml` والـDockerfiles و`package.json` والوثايق وmigrations `100+`
و`:9000` والمتصفح). المالك وحده يأمر الدفع والنشر.

- **كل التفاصيل في `SESSIONS.md`** (خريطة الملكية، الملفات الساخنة، قواعد القاعدة الواحدة، طقس
  التسليم، ورسائل بدء جاهزة لكل جلسة). أي agent يبدأ شغل النهارده يقراه الأول.
- **القاعدة الأهم عمليًا:** الوثايق المشتركة **إضافة فقط في آخر الملف**، وأول `git log --oneline -3`
  قبل أي stage لأن HEAD بيتحرّك تحتك (3 مرات في يوم واحد). لو `git status` فيه تعديلات لجلسة
  تانية في نفس الملف، منع `git add <file>` → تتجزأ بـ`git diff` + `git apply --cached`.
- **إعادة بناء الصور مسئولية C وحدها:** الصورة بتُخبّز شجرة العمل، فأي ملفات غير مدفوعة لجلسة
  تانية بتدخل `:9000` — وده لازم يُعلن في كل مرة.

## 10) الأسرار داخل أعمدة JSON: الحارس المخزني ومزلق respawn (2026-10-17 — جلسة B، §48)

- **`col - 'key'` مش تنقية.** الاقتطاع في الطبقة الأولى فقط (بلوك 8 في `068_platform_contracts.sql`)
  سيب `admin.password` و`step_2_data.password` كما هما. وجود الـmigration في
  `schema_migrations`، أو وجود سطر تنقية في الكود، **دليل على النية مش على Effect** — اختبر
  بتعداد المفاتيح على كل الأعماق (`jsonb_object_keys` + lateral على القيم المتداخلة) وابدأ
  الـmigration من الصفر الشجري لا من المفتاح العلوي.
- **الحماية البنيائية غالبة الانضباط:** سيّب دالة `scrub_secret_json_keys(jsonb)` تكرارية +
  `BEFORE INSERT OR UPDATE OF onboarding_data` trigger يناديها = العمود بقى مستحيل يخزّن سر
  حتى من مسار كود جديد نسي الاقتطاع. ده نفس نمط `sync_gym_plan_columns` (079) وtrigger كود
  البطاقة (063): القاعدة تمنع، مش المراجع.
- **أي نمط مكتوب مرتين (JS + SQL) لازم يُنص عليه في الملفين** أنه توأم القرار — وإلا انفصلوا
  بعد أول تعديل. السجل هنا: `/pass|pwd|secret|token|otp|hash|credential|api[_-]?key|\bpin\b/i`
  مقابل `pass|pwd|…|api[_-]?key` + `\ypin\y`.
- **مزلق خادم التطوير (مقاس):** `ts-node-dev --respawn` بيعيد تشغيل `runMigrations()` مع أي حفظ
  في `src/` — فملف `081` اتطبّق في **نص كتابته** (08:20:59Z) بنسخته الجزئية. والقاعدة بتتبع
  **الاسم** مش البصمة، فملح الـmigration بعد التطبيق ما بيتعادش تشغيله. الطقس: اكتب الـmigration بآخر نص
  في كتابة واحدة؛ ولو اتغيّرت لاحقًا نفّذها يدويًا (`CREATE OR REPLACE` + `UPDATE … WHERE`
  محروسى = idempotent) وحدّث `md5_hash` يدويًا ليبقى السجل صادق.
- **Regex في Postgres:** `\b` **مش** حد كلمة (`'pin' ~* '\bpin\b'` = `f`)؛ الصحيح `\y`. و`\y`
  بيطابق سلوك `\b` بتاع JS على `_` (حرف كلمة في الاتنين)، فـ`pincode` و`step_pin` بيفضلوا.
- **آمان الشغل نفسه:** أسماء مفاتيح وعدد صفوف فقط، صفر قراءة/طباعة/تجزئة لأي قيمة؛ وأي probe
  على صف حقيقي = `BEGIN … ROLLBACK` بقيم dummy مسماة `ZZ B: …`، وقياس بقايا بعد الـROLLBACK.
- **المتبقي بعد كود أمني من النوع ده مش كود:** كلمة المرور اللي عاشت نصًا تحتاج تغيير من
  المالك، والنسخ القديمة (`pg_dump`) لسه فيها النص — التنقية الحيّة ما بتمسحش الأرشفة.

---

## 12) تسليم موجة 3 / دفعة 5 + قاعدة لوحة المراجعة الحيّة (2026-10-17 — جلسة A+C، §54)

> **ترقيم:** `HEAD` حاليًا بيقف عند §10؛ §11 (توحيد شجرتَي الاختبار على vitest — جلسة C) **في شجرة
> العمل وما اتعملهوش commit لسه**. فاللي بيقرا `git show HEAD:AGENT_HANDOVER.md` مش بيشوف §11،
> واللي بيقرا الملف في الديسك بيشوفه. متعملش commit لشغل جلسة C من غير ما الجلسة دي تطلبه.

**المتسلم:** آخر تلات ملفات حيّة في `super-admin` اتحوّلوا على `shared/Modal` — `PlatformAdmins.tsx`
(لوحة `lg` للإنشاء/التعديل + لوحة `md` لإجراءات الصف) · `PlatformMarketing.tsx` (لوحة `md`) ·
`TenantDirectory.tsx` (لوحة `md` للإجراءات + لوحة `sm` لتأكيد الحذف). **٥ لوحات في ٣ ملفات**.
الأرقام الكاملة في `LOCAL_TESTING_REPORT.md` §54، وسلسلة الأساس في `AUDIT_REPORT_2026-10-17.md` §ي٣.

**قاعدة جديدة ملزمة لكل دفعة (من شكوى المالك 20:0x — «لا أرى أي تحديث»):** تحديث الوثائق مش كفاية،
والشغل اللي بيتوثق في `LOCAL_TESTING_REPORT.md` بس بيبان للمالك كأنه ما اتعملش. كل دفعة لازم تلمس
الخمسة: (١) قسم `§NN` في `LOCAL_TESTING_REPORT.md` · (٢) سطر واحد في `TODO.md` · (٣) خانة الموجة في
`FRONTEND_MASTER_PLAN.md` · (٤) سطر إعادة القياس في `AUDIT_REPORT_2026-10-17.md` §10 ·
(٥) **`report-site/steps.json`** — اللوحة اللي على `http://127.0.0.1:8791` وبتتحدث كل 2.5 ثانية.
اللوحة دي **ملف غير متتبَّع في git** (`?? report-site/`) فلا تاريخ ليها ومحدش بياخد باله لو جمّدت؛
أي رقم فيها لازم يكون مقاس في نفس الساعة أو يتكتب صراحة «لم يُعَد تشغيله» مع مصدره.

**مزاليق أربع اتلمست في الدفعة دي (لو اتكرروا يضيّعوا نفس الساعتين):**
1. `server/.env` فيه `CORS_ORIGIN=http://localhost:9000`، فالطلبات من `:9100` بتموت عند الـpreflight
   و**CDP `Fetch` ما بيشوف الطلب أصلاً** (كروم بيردّ على `OPTIONS` داخليًا). أي probe على مسار كتابة
   لازم يحوّله لمسار same-origin (`/api/v1/...`) يخدعه الـproxy في `vite.config.ts`.
2. `src/services/api.ts:170/187/228` بيحوّل أي `401` لـ`window.location.href='/login'` — فيمحى
   الـDOM اللي بتقراه. الحل: `Fetch.failRequest('ConnectionRefused')` (فشل نقل بلا `error.response`)
   = نفس فرع `isError` في التطبيق **بلا redirect وبلا بايت خارج**.
3. `Fetch.enable({ urlPattern: '*' })` **قبل** الـnavigation بيحبس طلب المستند و`Page.navigate`
   بياخد timeout (15s). النمط لازم `*api/v1*`.
4. `getComputedStyle` على عقدة بعد `remove()` بيرجع نص فاضي — تنسخ قيم التوكن قبل ما تفصل العقدة.
   و`window.scrollTo` شغال على `overflow:hidden`، فقفل السكرول يتقاس بـ`mouseWheel` موثوق بس.

**عيب قشرة معلَن ومقيس (مش إصلاحه في نطاق موجة 3):** `disableDismiss` بيحرس `onOpenChange` بس
(`Modal.tsx:142-144`)، فأزرار الـfooter اللي بتنادي `closeModal()` مباشرة — «إلغاء» — **بتقفل اللوحة
والطلب لسه معلّق**. مقاس: Escape/scrim/X مرفوضة وكلها في نفس النافذة، والـCancel بيقفل. السلوك ده
مورَّث من §49/§51/§52/§53 (كل الدفعة السابقة اتقاست بنفس العقد)، وأي إصلاح ليه يلمس **كل** مودالات
المشروع فبوابة مالك.

**المتبقي المحسوب بعد §54:** موجة 3 = `gym-admin` **19 ملفًا / 24 موضعًا** + `AddSubscription`
(مستنية `D9`) + `AddGymModal` (كود ميت، موجة 1 / `D6`)؛ `src/pages` **20/25** و`src/**` **25/31**.
**معلّق على المالك:** `push` (**D7** = 19 عملة بعد commit الدفعة) · إعادة بناء `:9000` (**D8**) ·
عرض/اسم زرار X في `shadcn/dialog.tsx:66-67` · دفعة `htmlFor`/`id` · رقائق الأيام لـ48px ·
`D1`/`D2`/`D6` · استعادة صالة نشطة محليًا عشان التحقق يدخل من الراوتر الحقيقي · عمل `commit`
لـ`report-site/` ولا لأ · إصلاح موخيبايت `PlatformMarketing.tsx` (نص ظاهر للمستخدم).
**ما اتعملش في الجلسة دي:** ولا `push`، ولا deploy، ولا لمس لـ`:9000`، ولا mock في أي ملف منتج.


## 14) تسليم موجة 3 / دفعة 7: الرواتب والحركات والتقويم على `shared/Modal` (2026-10-17 — جلسة A+C، §57)

- **الملفات الثلاثة = ٦ لوحات** (كلها مقاسة حيًّا على `:9100` بجلسة صالة «حامد جيم» الرملية):
  `gym-admin/AdjustmentsPage.tsx` → `md` «حركة جديدة» **448×385** + `sm` «تسجيل سداد» **384×217** ·
  `gym-admin/PayrollPage.tsx` → `sm` «إنشاء كشف» **384×241** + `sm` «صرف الرواتب» **384×242** ·
  `gym-admin/GymCalendar.tsx` → `ClassModal` `lg` **512×600** (إنشاء) و**512×632** (تعديل).
  التكافؤ مقاس في الستة: `centreDelta [0,0]` · `radius 10px` · `border 1px rgb(239,233,221)` ·
  `bg rgb(255,253,249)` · `shadow-none` · حشو 24px · `gap 16px` · `dir=rtl` من الخصّة ·
  `aria-hidden="true"` على `#root` (بلا `aria-modal`) · `overflow:hidden` على `body` · أزرار الفوتر **48px**.
- **`aria-describedby` مقاس في حالتي وجوده وغيابه:** «صرف الرواتب» هو الوحيد اللي بيمرّر `description`
  فطلع `aria-describedby="radix-:r1j:"` **وحلّ فعليًا** على النص («يولّد حركة خزنة واحدة بإجمالي الصافي.»)،
  والخمسة الباقين `aria-describedby=null` مقصود. أي فحص آلي لاحق يفتكر إن الوصف لازم موجود = غلط.
- **القفل:** مسارات **4/4** (Escape · X · scrim ماوس · «إلغاء») في كل لوحة وهي فارغة، و**4/4 مرفوضة** داخل
  **pending حقيقي** في ثلاث لوحات (حبس `POST /api/hr/adjustments` و`POST /api/hr/payroll/generate` و`POST /api/classes`)
  مع الزرارين `disabled` ونص «جارٍ الإضافة… / جارٍ الإنشاء… / جارٍ الحفظ…». استرجاع الفوكس للفاتح **بالاسم**
  `same:true` في أربع لوحات («إضافة» · «صرف الرواتب» · «سداد» · «إضافة حصة»).
- **فارق سلوكي معلَن وما اتوحّدش:** `PayrollPage` و`AdjustmentsPage` بيقفلوا الـCTA بـ`disabled` لحد ما تتعدّى
  القواعد (مقاس: فاضي ⇒ معطّل · مبلغ `77` بس ⇒ لسه معطّل · موظف ⇒ مفعّل)، بينما `ClassModal` بيسيب «حفظ» مفعّل
  ويطلع **توست عند الضغط** (٤ رسائل مقاسة: «أدخل اسم الحصة» · «اختر المدرب» · «وقت النهاية يجب أن يكون بعد البداية» ·
  «السعة غير صحيحة») بـ**صفر طلب خارج**. التوحيد متعمَّد وموحَّدش لأنه تغيير منطق تحقق مش تصفية صدفة — بوابة مالك.
- **الكتابة حقيقية وممسوحة:** حركة `POST ⇒ 201` ثم `DELETE /api/hr/adjustments/709061f4… ⇒ 200` وتوست «تم الحذف» ·
  كشف 2031-03 `POST ⇒ 201` (شارة «مسودة») ثم `DELETE /api/hr/payroll/bb0bb9fa… ⇒ 200` والحالة الفاضية ترجع ·
  حصة `POST /api/classes ⇒ 201` → `PUT ⇒ 200` إلغاء (الحبة عليها شطب و`opacity .5`) → `PUT ⇒ 200` «إرجاع نشطة» (`opacity 1`)
  → **حذف بخطوتين** («حذف» يسلّح بلا طلب، ثم «تأكيد الحذف» ⇒ `DELETE ⇒ 200`، الحبة اتشالت وزرار «+» رجعت 7) ·
  **مدرب مؤقت** `POST /api/staff ⇒ 201` (الصالة كان فيها صفر مدربين نشطين، فالفريق ما كانش هيتعبّى) ثم `DELETE ⇒ 204`
  والموظفين رجعت 1. **صفر فضلات** عدا سطر واحد **معلن**: run `af0a61ea…` بشهر `2030-01` بحالة `approved` و`total_net 0`
  و`paid_at null` (لازم كان عشان يفتح زرار «صرف الرواتب») — الـSQL بتنظيفه مكتوب في §57 **وما اتنفّذش**
  (كتابة مباشرة على القاعدة خارج مسار المنتج = قرار المالك). **حارس القاعدة مقاس:** إعادة توليد شهر معتمد ⇒ `409`.
- **خمسة دروس منهجية بيسروا على أي قياس `gym-admin` جاي:**
  1. **إعادة التركيب بـ`pushState` ≠ إعادة جلب.** `['calendar-staff']` فضل كاشي فاضي (٠ مدربين) فالـ`<select>`
     ما اتعملش والمقروب انفجر. الصحيح **تحميل مستند كامل** (`Page.navigate`) لأن الجلسة HttpOnly cookie + `/auth/me`
     فالتحميل من جديد **بيصحّح §56** اللي كان بيقول «`AuthContext` في الذاكرة بس فممنوع reload».
     و`window.__coachId` بيروح مع التحميل فأُعيد اشتقاقه داخل الصفحة بعد كل `goto`.
  2. **`window.confirm` الحقيقي بيهبّط الصفحة و`Page.handleJavaScriptDialog{accept}` ما بيوصلهاش**، فالحذف كان بيرجع
     «صفر DELETE» وبيبان كعيب منتج. الحل المقاس: `window.confirm = () => true` (بوابة الحوار فقط، مفيش تأليف رد ولا بيانات) —
     وبعدها الاتنين اتمسحوا ⇒ **مفيش عيب حذف** لا في الحركة ولا في المسودة.
  3. **سجل الشبكة لازم يخزّن `requestMethod`** (`p.requestMethod`)؛ بدونه `GET …/adjustments?month=` و`DELETE …/adjustments/:id`
     بيبدوا سطرًا واحدًا فـ«الحذف» بيتحسب وهميًا.
  4. **مصفوفة القفل لازم تتسلّم بحالة استمارة صحيحة:** في الطلق التاني فضل وقت النهاية `19:00` قبل البداية `20:00`،
     فالتحقق منع الـmutation و`disableDismiss` ما اشتغلش والـEscape قفل — و«الفشل» اللي ظهر كان artifact بتاعي مش منتج.
  5. **`[...querySelectorAll(OPEN + ' input[type="time"]')][0]` مش `:nth-of-type(1)`** — الانتقائي الغلط بيرجع عنصرًا مختلفًا
     عن أول حقل وقت في اللوحة.
- **فجوات مقاسة ومعلنة وما اتصلحتش (بوابات مالك / بنود قائمة):** زرار X بتاع القشرة **26×26** عند 1280
  (و`26×48` عند 390) + `aria-label="إغلاق"` عربي حرفي في `src/components/shadcn/dialog.tsx:66` — إصلاحه يمسّ
  كل مودالات الموجة المتبقية (**17 موضعًا في `src/pages`**)؛ `labelFor` = **[]** في الاستمارات التلاتة
  (مفيش `htmlFor` على أي label، و`PayrollPage` بلا labels أصلًا) فمفيش ارتباط برمجي للتسميات؛ زرار حذف الصف في
  `AdjustmentsPage` **36×36** تحت §34و؛ الألوان الحرفية (`bg-orange-500` · `bg-gray-900`) سايبا لبند 11 (موجة 5)؛
  و`npm run lint` لسه **غير قابل للتشغيل** (ESLint 10.13 ما بلاقيش `eslint.config.*`) — حالة قائمة في المستودع من قبل الدفعة.
- **المؤشر بعد الدفعة (بنفس أمر الخطة المرجعي):** `src/pages` **14 ملفًا / 17 موضعًا** (كان 17/22) و`src/**` **19 / 23**.
  المتبقي: `gym-admin` **13 ملفًا / 16 موضعًا** = 12 صفحة (CashboxShifts · Contracts · Debts · Leaves · MemberProfileView ·
  Payments · PrivateTraining · Sports · SubscriptionManagement · SubscriptionsPage · TrainerAttendance · Trainers)
  + `subscriptions/AddSubscription` (`D9`، شاشة ملء شاشة) + `super-admin/AddGymModal` (`D6`، كود ميت على قائمة «ما يتلمسش»).
- **الأرقام والبوابات:** `npx tsc --noEmit` = **0** · `npm run build` ✓ **6.59s** و`index-mzQx28JT.js` **908,949 بايت**
  (+2 عن حزمة دفعة 6 — والقياس على شجرة العمل اللي فيها تعديلات جلسات تانية غير committة فمش دليل على `HEAD`) ·
  غير المدفوع **20** قبل commit الدفعة (**D7 لسه مستني أمرك**) · ولا `push` ولا deploy ولا إعادة بناء `:9000` ·
  مقروبات الدفعة كلها خارج المستودع (`%TEMP%/gymcore-a11y/m3d7/`) و`git ls-files scratch` = 0 وكروم اتقفل بـ`Browser.close`.
- **قاعدة §12 الخماسية محترمة في الدفعة دي:** `LOCAL_TESTING_REPORT.md` §57 · سطر `TODO.md` · خانة «الحالة بعد دفعة 7»
  في `FRONTEND_MASTER_PLAN.md` · §ي٥ في `AUDIT_REPORT_2026-10-17.md` · تجديد `report-site/steps.json` بالقيم المقاسة.
  **ومزلق رقم البنود تكرّر:** الجلسة دي كانت هتكتب §56 فسبقتها جلسة B بـ§55 و`## 13)` فوقعتها لـ§57 و`## 14)` —
  `grep -n "^## " AGENT_HANDOVER.md` + عدّاد `§` قبل اختيار أي رقم.

## 15) تسليم موجة 3 / دفعة 8: المدفوعات والديون والإجازات على `shared/Modal` (2026-10-17 — جلسة A+C، §58)

- **الملفات الثلاثة = ٤ لوحات `md`** (كلها مقاسة حيًّا على `:9110` بجلسة صالة «حامد جيم» الرملية بدور `manager`):
  `gym-admin/PaymentsPage.tsx` → «تسجيل دفعة» **448×415** · `gym-admin/DebtsPage.tsx` → «إضافة دين» **448×443**
  + «سداد الدين» **448×503** · `gym-admin/LeavesPage.tsx` → «طلب إجازة» **448×329** (كانت بلوك `{showForm && …}`
  داخل الصفحة نفسها). التكافؤ مقاس في الأربعة: `centreDelta [0,0]` · `radius 10px` · `border 1px rgb(239,233,221)` ·
  `bg rgb(255,253,249)` · `shadow-none` · حشو 24px · `gap 16px` · `dir=rtl` من الخصّة · `aria-hidden="true"` على
  `#root` (بلا `aria-modal` — `null`) · `overflow:hidden` على `body` · `overflowY auto` · أزرار الفوتر **48px** ·
  حقول **44px** (والـtextarea 66px) · و`aria-describedby = null` في **الأربعة** لأنها ما بتمرّرش `description`.
- **⚠️ قاعدة قياس جديدة قبل أي رقم مقشرة:** اللوحة بتفتح بـ`animate-in … zoom-in-95`، فالقياس **فور الفتح**
  بيرجع **0.95 من المقاس المستقر**. مقاس في نفس اللحظة: `getComputedStyle().width = 448px` و`transform =
  matrix3d(0.95,…)` و`getBoundingClientRect().width = 426` — نفس المعامل على الموبايل (340 ⇒ 358)، الفوتر
  (46 ⇒ 48)، الحقول (42 ⇒ 44)، وX (25 ⇒ 26). **اللازم:** استنى settle ‏~900ms قبل الـprobe، أو أعلن الحالة
  صراحة. أرقام §56/§57 ما اتأثرتش لأنها اتقاست بعد wait.
- **سجل الشبكة:** `Network.responseReceived.requestMethod` طلع **`undefined`** في نسخة كروم دي (عكس §57) —
  الصحيح ربط `requestWillBeSent` (فيه `method` + `postData`) مع `responseReceived` على نفس **`requestId`**؛
  وده اللي سمح إثبات إن الطلبات المحبوسة **ما وصلتش السيرفر** (`s: null`).
- **`disableDismiss` متقاس بأداة أفضل:** بدل حبس الطلب ثم تحريره (`continueRequest`)، الطلب اتحبس بـ
  `Fetch.requestPaused` ثم **أُجهض بـ`Fetch.failRequest({errorReason:'Aborted'})`** ⇒ مسار pending كامل
  (٤/٤ رفض: Escape · X · scrim · «إلغاء» + الزرار `disabled` + نص «جارٍ …») **وصفر كتابة**. وبعد الإفلات:
  اللوحة فضلت مفتوحة، كل القيم محفوظة، والتوست الصادق «فشل تسجيل الدفعة / الدين / السداد».
  ومقروب نصّ الـCTA بيرجع `null` وقت الـpending (النص بيتبدّل) — القياس بحالة الزر، والدرس ده تالت مرة.
- **القفل 16/16 في السكون** (٤ مسارات × ٤ لوحات) و**استرجاع الفوكس 4/4 `same:true`** — بما فيها فاتح «سداد
  الدين» وهو **زر أيقونة نصّه فاضي** (`aria-label` فقط)، والفوكس بعد كتابة الدين رجع على «إضافة دين».
- **الكتابة كانت مفروضة بحالة الصالة، ومحصورة:** «حامد جيم» كان **0 أعضاء / 0 ديون** ⇒ قوائم الأعضاء فضلت
  فاضية ومسار النجاح مقفول. اتعمل: عضو اختبار `POST /api/members ⇒ 201` (`81b9d233…`، العقد يطلب
  `full_name` + `phone_number ≥ 7`) · دين `POST /api/finance/debts ⇒ 201` من اللوحة المحوَّلة (0⇒1، قفل 222ms) ·
  إجازة `POST /api/hr/leaves ⇒ 201` (1⇒2، قفل 264ms) و**`POST …/leaves/8233de04…/decision ⇒ 200`** رفضًا من زر
  الصف · **والمدفوعات صفر** (الجرد بعد الانتهاء: `payments: 0`). **البقايا التلاتة معلنة** ومفيش مسار حذف لها
  في المنتج (`DELETE` غير موجود للمدفوعات/الديون/الإجازات) ⇒ SQL §58 **ما اتنفّذش** (قرار المالك)، مع بقايا §57
  (`af0a61ea…`).
- **معلن — تغييران في الصدفة مش في المقاس:** لوحة «طلب إجازة» **ما كانلهاش زر إلغاء** أصلًا فاتها اتّضاف
  (`min-h-[48px]` + يتعطّل وقت `isPending`)؛ و«جاري الحفظ…» في `PaymentsPage` اتكتبت «جارٍ الحفظ…» لتطابق
  بقية اللوحات. الحقول نفسها ما اتلمستش (مطابقة حرفية).
- **عيوب منتج من الشاشات دي اتحوّلت لبوابات (ما اتصلحتش):** `LeavesPage.tsx:179-180` يطبع `start_date`/`end_date`
  **خام** ⇒ نص الصف الحيّ `2026-12-04T22:00:00.000Z` (مخالف §34هـ، ومُدخَل 2026-12-05 بيطلع يوم قبله لأن
  السيرفر بيرجّع `timestamptz`) · عنوان العمود `⋯` (`:159`) بلا تسمية لقارئ الشاشة · أزرار اعتماد/رفض الصفوف
  `w-9 h-9` = **36×36** · X القشرة **26px** + `aria-label="إغلاق"` عربي حرفي (`shadcn/dialog.tsx:66`) ·
  `labelFor` كله `false` في «تسجيل دفعة» (4) و«سداد الدين» (3) · الألوان الحرفية سايبا لبند 11 ·
  و**انقسام نمط التحقق** بقى ٨ لوحات بـ`disabled` مقابل `ClassModal` بالنقر-ثم-التوست (بوابة موجة 6-7).
- **المؤشر بعد الدفعة:** `src/pages` **11 ملفًا / 13 موضعًا** (كان 14/17) و`src/**` **16 / 19**. المتبقي:
  `gym-admin` **10 ملفات / 12 موضعًا** (CashboxShifts · Contracts ×2 · MemberProfileView ×2 · PrivateTraining ·
  Sports · SubscriptionManagement · SubscriptionsPage · TrainerAttendance · Trainers + `subscriptions/AddSubscription`
  = `D9`) + `super-admin/AddGymModal` (`D6`) + مكوّنات `PwaInstallPrompts` / `QuickActionCenter` / `Sidebar`
  (٣ مواضع)، ومواضع `shared/Modal` + `shadcn/dialog.tsx` هي القشرة نفسها ومش مستهدفة. **٩ دفعات متحقق عليها حيًا.**
- **الأرقام والبوابات:** `npx tsc --noEmit` = **0** · `npm run build` ✓ **6.25s** · `index-MbNEx-_S.js`
  **908,953 بايت** (+4 عن `index-mzQx28JT.js`) · حزم الصفحات `PaymentsPage` 12.16 / `DebtsPage` 19.25 /
  `LeavesPage` 10.02 / `Modal` 12.66 kB · غير المدفوع **21** قبل commit الدفعة (**D7 لسه مستني أمرك**) ·
  ولا `push` ولا deploy ولا إعادة بناء `:9000` · مقروبات الدفعة خارج المستودع (`%TEMP%/gymcore-a11y/m3d8/`)
  و`git ls-files scratch` = 0 · كروم headless بتقفل بالـPID المطابق لبروفيلها بس (مفيش `taskkill /IM chrome.exe`).
- **الملفات المشتركة والـstaging:** الدفعة اتstageed بـ`git show HEAD:<doc>` + بلوك الجلسة بـ`hash-object`/
  `update-index` (ملفات `TODO.md` و`LOCAL_TESTING_REPORT.md` و`AGENT_HANDOVER.md` عليها شغل جلسات تانية غير
  committة: §50 و§55 و`## 11)` و`## 13)` — متسابّة زي ما هي). والصفحة `src/context/ToastContext.tsx` و`routes/index.tsx`
  و`SettingsPage.tsx` لسه شغل جلسة تانية **وما اتلمستش**.
- **أمان:** الدخول اتمرّر بمتغيرات بيئة بس (`GYM_USER`/`GYM_PASS`) ولا مرة اتكتب في ملف بالريبو، والمقروب ما
  طبعش جسم تسجيل الدخول. كلمة مرور الصالة الرملية و`JWT_SECRET` **اتبدّلوا في الشات** ⇒ التدوير على المالك.


---

## 16) تسليم موجة 3 / دفعة 9: الرياضات والبرايفت والمدربون على `shared/Modal` (2026-10-17 — جلسة A+C، §59)

- **الملفات الثلاثة = ٣ لوحات** (مقاسة حيًّا على `http://127.0.0.1:9110` بجلسة صالة «حامد جيم» الرملية؛
  مقروبات الدفعة `%TEMP%/gymcore-a11y/m3d9/` و`git ls-files scratch` = 0):
  `gym-admin/SportsPage.tsx` → «حذف الرياضة» `md` **448×193** (مع `disableDismiss={remove.isPending}` وسطر
  التحذير المورّث جوه) · `gym-admin/PrivateTrainingPage.tsx` → `PtReportModal` `lg` **512×128** **بلا `footer`**
  · `gym-admin/TrainersPage.tsx` → «إضافة مدرب» `md` **448×605** بحارس `formValid = الاسم>1 && بريد && كلمة
  مرور ≥6`. التكافؤ مقاس: `centreDelta [0,0]` · `radius 10px` · `border 1px rgb(239,233,221)` ·
  `bg rgb(255,253,249)` · `shadow-none` · حشو 24px · `gap 16px` · `dir=rtl` من الخصّة · `aria-hidden="true"`
  على `#root` (`aria-modal = null`) · `overflow:hidden` على `body` · `overflowY auto` · فوتر **48px** ·
  `aria-describedby = null` في **الثلاثة**.
- **قانون §58 اتقاس على نفس اللوحة (عيّنة توأم):** «حذف الرياضة» فور الفتح **426×183** مع
  `transform: matrix3d(0.95,…)` و`getComputedStyle().width = 448px` في **نفس اللحظة** ⇒ بعد 950ms
  **448×193**. أي رقم «اللوحة مش بمقاس العقد» = قياس بدري، مش عيب صدفة.
- **أول لوحة في الموجة بتقفل 3/3 مش 4/4 — والسبب في شكل المنتج:** «تقارير البرايفت» **لوحة عرض للقراءات
  بس** فمفيش فيها زر إلغاء (`closeAffordance = {buttonsInside: ["إغلاق"], footerDiv: 0}`)؛ escape · X ·
  scrim كلهم شغالين. **مفتوح للمالك:** زر إغلاق صريح في لوحات العرض (مش مطلوب في الدفعة دي عشان ما تتحولش
  إعادة تصميم).
- **`disableDismiss` على مسارين مختلفين، والاتنين بـ`Fetch.failRequest('Aborted')` ⇒ `s: null`:**
  `DELETE /api/sports/:id` و`POST /api/staff` — **4/4 مرفوض** في كل واحدة (escape · X · scrim · «إلغاء»)،
  اللوحة `data-state="open"`، القيم محفوظة، والتوست «فشل الحذف» / «فشل إضافة المدرب». **توثيق الفوتر في
  الوضعين** (اللي النسخ السابقة كانت بتقوله من غير ما تقربه): idle `[{إلغاء,false,48},{تأكيد الحذف,false,48}]`
  ⇒ pending `[{إلغاء,true,48},{جارٍ الحذف…,true,48}]`؛ و«إضافة مدرب» idle بـ**CTA معطّل** (الحارس) ⇒
  pending `[{إلغاء,true},{جارٍ الإضافة…,true}]`. **نصّ الـCTA بيرجع `null` وقت pending** — القياس بحالة الزر.
- **أول مسار رفض جاي من السيرفر فعليًا (مش من المتصفح ولا من الحبس):** `DELETE /api/sports/28874914…` على
  «جيم» ⇒ **409** مع سطر التحذير جوّه اللوحة وتوست «لا يمكن الحذف — مستخدمة في 4 باقة و0 اشتراك.»
  و`untouched: true`. ده يكمّل توثيق العقد: `SportsPage` بيعرض الاستخدام **قبل** ما يبعث، والسيرفر بيرفض
  تاني — طبقتين شغالين.
- **الكتابة الحقيقية ومسحها (صفر فضلات):** `POST /api/sports ⇒ 201` (صفوف 7⇒8، قفل 216ms) → `DELETE ⇒ 200`
  (8⇒7، قفل **218ms**، والفوكس رجع لـ`<body>` — **سلوك سليم** لأن الصف الفاتح نفسه اتحذف، و`Modal`
  بيحرس نفسه بـ`document.contains(opener)`) · `POST /api/staff ⇒ 201` (قفل 206ms، فوكس على «إضافة مدرب») →
  `DELETE /api/staff/:id ⇒ 204` (الفريق رجع **1**) · جرد `brp1059Anywhere {sports: 0, staff: 0}` والرياضات
  **7** بأسمائها الأصلية. **كلمة مرور المدرب الموقتة اتولّدت في الذاكرة بـ`node:crypto`** و`"password":"…"`
  اتمسح من أي جسم طلب متسجّل قبل الكتابة في الوثائق.
- **§34و على 390:** «حذف الرياضة» **358×245** · «تقارير البرايفت» **358×120** · «إضافة مدرب» **358×707** —
  `left 16` و`centreDeltaX 0` و`scrollW 390` (بلا overflow) و**`under44 = []`** في الثلاثة (أزرار 48 ·
  6 حقول **48**). طول «حذف الرياضة» بيتبدّل (245/293) حسب ظهور سطر التحذير — مش اختلاف قياس.
- **عيوب منتج/وصول من الشاشات دي (معلنة وما اتصلحتش):** أزرار إجراءات صف الرياضة **`w-10 min-h-[40px]` =
  40px** (تحت حد §34و) و**زر الحذف بلا حالة تعطيل** حتى مع رياضة مستخدمة (الرفض من السيرفر بعد الضغط) ·
  فاتح لوحة الحذف **زر أيقونة بلا نص** (`openerBefore: "BUTTON:"`، `title="حذف"` فقط) ⇒ الفوكس سليم
  والاسم المتاح غايب · `labelFor = [false × 6]` في «إضافة مدرب» · X القشرة **26px** + `aria-label="إغلاق"`
  عربي (`shadcn/dialog.tsx:66`) · ألوان حرفية (بند 11 / موجة 5) · جدول البرايفت **0 صفوف** في الصالة
  الرملية ⇒ حشو الجدول **ما اتقستش**.
- **٣ حقائق عن الأداة (توفّر وقت اللي بعده):** (١) مطابقة صفوف `SportsPage` بالعمود بتفشل — `td[2]` هو
  `plan_count` والاسم في `td[1]` **مع أيقونة material-symbols** («favorite كارديو») ⇒ طابق على نص الصف كله
  واطبع نص الاستثناء مش الـstack؛ (٢) مقياس التوست في **مسار الكتابة** بيرجع رابط السايدبار
  («العملاء المحتملون») ⇒ نصوص التوست المعتمدة تُقرأ من مسار الرفض/الإلغاء بس؛ (٣) `POST /auth/refresh ⇒ 400`
  (×2) و`POST /platform/auth/login ⇒ 401` قبل `/auth/login ⇒ 200` **مقصود** في `AdminLoginPage.tsx:166`
  (تجربة بوابة المنصة أولًا) — يفسّر 401 في أي أثر شبكة سابق.
- **المؤشر بعد الدفعة:** `src/pages` **8 ملفات / 10 مواضع** (كان 11/13) و`src/**` **13 / 16** (كان 16/19،
  والأساس يشمل القشرة) — المتبقي `gym-admin` **6 ملفات / 8 مواضع** + `AddSubscription` (`D9`) +
  `AddGymModal` (`D6`) + 3 مكوّنات ⇒ **10 دفعات متحقق عليها حيًا**.
- **الأرقام والبوابات:** `npx tsc --noEmit` = **0** · `npm run build` ✓ **17.20s** · `index-C72UHviE.js`
  **908,959 بايت** (+6 عن §58 — **على شجرة عمل مشتركة** فيها شغل جلسات تانية، فالفارق مش منسوب للدفعة
  وحدها) · حزم `SportsPage` 11,691 / `TrainersPage` 11,942 / `PrivateTrainingPage` 9,650 / `Modal` 12,667 B ·
  `grep -c "fixed inset-0"` في الملفات الثلاثة = **0** · غير المدفوع **22** قبل commit الدفعة (**D7 لسه
  مستني أمرك**) · ولا `push` ولا deploy ولا إعادة بناء `:9000`.
- **الملفات المشتركة والـstaging:** زي بروتوكول §58 — `git show HEAD:<doc>` + بلوك الجلسة بـ`hash-object`/
  `update-index` للملفات المشتركة في المستودع، وشغل الجلسات التانية (`§50` و`§55` و`## 11)` و`## 13)` في
  الوثائق، و`src/context/ToastContext.tsx` و`src/routes/index.tsx` و`src/pages/settings/SettingsPage.tsx` في
  الشجرة) **متساب زي ما هو وما اتstagedش**.
- **الدفعة الجاية (10) — المرشح والمعلومة المسبقة:** `gym-admin/ContractsPage.tsx` (لوحتان `max-w-md`:
  «عقد جديد» = select + 4 inputs + زرار CTA واحد بعرض كامل **بلا زر إلغاء** ⇒ هيتّضاف، و«عرض» عنوانها
  `font-mono dir="ltr"` = رقم العقد ⇒ `title` نصّي مش عربي) + `gym-admin/MemberProfileView.tsx` (لوحتان:
  «مكالمة» `max-w-xs` ⇒ `sm` = **اتساع +64px معلَن**، و«تعديل بيانات» `max-w-lg` ⇒ `lg` بفوتر من
  `<Button variant="outline|primary" fullWidth>` الموجود **ينقل لـ`footer` الصدفة**). بعدها يفضل
  `SubscriptionManagement` · `SubscriptionsPage` · `TrainerAttendancePage` · `CashboxShiftsPage` + `D9`/`D6`.

