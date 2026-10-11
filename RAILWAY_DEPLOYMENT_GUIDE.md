# دليل النشر على Railway Trial — GymCore ERP
## Railway Trial Deployment Guide

**التاريخ:** 2026-10-08  
**الهدف:** نشر تجريبي قصير المدى على Railway Trial مع بيانات وهمية فقط  
**ملف Workflow:** `.github/workflows/deploy-railway.yml` (Railway فقط)

---

## ⚠️ تنبيهات حاسمة — Railway Trial

| القيود | التفصيل | تأثير عليك |
|---------|---------|------------|
| **رصيد مؤقت** | $5 كريدت شهري **ينتهي** — ليس استضافة مجانية دائمة | خطط للانتقال لإنتاج مدفوع خلال أسابيع |
| **نوم الخدمات** | تنام بعد عدم نشاط ~30 دقيقة | أول طلب يوقظها (Cold start 10-30 ثانية) |
| **لا Docker Compose** | كل خدمة منفصلة (Backend, Frontend, PostgreSQL, Redis) | لا تستخدم `docker-compose.yml` على Railway |
| **قاعدة بيانات مشتركة** | PostgreSQL و Redis خدمات مُدارة من Railway | تُضاف كـ "Services" في المشروع |
| **شبكة داخلية** | الخدمات تتواصل عبر Private IPs داخلياً | `DATABASE_URL` و `REDIS_URL` تُمرر كمتغيرات |
| **لا volumes مستمرة** | نظام الملفات Ephemeral | الملفات المرفوعة تُحذف عند إعادة النشر |

> **القرار:** لا بيانات أعضاء/تحصيلات حقيقية — فقط `seedPlayground` (3 صالات، 300 عضو وهمي).

---

## 🏗️ كيف يعمل Railway (ليس Docker Compose)

```
┌─────────────────────────────────────────────────────────────┐
│                    RAILWAY PROJECT                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Backend    │  │  Frontend   │  │ PostgreSQL  │         │
│  │  Service    │  │  Service    │  │  Service    │         │
│  │  (Docker)   │  │  (Docker)   │  │  (Managed)  │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                 │
│              ┌─────────────────────┐                        │
│              │   Private Network   │                        │
│              │  (Internal DNS)     │                        │
│              └──────────┬──────────┘                        │
│                         │                                   │
│              ┌──────────▼──────────┐                        │
│              │    Redis Service    │                        │
│              │    (Managed)        │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**الخلاصة:** لا `docker-compose.yml`. كل خدمة تُبنى من Dockerfile خاص، وتتواصل عبر متغيرات بيئة (`DATABASE_URL`, `REDIS_URL`).

---

## 📋 ترتيب العمليات الإلزامي (Critical Order)

### المرحلة 0: التحضير (قبل أي أمر Railway)

```
1. [ ] إنشاء حساب Railway + تثبيت CLI
2. [ ] إنشاء مشروع جديد: `railway init`
3. [ ] إضافة PostgreSQL Service (من Dashboard: Add Service → Database → PostgreSQL)
4. [ ] إضافة Redis Service (Add Service → Database → Redis)
5. [ ] إنشاء Backend Service (Add Service → Empty Service → Dockerfile)
6. [ ] إنشاء Frontend Service (Add Service → Empty Service → Dockerfile)
7. [ ] نسخ معرفات المشروع والخدمات (Project ID, Service IDs)
```

### المرحلة 1: بناء الصور محلياً (اختياري - CI/CD يفعلها)

```bash
# Backend
docker build -f server/Dockerfile.prod -t gymcore-backend:staging ./server

# Frontend
docker build -f Dockerfile.prod -t gymcore-frontend:staging .

