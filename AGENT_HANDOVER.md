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
1ط. **الجداول (من دفعة 2026-10-17):** أي شبكة صفوف في `src/pages` = `components/ui/DataTable.tsx` (فوق `@tanstack/react-table`، معتمَد بـ`@tanstack/react-table@8.21.3`) — **ممنوع** كتابة `<thead>`/`<th className="text-right …">` يدوي في صفحة جديدة. العقد: العمود `{ key|value, label|header, cell, sortable, sortDescFirst, numeric, align, width }`، والشكل القديم `{key,label}` لسه مقبول (صفحتا `OtaUpdateManager`/`SmsGateway` تعمل به). قواعد إلزامية: (أ) **الترتيب opt-in ويُطابق الـendpoint** — `/api/members` عنده whitelist (`member_name|created_at|end_date|remaining|visits|last_visit`) فتُرتَّب الأعمدة الموجودة فيها فقط مع `manualSorting` + `sorting`/`onSortingChange`، و`/api/finance/sales` لا يقبل `sort` فجدوله بلا ترتيب نهائيًا (الترتيب المحلي لصفحة محمّلة = ادعاء غير صحيح)؛ (ب) `enableSortingRemoval:false` وترتيب عمود واحد لأن عقد السيرفر `sort=<key>&order=asc|desc`؛ (ج) المحاذاة منطقية `text-start/text-end` وليست `text-right` (الأخيرة نهاية في الإنجليزي)، والمبالغ `numeric`؛ (د) الجدول داخل كارت/مودال يمرّر `bare` (لا يُُلغى الإطار بـclassName لأن `tailwind-merge` لا يعرف `rounded-shell`)؛ (هـ) جسم قابل للسكرول بـ`maxHeight` (الرأس يبقى `sticky`)، و`footer` لسطر الترقيم داخل نفس الصدفة، و`empty` لحالة الفاضي، والقيمة المفقودة تظهر `—` لا فراغ. الصف الفعلي 45px يساوي `SkeletonTable` سطر بسطر (متقاس على عرض 900px) — أي تغيير في حشو `DataTable` يكسر مطابقة السكيلتون. تفصيل الأدلة في `LOCAL_TESTING_REPORT.md` §المرحلة 5.
2. **التحقق:** `npx tsc --noEmit` (أمامي وخلفي، `noUnusedLocals/Parameters` مفعّلة) + `npm run build` بعد أي تعديل واجهة.
3. **i18n:** مفاتيح `ar.json/en.json` (تكافؤ 100% — حافظ عليه) للقوائم (`nav.*`) والهيدر واللوحات؛ بقية الصفحات ternaries داخلية (`isRtl ? ar : en`) — لا تخلط النظامين في ملف واحد بلا داعٍ. الافتراضي `ar` + `ar-EG` للتواريخ + `EGP/ج.م`.
4. **الأيقونات:** محاكي `src/lib/lucide-react.ts` حُذف نهائياً (2026-10-16) ولا يُرجَع أبداً — أي استيراد من `lucide-react` اليوم يذهب للحزمة الحقيقية (مثبّتة الآن لأن مكوّنات Aceternity مكتوبة عليها). التوزيع الحالي: الصفحات الـ63 تستورد `@phosphor-icons/react` مباشرة، والمكوّنات المشتركة/المنسوخة من Aceternity تستخدم `lucide-react`، وMaterial Symbols باقٍ في الخطوط القديمة. لا مكتبة رابعة، وأي اسم phosphor متبقٍّ كاسم محلي (`CheckCircle as CheckCircle2`, `Warning as AlertTriangle`, `List as Menu`, `Pencil as Edit3`, `Gear as Settings`, `Envelope as Mail`, `EyeSlash as EyeOff`, `Barbell as Dumbbell`) مقصود لتقليل الدفوع — تحويلها لعملية لاحقة.
5. **السيد:** أي جدول جديد يُغذّى في `seedEngagement.ts` (إضافي) لا في `seedTenGyms.ts` (تأسيسي). راجع قيود CHECK/FK من `information_schema` قبل الإدخال (الأخطاء السابقة كلها من هذا النوع).
6. **التوثيق:** أي إصلاح/قرار يُضاف لـ `LOCAL_TESTING_REPORT.md` (سجل حي) + هذا الملف عند تغيّر الإجراءات.

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
- **Railway staging (2026-10-12):** النشر بـ `railway up` من الجذر (سياق build = repo root).
  بروكسي Railway يوصل للـ replica على **منفذ 8080** إن لم يُضبط Application Port — nginx يlisten على 80+8080 معاً. بعد كل redeploy للـ backend **أعد نشر الـ frontend** (nginx يظلّم DNS لـ `backend.railway.internal` عند الإقلاع وإلا يجمّد البروكسي) — مع الرفع التلقائي (§29) كل push يبني الخدمةين معاً فتنتهي هذه المشكلة جانبياً؛ تبقى عند إعادة نشر backend وحده يدوياً. `railway service restart` يتعطّل أحياناً — `railway up -d` أضمن.

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
5. **`DataTable` المشتركة** لا تدعم خلايا مخصصة — توسيعها أو توثيق الاستثناء.
6. **Staging (Railway):** ✅ يعمل (2026-10-12 §21) — backend+frontend Online؛ الدومينات `frontend-production-abdd`/`backend-production-9b567`؛ **منذ §29: الرفع تلقائي — كل `git push origin main` يبني وينشر عبر GitHub App + Deployment Triggers (فرع main)**؛ إعدادات إلزامية: backend rootDirectory فارغ + dockerfilePath `/server/Dockerfile.prod`، frontend rootDirectory `.` (تفاصيل §29). `deploy.sh`/«ارفع» لم عادا لازمين إلا كطوارئ. **ديون دمج الصفحات: منتهية — اكتملت السلسلة بـ §27** (الفريق §22، المتجر §23، الديون/الإعلانات §26، backup/migration → تبويبات الإعدادات §27).
6. **مؤجل بقرار:** ZATCA، استشارة قانونية، بوابات دفع حقيقية (نقدي/يدوي أولاً — راجع `PAYMENT_COLLECTION_STRATEGY.md`).
7. **ديون تقنية:** `routeConfigs/` قديم، `UIContext` غير مُmount، `superAdminUtils.tr` مكرر، تحذير حجم chunks في البناء.

## 8) الملفات المرجعية

`LOCAL_TESTING_REPORT.md` (سجل حي شامل) • `DOCKER_GUIDE.md` (Docker) • `PROJECT_ANALYSIS_DOCUMENTATION.md` (جرد النظام) • `ACTION_PLAN_PRODUCTION_READY.md` (الخطة) • `PAYMENT_COLLECTION_STRATEGY.md` (التحصيل) • `server/scripts/reset-local.ps1` (التصفير).
