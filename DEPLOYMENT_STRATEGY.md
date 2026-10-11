# استراتيجية النشر على ثلاث مراحل — GymCore ERP
## Deployment Strategy: 3-Phase Rollout

**التاريخ:** 2026-10-08  
**الهدف:** مسار آمن من التطوير المحلي → تجريبي مجاني → إنتاج مدفوع مع دومين

---

## ⚠️ مبادئ أساسية (Non-Negotiables)

| المبدأ | التطبيق |
|--------|---------|
| **لا بيانات حقيقية في البيئة التجريبية** | أعضاء، تحصيلات، اشتراكات = بيانات وهمية فقط (`seedPlayground.ts`) |
| **الأسرار خارج الكود** | `.env` لا يُرفع للـ Git؛ تُمرر عبر منصة الاستضافة (Secrets/Env Vars) |
| **قاعدة البيانات غير عامة** | PostgreSQL لا يُعرض على منفذ عام؛ فقط التطبيق يصل إليه |
| **FHS (File Hierarchy Standard)** | الملفات المرفوعة في `/app/uploads` مع volumes مستمرة |
| **Migrations عند كل نشر** | `npm run migrate` يعمل تلقائيًا قبل بدء التطبيق |
| **Health Check إلزامي** | `/health` يعمل دون مصادقة للمراقبة |

---

## 📋 المراحل الثلاث

### المرحلة 1: اختبار محلي (Local Dev) — ✅ جاهز الآن
**الهدف:** تطوير، اختبار، تجربة الميزات الجديدة

| المكون | التشغيل |
|----------|---------|
| **PostgreSQL** | Docker (docker-compose.yml) — `postgres:13-alpine` |
| **Redis** | Docker — `redis:7-alpine` |
| **Mailpit** | Docker (profile: dev) — SMTP + Web UI |
| **Backend** | `ts-node-dev --respawn --transpile-only src/app.ts` (Hot reload) |
| **Frontend** | `vite --host` (HMR) |
| **البيانات** | `npm run db:seed` — بيانات playground (3 صالات، 300 عضو) |

**الملفات المستخدمة:**
- `docker-compose.yml` (كما هو)
- `server/.env` (قيم تطوير محلية)
- `Dockerfile` (frontend) — للبناء فقط، لا يُشغل في التطوير

**أوامر التشغيل:**
```bash
# 1. تشغيل الخدمات
docker compose up -d postgres redis mailpit

# 2. Backend
cd server && npm install && npm run dev

# 3. Frontend (terminal منفصل)
npm install && npm run dev
```

**الوصول:**
- Frontend: http://localhost:5173 (Vite) أو http://localhost:9000 (Docker build)
- Backend API: http://localhost:4000
- Mailpit UI: http://localhost:8025

---

### المرحلة 2: نشر تجريبي مجاني (Free Tier Staging) — الهدف الحالي
**الهدف:** تجربة حقيقية على إنترنت، بيانات وهمية فقط، روابط عامة للمراجعة

#### 🔍 اختيار المنصة المجانية — مقارنة الخيارات

| المنصة | يدعم Docker Compose؟ | قيود مهمة | مناسب؟ |
|----------|---------------------|------------|---------|
| **Render Free Tier** | ❌ لا (Dockerfile واحد فقط) | ينام بعد 15 دقيقة عدم نشاط؛ PostgreSQL مجاني 90 يوم فقط؛ لا volumes مستمرة | ⚠️ ممكن مع تعديلات |
| **Railway Free Trial** | ✅ نعم | $5 كريدت شهري؛ ينام بعد عدم نشاط؛ PostgreSQL/Redis included | ✅ الأفضل |
| **Fly.io Free Allowance** | ✅ نعم (Dockerfile) | 3 VMs صغيرة؛ IPv6 فقط افتراضيًا؛ لا نوم | ✅ ممتاز |
| **Koyeb Free Tier** | ✅ نعم | 1 خدمة، 512MB RAM؛ ينام بعد عدم نشاط | ⚠️ ممكن |
| **Cyclic.sh** | ❌ منصة Node فقط | MongoDB فقط؛ لا PostgreSQL | ❌ لا |
| **Oracle Cloud Always Free** | ✅ VPS كامل | 4 ARM CPUs، 24GB RAM؛ يدير Docker بنفسك | ✅ الأفضل للتحكم الكامل |