# اختبار محلي (اختياري)
docker run --env-file .env.test -p 4000:4000 gymcore-backend:staging
docker run -p 8080:80 gymcore-frontend:staging
```

### المرحلة 2: متغيرات البيئة — الترتيب الدقيق

**❌ لا تضبط متغيرات التطبيق قبل وجود قاعدة البيانات و Redis**  
**✅ الترتيب الصحيح:**

| الخطوة | الإجراء | أين |
|--------|---------|-----|
| 1 | إنشاء PostgreSQL Service | Railway Dashboard |
| 2 | إنشاء Redis Service | Railway Dashboard |
| 3 | نسخ `DATABASE_URL` و `REDIS_URL` (يظهران تلقائياً بعد الخطوتين 1-2) | Dashboard → Service → Connect |
| 4 | إنشاء Backend Service (Dockerfile) | Dashboard → Add Service |
| 5 | إنشاء Frontend Service (Dockerfile) | Dashboard → Add Service |
| 6 | **ضبط متغيرات Backend** (بما فيها DATABASE_URL, REDIS_URL) | Backend Service → Variables |
| 7 | **ضبط متغيرات Frontend** (VITE_API_URL) | Frontend Service → Variables |
| 8 | **نشر أول مرة** (Deploy) | Dashboard أو CLI |
| 9 | الحصول على روابط الخدمات (Backend URL, Frontend URL) | Dashboard → Service → Settings |
| 10 | **تحديث CORS_ORIGIN** في Backend ليطابق Frontend URL الفعلي | Backend Variables |
| 11 | **إعادة تشغيل الخدمات** لتطبيق المتغيرات الجديدة | Dashboard أو `railway service restart` |

---

## 🔐 متغيرات Backend الإلزامية (ترتيب الأهمية)

```bash
# 1. قاعدة البيانات (تأتي من PostgreSQL Service تلقائياً)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# 2. Redis (يأتي من Redis Service تلقائياً)
REDIS_URL=redis://user:pass@host:6379

# 3. أسرار التشفير (توليد إلزامي قبل النشر)
JWT_SECRET=           # 32+ chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
QR_SECRET_SALT=       # 32+ chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=       # 64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. عناوين الواجهة العامة (يضبطان بعد معرفة Frontend URL الفعلي)
CORS_ORIGIN=https://gymcore-frontend-xxxx.up.railway.app
FRONTEND_URL=https://gymcore-frontend-xxxx.up.railway.app  # مطلوب لروابط استعادة كلمة المرور

# 5. إعدادات التطبيق
NODE_ENV=staging
TRUST_PROXY=true
PORT=4000
SEED_PLAYGROUND=true
LOG_LEVEL=info

# 6. اختياري (Sentry, Email, SMS)
SENTRY_DSN=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

### متغيرات Frontend الإلزامية

```bash
VITE_API_URL=https://gymcore-backend-xxxx.up.railway.app/api/v1
NODE_ENV=production
```

---

## 🚀 خطوات النشر اليدوي (أول مرة — قبل CI/CD)

### 1. تسجيل الدخول وربط المشروع
```bash
npm i -g @railway/cli@latest
railway login
railway init  # أو railway link --project <PROJECT_ID> --environment staging
```

### 2. إنشاء الخدمات (من Dashboard أسهل)
```
Railway Dashboard → Project → Add Service:
  1. Database → PostgreSQL  → اسم: postgres
  2. Database → Redis       → اسم: redis
  3. Empty Service          → اسم: backend   → Dockerfile: server/Dockerfile.prod
  4. Empty Service          → اسم: frontend  → Dockerfile: Dockerfile.prod
```

### 3. ضبط المتغيرات (Backend → Variables)
```
DATABASE_URL=           (نسخ من postgres service → Connect)
REDIS_URL=              (نسخ من redis service → Connect)
JWT_SECRET=             (توليد جديد)
QR_SECRET_SALT=         (توليد جديد)
ENCRYPTION_KEY=         (توليد جديد)
CORS_ORIGIN=            (مؤقت: http://localhost:3000، يُحدث لاحقاً)
NODE_ENV=staging
TRUST_PROXY=true
PORT=4000
SEED_PLAYGROUND=true
LOG_LEVEL=info
```

### 4. النشر الأول
```bash
railway up --service backend --detach
railway up --service frontend --detach
```

