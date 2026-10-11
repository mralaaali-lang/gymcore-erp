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

1. **التصميم:** لغة مركز التحكم (`bg-gray-50`، أبيض `rounded-3xl`، أساسي `emerald-500`) عبر المكوّنات المشتركة فقط (`shared/PageHeader,StatsGrid,FilterBar,UnifiedTabs,PageLoader,ExportButton` + `ui/Card,Button,StatusBadge` + `dashboard/*`). **ممنوع mocks جديدة** — أي بيانات تعرضها صفحة يجب أن تأتي من endpoint حقيقي (أو تُترك placeholder صريح).
2. **التحقق:** `npx tsc --noEmit` (أمامي وخلفي، `noUnusedLocals/Parameters` مفعّلة) + `npm run build` بعد أي تعديل واجهة.
3. **i18n:** مفاتيح `ar.json/en.json` (تكافؤ 100% — حافظ عليه) للقوائم (`nav.*`) والهيدر واللوحات؛ بقية الصفحات ternaries داخلية (`isRtl ? ar : en`) — لا تخلط النظامين في ملف واحد بلا داعٍ. الافتراضي `ar` + `ar-EG` للتواريخ + `EGP/ج.م`.
4. **الأيقونات:** Material Symbols للمكوّنات المشتركة، phosphor/lucide-shim للصفحات — لا نظام رابع. `lucide-react` اسم مستعار لمحاكي محلي (`src/lib/lucide-react.ts`، ~121 أيقونة فقط — تحقق قبل استيراد اسم جديد).
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
- **Railway staging (2026-10-12):** النشر بـ `railway up` من الجذر (سياق build = repo root). بروكسي Railway يوصل للـ replica على **منفذ 8080** إن لم يُضبط Application Port — nginx يlisten على 80+8080 معاً. بعد كل redeploy للـ backend **أعد نشر الـ frontend** (nginx يظلّم DNS لـ `backend.railway.internal` عند الإقلاع وإلا يجمّد البروكسي). `railway service restart` يتعطّل أحياناً — `railway up -d` أضمن.

---

## 7) المتبقي (مرتب بالأولوية)

1. **تبويبات `renderPlaceholder`** (فوترة/تقويم/موقع/تسويق/تقارير POS): الشكل موحّد والربط الخلفي ناقص — endpoints موجودة جزئياً (حصص/إحالات/مدفوعات).
2. **فجوات EN** في صفحات (SetupChecklist/TrainerDashboard/FinancialReports/LeadKanban/useGymDashboard) — عربية فقط حالياً.
3. **توحيد الأيقونات** لنظام واحد (13 ملفاً يخلط) + إزالة `Plus` المكرر مع `add`.
4. **`DataTable` المشتركة** لا تدعم خلايا مخصصة — توسيعها أو توثيق الاستثناء.
5. **Staging (Railway):** ✅ يعمل (2026-10-12 §21) — backend+frontend Online من `railway up`؛ الدومينات `frontend-production-abdd`/`backend-production-9b567`. **ديون دمج صفحات متبقية:** debts، announcements، backup، migration (الفريق §22 والمتجر §23 اكتملا).
6. **مؤجل بقرار:** ZATCA، استشارة قانونية، بوابات دفع حقيقية (نقدي/يدوي أولاً — راجع `PAYMENT_COLLECTION_STRATEGY.md`).
7. **ديون تقنية:** `routeConfigs/` قديم، `UIContext` غير مُmount، `superAdminUtils.tr` مكرر، تحذير حجم chunks في البناء.

## 8) الملفات المرجعية

`LOCAL_TESTING_REPORT.md` (سجل حي شامل) • `DOCKER_GUIDE.md` (Docker) • `PROJECT_ANALYSIS_DOCUMENTATION.md` (جرد النظام) • `ACTION_PLAN_PRODUCTION_READY.md` (الخطة) • `PAYMENT_COLLECTION_STRATEGY.md` (التحصيل) • `server/scripts/reset-local.ps1` (التصفير).