**القرار الموصى به:** **Fly.io** أو **Railway** — كلاهما يدعم Dockerfile، يمنح PostgreSQL + Redis مُدارين، ولا يتطلب إدارة VPS.

> ⚠️ **مهم:** إذا اخترت منصة **لا تدعم Docker Compose** (مثل Render)، نحتاج Dockerfile للـ backend و Dockerfile للـ frontend، وقاعدة بيانات/Redis خارجية (Supabase/Neon + Upstash).

#### 📁 الملفات المطلوبة للمرحلة 2

| الملف | الغرض | مطلوب؟ |
|--------|-------|--------|
| `server/Dockerfile.prod` | Backend production image (multi-stage) | ✅ نعم |
| `Dockerfile.prod` | Frontend production image (Vite + Nginx) | ✅ نعم |
| `.github/workflows/deploy-staging.yml` | CI/CD للنشر التلقائي على Push | ✅ نعم |
| `staging.env.template` | قالب متغيرات البيئة | ✅ نعم |
| `render.yaml` / `fly.toml` / `railway.json` | إعداد المنصة | حسب المنصة |

#### 🔐 إدارة الأسرار في المرحلة 2
- **لا** نضع `.env` في المستودع
- نستخدم **Secrets المنصة** (Fly.io secrets، Railway variables، Render environment variables)
- المتغيرات الحساسة: `JWT_SECRET`، `DATABASE_URL`، `ENCRYPTION_KEY`، `QR_SECRET_SALT`

#### 🗄️ قاعدة البيانات في المرحلة 2
- **PostgreSQL مُدار من المنصة** (Fly.io Postgres، Railway Postgres، أو Supabase/Neon Free Tier)
- **لا volumes محلية** — البيانات في خدمة مُدارة
- **Migrations تعمل تلقائيًا** عند بدء التطبيق (`runMigrations()` في `app.ts`)
- **Seed تلقائي للبيانات الوهمية** — `NODE_ENV=staging` يشغل seed للـ playground

#### 📦 الملفات المرفوعة (Uploads)
- في المرحلة 2: **Ephemeral storage** (تختفي عند إعادة النشر)
- للحل: **S3-compatible** (Cloudflare R2 مجاني، أو Supabase Storage)
- قرار: نؤجل S3 للإنتاج؛ في Staging الملفات مؤقتة (شعار الصالة، صور الأعضاء الوهمية)

---

### المرحلة 3: إنتاج مدفوع مع دومين (Paid Production) — لاحقاً
**الهدف:** إنتاج حقيقي، بيانات حقيقية، دومين مخصص، SSL، مراقبة، نسخ احتياطية

| المكون | التوصية |
|--------|---------|
| **استضافة** | Fly.io / Railway / Render Paid / Hetzner VPS / DigitalOcean |
| **قاعدة البيانات** | PostgreSQL مُدار (Managed) مع: Backups يومية، PITR، Read Replica |
| **Redis** | مُدار مع Persistence (AOF/RDB) |
| **ملفات** | Cloudflare R2 / AWS S3 / Supabase Storage (مع CDN) |
| **Email** | Resend / SendGrid / Postmark (مع DKIM/SPF/DMARC) |
| **SMS** | Unifonic / Twilio / أرامكس (إنتاجي) |
| **دومين + SSL** | Cloudflare (Proxy + WAF + SSL تلقائي) |
| **مراقبة** | Sentry + Grafana Cloud / Better Stack |
| **نسخ احتياطية** | يومية + قبل كل نشر + اختبار استعادة شهري |

---

## 🐳 الملفات الجديدة المطلوبة (مرحلة 2)

سأقوم بإنشاء:

### 1. `server/Dockerfile.prod` — Backend Production Image
(أفضل من `server/Dockerfile` الحالي: فصل dev deps، dumb-init، non-root، wget healthcheck)

### 2. `Dockerfile.prod` (جذر المشروع) — Frontend Production Image  
(محسّن: cache deps، gzip pre-compression، security headers في nginx)

### 3. `staging.env.template` — قالب متغيرات البيئة للمرحلة التجريبية

### 4. `.github/workflows/deploy-staging.yml` — CI/CD للنشر التلقائي