### 5. الحصول على الروابط وتحديث CORS
```bash
# احصل على الروابط
railway status --service backend --json | jq -r '.deployments[0].url'
railway status --service frontend --json | jq -r '.deployments[0].url'

# اجعل CORS_ORIGIN و FRONTEND_URL يطابقان Frontend URL الفعلي (HTTPS)
# ثم أعيد تشغيل الخدمات
railway service restart --service backend
railway service restart --service frontend
```

### 6. التحقق
```bash
curl https://<backend-url>/health
curl https://<frontend-url>/
```

---

## 🤖 النشر التلقائي عبر GitHub Actions (بعد النجاح اليدوي)

### أسرار GitHub المطلوبة (Settings → Secrets → Actions)

| السر | المصدر | مثال |
|------|--------|------|
| `RAILWAY_TOKEN` | Railway Account → Tokens | `railway_...` |
| `RAILWAY_PROJECT_ID` | Project Settings | `xxx-yyy-zzz` |
| `RAILWAY_SERVICE_BACKEND` | Service Settings | `backend` |
| `RAILWAY_SERVICE_FRONTEND` | Service Settings | `frontend` |
| `STAGING_DATABASE_URL` | PostgreSQL Service → Connect | `postgresql://...` |
| `STAGING_REDIS_URL` | Redis Service → Connect | `redis://...` |
| `STAGING_JWT_SECRET` | توليد جديد | `abc123...` |
| `STAGING_QR_SECRET` | توليد جديد | `def456...` |
| `STAGING_ENCRYPTION_KEY` | توليد جديد | `a1b2c3...` (64 hex) |
| `STAGING_SENTRY_DSN` | Sentry (اختياري) | `https://...` |
| `STAGING_SMTP_*` | Resend/SendGrid (اختياري) | |
| STAGING_SUPER_ADMIN_EMAIL | بريد السوبر أدمن | أضفه كسرّ خاص بالبيئة دون مثال ثابت |
| STAGING_SUPER_ADMIN_PASSWORD | كلمة مرور السوبر أدمن | أضفها كسرّ خاص بالبيئة ولا تحفظها في المستودع |

### تشغيل الـ Workflow
```bash
# تلقائي عند push إلى main
git push origin main

# أو يدوياً
gh workflow run deploy-railway.yml -f skip_tests=false
```

---

## 🧪 بيانات التجربة (Seed Playground فقط)

**لا بيانات حقيقية أبداً على Staging.**

عند `SEED_PLAYGROUND=true` (افتراضي في Staging):
```bash
# ينشئ تلقائياً عند بدء التطبيق:
# - 3 صالات وهمية: "لياقة الأبطال", "جيم تايتان", "باور هاوس"
# - كل صالة: Owner, Manager, Receptionist, Coach (كلمات مرور: Owner@123, Manager@123, Rec@123, Coach@123)
# - 100 عضو وهمي لكل صالة مع اشتراكات وحضور عشوائي
# - عروض عضوية، منتجات، حصص، فئات مصروفات
```

لا ينشئ Seed Playground حساب سوبر أدمن. أنشئ حساب الاختبار عبر bootstrap:platform-admin باستخدام أسرار خاصة بقاعدة staging.

---

## 📊 مراقبة الاستخدام والتكاليف (Railway Trial)

| المورد | الحد التجريبي | مراقبة |
|--------|-------------|--------|
| **كريدت شهري** | $5 | Dashboard → Usage |
| **Backend RAM** | 512MB (shared) | Metrics tab |
| **Frontend RAM** | 256MB (shared) | Metrics tab |
| **PostgreSQL** | 1GB storage | Database tab |
| **Redis** | 100MB | Redis tab |
| **Network** | 100GB egress | Usage tab |

**تنبيه:** إذا نفد الكريدت، تتوقف الخدمات. راقب يومياً في الأسبوع الأول.

---

## 🔄 الانتقال للإنتاج (Post-Trial)

عند انتهاء الفترة التجريبية أو اتخاذ قرار الإنتاج:

