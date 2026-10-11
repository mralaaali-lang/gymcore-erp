# 🐳 دليل Docker Desktop — GymCore ERP

**الحالة:** Docker Desktop v29 يعمل. الحاويات الخمس متوقفة حالياً (مقصود — التطوير اليومي محلي).

---

## 1) البنية (docker-compose.yml)

| الحاوية | الصورة | منفذ المضيف | الدور |
|---|---|---|---|
| `gymcore-db` | postgres:13-alpine | **5433** → 5432 | قاعدة Docker المنفصلة (فيها صالتا `AML GYM` + `fitnas pro`) |
| `gymcore-redis` | redis:7-alpine | **6379** → 6379 | كاش/طوابير Docker |
| `gymcore-backend` | build `./server/Dockerfile` | **4001** → 4000 | API داخل Docker |
| `gymcore-frontend` | build `./Dockerfile` (nginx) | **9000** → 80 | واجهة مبنية (بلا HMR) |
| `gymcore-mailpit` | axllent/mailpit (profile `dev` فقط) | 1025 / 8025 | بريد وهمي للاختبار |

**البيانات:** volumes دائمة (`postgres_data`, `backend_logs`) — الإيقاف لا يمسح البيانات. الحذف فقط بـ `docker compose down -v`.

---

## 2) القاعدة الذهبية — تعارض المنافذ ⚠️

| المنفذ | النسخة المحلية (يومي) | نسخة Docker | الحكم |
|---|---|---|---|
| 9000 | Vite Dev (HMR) | nginx build | **واحدة فقط في كل مرة** |
| 6379 | Redis محلي `D:\_tools\redis` | redis:7 | **واحدة فقط — الأخطر** (سرقة المنفذ تقتل الأخرى بصمت) |
| 5432 / 5433 | PG17 محلي (5432) | PG13 حاوية (5433) | متعايشتان ✅ (قاعدتان مختلفتان!) |
| 4000 / 4001 | باكند محلي (4000) | باكند حاوية (4001) | متعايشتان ✅ |

> **حادثة موثقة (2026-10-10):** حاويات Docker بقيت تعمل 42 ساعة فسرقت 9000/6379 — المتصفح عرض واجهة قديمة بقاعدة قديمة، وRedis المحلي مات. الحل كان `docker stop` للخمس حاويات. **لا تُشغّل النسختين معاً على 9000/6379 أبداً.**

---

## 3) الأوامر اليومية

```powershell
cd D:\_proj\gymcore-erp

# إيقاف النسخة المحلية أولاً (إن وجدت) ثم تشغيل Docker
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
D:\_tools\redis\redis-server.exe --port 6379  # أوقفه بـ Ctrl+C أو أغلق نافذته
docker compose up -d --build        # بناء + تشغيل الكل

# مع البريد الوهمي:
docker compose --profile dev up -d --build

# المتابعة:
docker compose ps
docker compose logs -f backend      # سجلات الباكند
docker compose logs -f frontend
curl http://localhost:4001/health   # باكند Docker
curl http://localhost:9000          # واجهة Docker (بدون @vite/client)

# الإيقاف (يحفظ البيانات):
docker compose stop
# الإيقاف + الحذف (يبقي volumes):
docker compose down
# مسح شامل (يمسح قاعدة Docker نهائياً!):
docker compose down -v
```

**بعد أي تعديل كود:** `docker compose up -d --build backend frontend` (الحاويات لا ترى تعديلاتك إلا بإعادة البناء — لا HMR هنا).

---

## 4) متى تستخدم أي نسخة؟

| الحالة | النسخة | السبب |
|---|---|---|
| تطوير يومي (كود + اختبار سريع) | **محلية** | HMR فوري، سجلات مباشرة، 디버깅 سهل |
| اختبار نسخة الإنتاج المبنية | **Docker** | نفس صور الإنتاج (multi-stage + nginx) |
| اختبار البريد (SMTP) | **Docker + mailpit** | واجهة http://localhost:8025 تعرض الرسائل |
| جهاز زميل جديد | **Docker** | `up` واحد ويعمل (بعد `npm install` للسيد) |
| اختبار ترحيلات على نسخة نظيفة | **Docker** (`down -v` ثم `up`) | مجلد migrations يُنفذ تلقائياً على volume جديد |

---

## 5) تغذية قاعدة Docker بالبيانات

قاعدة Docker (`localhost:5433`, user/pass/db = `gymcore`/`gymcore_secret`/`gymcore`) فارغة من السيد. لتغذيتها:

```powershell
# 1. ترحيلات (الباكند يشغلها تلقائياً عند الإقلاع، أو يدوياً):
$env:PGPASSWORD="gymcore_secret"
C:\pgsql\pgsql\bin\psql.exe -U gymcore -h localhost -p 5433 -d gymcore -c "SELECT COUNT(*) FROM schema_migrations;"
# 2. نسخ نسخة التطوير إليها (أسرع طريق لبيانات الـ 10 صالات):
C:\pgsql\pgsql\bin\pg_dump.exe -U postgres -h localhost -p 5432 -Fc -f backups\for_docker.dump gymcore_local
C:\pgsql\pgsql\bin\pg_restore.exe -U gymcore -h localhost -p 5433 -d gymcore --clean --if-exists backups\for_docker.dump
# 3. نسخة الصالتين الأصلية محفوظة: backups\docker_db_with_2_user_gyms.dump
```

---

## 6) استكشاف الأخطاء

| العرض | السبب المحتمل | الحل |
|---|---|---|
| المتصفح يعرض بيانات/تصميم قديم | حاوية frontend قديمة (بلا rebuild) أو تضارب مع Vite على 9000 | `docker compose up -d --build frontend` + أغلق نسخة Vite |
| `redis: connection refused` في الباكند | تضارب 6379 مع Redis المحلي | أوقف واحداً منهما |
| backend container يخرج بـ Exit(1) | متغيرات ناقصة (env_file) أو DB غير جاهز | `docker compose logs backend` + تحقق `server/.env` موجود |
| التعديلات لا تظهر في Docker | طبيعي — الصور مجمدة وقت البناء | `--build` بعد كل تعديل |
| `docker compose` يشتكي من المنافذ | النسخة المحلية شغالة | أوقف node/redis المحليين أولاً |
