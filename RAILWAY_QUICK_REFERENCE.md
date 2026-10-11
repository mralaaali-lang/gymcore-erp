# Railway Trial — Quick Reference Card
## GymCore ERP Staging Deployment

---

## 🎯 One-Line Summary
**Railway Trial = $5/mo temporary credit, services sleep, no Docker Compose, separate services, ephemeral storage, dummy data only.**

---

## ⚡ 5-Minute Setup Checklist

```
[ ] 1. railway login
[ ] 2. railway init (new project)
[ ] 3. Dashboard: Add PostgreSQL Service → Copy DATABASE_URL
[ ] 4. Dashboard: Add Redis Service → Copy REDIS_URL
[ ] 5. Dashboard: Add Backend Service (Dockerfile: server/Dockerfile.prod)
[ ] 6. Dashboard: Add Frontend Service (Dockerfile: Dockerfile.prod)
[ ] 7. Backend Variables: Paste DATABASE_URL, REDIS_URL, JWT_SECRET, QR_SECRET_SALT, ENCRYPTION_KEY, CORS_ORIGIN (placeholder), NODE_ENV=staging, TRUST_PROXY=true, SEED_PLAYGROUND=true
[ ] 8. railway up --service backend
[ ] 9. railway up --service frontend
[ ] 10. Get URLs: railway status --service backend/frontend --json | jq -r '.deployments[0].url'
[ ] 11. Update Backend CORS_ORIGIN = Frontend URL
[ ] 12. railway service restart --service backend && railway service restart --service frontend
[ ] 12. Test: curl <backend>/health && curl <frontend>/
```

---

## 🔑 Generate Secrets (Run Once, Save Securely)

```bash
# JWT Secret (32+ chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# QR Secret Salt (32+ chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key (64 hex chars = 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🚂 Railway Service Architecture

```
Project: gymcore-staging
│
├── postgres (Managed PostgreSQL)  → provides DATABASE_URL
├── redis (Managed Redis)          → provides REDIS_URL
├── backend (Docker: server/Dockerfile.prod)  → PORT=4000, /health
└── frontend (Docker: Dockerfile.prod)        → PORT=80, /
```

**Communication:** Internal Railway DNS (private IPs). Services talk via `DATABASE_URL`, `REDIS_URL`, `VITE_API_URL`.

---

## 📋 Variable Injection Order (MUST FOLLOW)

| Step | Action | Where |
|------|--------|-------|
| 1 | Create PostgreSQL | Dashboard → Add Service → Database → PostgreSQL |
| 2 | Create Redis | Dashboard → Add Service → Database → Redis |
| 3 | **Copy DATABASE_URL** | postgres Service → Connect tab |
| 4 | **Copy REDIS_URL** | redis Service → Connect tab |
| 5 | Create Backend Service | Dashboard → Add Service → Empty → Dockerfile: server/Dockerfile.prod |
| 6 | Create Frontend Service | Dashboard → Add Service → Empty → Dockerfile: Dockerfile.prod |
| 7 | **Set Backend Variables** | Backend Service → Variables tab |
| 8 | Deploy Backend | `railway up --service backend` |
| 9 | Get Backend URL | `railway status --service backend --json \| jq -r '.deployments[0].url'` |
| 8 | Set Frontend `VITE_API_URL` | Frontend Service → Variables |
| 9 | Deploy Frontend | `railway up --service frontend` |
| 10 | Get Frontend URL | `railway status --service frontend --json \| jq -r '.deployments[0].url'` |
| 11 | **Update Backend CORS_ORIGIN** = Frontend URL | Backend Service → Variables |
| 12 | Restart Both | `railway service restart --service backend && railway service restart --service frontend` |

---

## 🔐 Required Backend Variables (Copy-Paste Template)

```bash
# === CORE (Required) ===
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require  # FROM PG SERVICE
REDIS_URL=redis://user:pass@host:6379                              # FROM REDIS SERVICE
JWT_SECRET=                                                        # 32+ chars (generate)
QR_SECRET_SALT=                                                    # 32+ chars (generate)
ENCRYPTION_KEY=                                                    # 64 hex chars (generate)
CORS_ORIGIN=https://gymcore-frontend-xxxx.up.railway.app           # UPDATE AFTER FRONTEND DEPLOY
FRONTEND_URL=https://gymcore-frontend-xxxx.up.railway.app           # REQUIRED: password-reset email links
NODE_ENV=staging
TRUST_PROXY=true
PORT=4000
SEED_PLAYGROUND=true
LOG_LEVEL=info