| المكون | Trial | Production |
|--------|-------|------------|
| **Hosting** | Railway Trial | Railway Pro / Fly.io / Hetzner VPS / DigitalOcean |
| **PostgreSQL** | Railway Managed (1GB) | Managed PG مع Backups يومية + PITR + Read Replica |
| **Redis** | Railway Managed (100MB) | Managed Redis مع AOF Persistence |
| **Files** | Ephemeral (يُحذف) | Cloudflare R2 / S3 + CDN |
| **Email** | Resend Free / SMTP | Resend Pro / SendGrid / Postmark + DKIM/SPF/DMARC |
| **Domain** | `*.up.railway.app` | Custom domain + Cloudflare (WAF, SSL, Cache) |
| **Monitoring** | Railway Metrics | Sentry + Grafana Cloud / Better Stack + Alerting |
| **Backups** | Manual فقط | يومية تلقائية + قبل كل نشر + اختبار استعادة شهري |

---

## ✅ قائمة تحقق قبل النشر (Pre-Deploy Checklist)

```
[ ] حساب Railway مُنشأ + CLI مثبت
[ ] مشروع Railway مُنشأ (Project ID محفوظ)
[ ] PostgreSQL Service مُضاف (DATABASE_URL جاهز)
[ ] Redis Service مُضاف (REDIS_URL جاهز)
[ ] Backend Service مُضاف (Dockerfile.prod محدد)
[ ] Frontend Service مُضاف (Dockerfile.prod محدد)
[ ] JWT_SECRET، QR_SECRET_SALT، ENCRYPTION_KEY مُولّدة (32/32/64 chars)
[ ] GitHub Secrets مضافة (RAILWAY_TOKEN، PROJECT_ID، SERVICE IDs، إلخ)
[ ] .github/workflows/deploy-railway.yml موجود في المستودع
[ ] Dockerfile.prod (Backend + Frontend) موجودان ويعملان محلياً
[ ] صحة الـ Health Checks: /health (Backend)، / (Frontend)
[ ] Seed Playground مفعل (SEED_PLAYGROUND=true)
[ ] لا بيانات حقيقية في المتغيرات أو الكود
[ ] CORS_ORIGIN سيضبط بعد أول نشر (خطوة تالية)
[ ] خطة مراقبة الكريدت الشهري ($5) جاهزة
```

---

## 🆘 استكشاف الأخطاء الشائعة

| المشكلة | السبب المحتمل | الحل |
|----------|--------------|------|
| `Health check failed` | التطبيق لم يبدأ في الوقت المحدد | زيادة `startPeriod` في Dockerfile، مراجعة logs |
| `Database connection refused` | `DATABASE_URL` خطأ أو خدمة PG غير جاهزة | تأكد من `railway status postgres`، نسخ URL صحيح |
| `CORS error` | `CORS_ORIGIN` لا يطابق Frontend URL | حدّث بعد أول نشر، أعد تشغيل Backend |
| `Services sleeping` | Trial limitation | أول طلب يوقظها، أو ترقية لإنتاج |
| `Out of credit` | $5 مستهلكة | ترقية الحساب أو تنظيف خدمات غير مستخدمة |
| `Build failed` | Native deps (bcrypt, sharp) | `apk add python3 make g++` في Dockerfile builder stage |

---

## 📞 الدعم والخطوات التالية

**بعد نجاح Staging:**
1. اختبر جميع التدفقات: تسجيل دخول، تحصيل، أعضاء، تقارير
2. راقب الكريدت والأداء لأسبوع
3. قرر منصة الإنتاج (Railway Pro، Fly.io، Hetzner، إلخ)
4. ابدأ قائمة `DEPLOYMENT_STRATEGY.md` للمرحلة 3

**ملفات المرجع:**
- `DEPLOYMENT_STRATEGY.md` — الاستراتيجية الكاملة 3 مراحل
- `staging.env.template` — قالب المتغيرات
- `railway.backend.json` / `railway.frontend.json` — إعدادات Railway

---

**⚡ جاهز للبدء؟** نفذ **المرحلة 0** أعلاه (إنشاء مشروع + PostgreSQL + Redis + خدمتين)، ثم أخبرني لنكمل متغيرات البيئة والنشر الأول.