### 5. `fly.toml` / `railway.json` / `render.yaml` — إعداد المنصة المختارة

---

## ❓ قبل البدء — أحتاج قرارات منك

| القرار | مطلوب؟ | خيارات |
|----------|--------|---------|
| **1. منصة النشر التجريبية (المرحلة 2)** | ✅ نعم | Fly.io / Railway / Render / Oracle Cloud / غير ذلك |
| **2. هل لديك حساب على المنصة المختارة؟** | ✅ نعم | نعم / لا (أرشدك للإنشاء) |
| **3. PostgreSQL للمحور التجريبي** | ✅ نعم | مُدار من المنصة / Supabase Free / Neon Free / غير ذلك |
| **4. Redis للمحور التجريبي** | ✅ نعم | مُدار من المنصة / Upstash Free / غير ذلك |
| **5. دومين تجريبي (subdomain)؟** | ⭕ اختياري | `staging.gymcore.example.com` / لا (نستخدم رابط المنصة) |
| **6. CI/CD: GitHub Actions → منصة النشر** | ✅ نعم | نحتاج API Token من المنصة |
| **7. Sentry DSN للمرحلة التجريبية؟** | ⭕ اختياري | نعم / لا (نفعّله في الإنتاج فقط) |
| **8. هل نفعّل Mailpit في Staging أم نستخدم بريد حقيقي (Resend مجاني)؟** | ⭕ اختياري | Mailpit / Resend مجاني |

---

## ✅ خطة العمل المقترحة (عند ردك)

1. **بناء `server/Dockerfile.prod`** — محسن للإنتاج
2. **بناء `Dockerfile.prod` (Frontend)** — محسن للإنتاج
3. **إنشاء `staging.env.template`** — قالب الأسرار
4. **إنشاء GitHub Actions workflow** — بناء + Push image + Deploy
5. **إنشاء إعداد المنصة المختارة** (fly.toml أو railway.json أو render.yaml)
6. **اختبار محلي للـ images** (`docker build` + `docker run --env-file`)
7. **دفع الكود → GitHub Actions ينشر تلقائيًا للمرحلة التجريبية**
8. **مراجعة الروابط العامة، اختبار تسجيل دخول، التحصيل، الأعضاء**

---

## 📌 ملاحظات هامة للمرحلة 2

| النقطة | التفصيل |
|---------|---------|
| **نوم الخدمة (Sleep/Wake)** | Fly.io لا ينام؛ Railway/Render ينامان بعد 15-30 دقيقة — أول طلب يوقظها (5-30 ثانية) |
| **استمرارية قاعدة البيانات** | PostgreSQL المُدار مستمر؛ البيانات لا تُحذف إلا يدويًا |
| **الملفات المرفوعة** | Ephemeral في Container — تُحذف عند إعادة النشر → الحل لاحقاً: S3/R2 |
| **الأسرار** | تُخزن في Secrets المنصة، لا في الكود، لا في Docker image |
| **CORS_ORIGIN** | يجب أن يكون رابط Frontend التجريبي الدقيق (مثال: `https://gymcore-staging.fly.dev`) |
| **TRUST_PROXY** | `true` خلف بروكسي المنصة (Fly.io، Railway، Render) |
| **Migrations** | تعمل تلقائيًا عند بدء التطبيق — لا حاجة لخطوة منفصلة في CI/CD |
| **Seed البيانات** | `NODE_ENV=staging` → يشغل seedPlayground (أو سكربت مخصص للبيانات الوهمية) |

---

## 🔗 الملفات المرجعية الحالية (لا تكرار)

| الملف | الحالة |
|--------|-------|
| `docker-compose.yml` | تطوير محلي فقط — **يبقى كما هو** |
| `Dockerfile` (الجذر) | Frontend dev build — **يبقى كما هو** |
| `server/Dockerfile` | Backend dev build — **يبقى كما هو** |
| `server/.env.example` | قالب الأسرار — **يبقى كما هو** |
| `nginx.conf` | Frontend production config — **يبقى كما هو** |
| `server/src/config/migrate.ts` | Migrations runner — **مستخدم في Production image** |

---

**الخطوة التالية:** ردّك على القرارات أعلاه (خاصة رقم 1: المنصة)، ثم أبدأ بإنشاء الملفات.