# === OPTIONAL ===
SENTRY_DSN=
SMTP_HOST=                                                         # Resend free tier
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

---

## 🌐 Frontend Variables

```bash
VITE_API_URL=https://gymcore-backend-xxxx.up.railway.app/api/v1
NODE_ENV=production
```

---

## 🧪 Seed Data (Automatic on Staging)

```
SEED_PLAYGROUND=true creates:
- 3 Gyms: "لياقة الأبطال", "جيم تايتان", "باور هاوس"
- Per gym: Owner, Manager, Reception, Coach (pass: Owner@123, Manager@123, Rec@123, Coach@123)
- 100 members/gym with subscriptions, attendance
- Offers, products, classes, expense categories
- NO REAL DATA
```

No default super-admin credentials are stored in this guide. Create a disposable staging account with the bootstrap:platform-admin command and private environment secrets.

---

## ⚠️ Trial Limitations (Monitor Daily)

| Resource | Limit | Watch |
|----------|-------|-------|
| Monthly Credit | $5 | Dashboard → Usage |
| Sleep After | ~30 min inactive | Cold start 10-30s |
| Backend RAM | 512MB shared | Metrics tab |
| Frontend RAM | 256MB shared | Metrics tab |
| PostgreSQL | 1GB storage | Database tab |
| Redis | 100MB | Redis tab |
| File Storage | **Ephemeral** (lost on redeploy) | → Move to R2/S3 for prod |

---

## 🚨 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Health check failed | Check logs: `railway logs --service backend`; increase startPeriod |
| DB connection refused | Verify DATABASE_URL from PG Service Connect tab; ensure PG service running |
| CORS error | Update CORS_ORIGIN to exact Frontend URL; restart backend |
| Service sleeping | Trial limit; upgrade or accept cold start |
| Build failed (bcrypt/sharp) | Dockerfile has `apk add python3 make g++` in builder stage |
| Variables not picked up | Restart service after variable change: `railway service restart --service backend` |

---

## 📱 Useful Commands

```bash
# Login & Link
railway login
railway link --project <PROJECT_ID> --environment staging

# Deploy
railway up --service backend --detach
railway up --service frontend --detach

# Status & URLs
railway status --service backend --json | jq -r '.deployments[0].url'
railway status --service frontend --json | jq -r '.deployments[0].url'

# Logs
railway logs --service backend
railway logs --service frontend

# Variables
railway variables --service backend
railway variables set --service backend KEY=value

# Restart
railway service restart --service backend
railway service restart --service frontend

# Shell (debug)
railway shell --service backend
```

---

## 📦 GitHub Actions (Auto-Deploy on Push)

**Required Secrets (GitHub → Settings → Secrets → Actions):**
```
RAILWAY_TOKEN
RAILWAY_PROJECT_ID
RAILWAY_SERVICE_BACKEND
RAILWAY_SERVICE_FRONTEND
STAGING_DATABASE_URL
STAGING_REDIS_URL
STAGING_JWT_SECRET
STAGING_QR_SECRET
STAGING_ENCRYPTION_KEY
STAGING_CORS_ORIGIN (will update via workflow)
STAGING_SENTRY_DSN (optional)
STAGING_SMTP_* (optional)
STAGING_SUPER_ADMIN_EMAIL
STAGING_SUPER_ADMIN_PASSWORD
```

**Workflow:** `.github/workflows/deploy-railway.yml` — runs on push to main.

---

## 📅 Trial → Production Migration Path

| Trial | Production |
|-------|------------|
| Railway Trial ($5/mo) | Railway Pro / Fly.io / Hetzner VPS |
| Shared PG (1GB) | Managed PG + Daily Backups + PITR + Read Replica |
| Shared Redis (100MB) | Managed Redis + AOF Persistence |
| Ephemeral Files | Cloudflare R2 / S3 + CDN |
| *.up.railway.app | Custom Domain + Cloudflare (WAF, SSL, Cache) |
| Railway Metrics | Sentry + Grafana Cloud / Better Stack |
| Manual Backups | Automated Daily + Pre-deploy + Monthly Restore Test |

---

## 📞 Emergency Contacts

- Railway Status: https://status.railway.app
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Project Dashboard: https://railway.app/project/<PROJECT_ID>

---

**🎯 Next Action:** Run the 5-minute setup checklist above. Report back with Backend/Frontend URLs or any errors.
