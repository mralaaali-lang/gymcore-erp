# 🏋️ GymCore ERP

> **منصة سحابية متكاملة لإدارة الصالات الرياضية والأندية الصحية**
> Multi-Tenant SaaS | React + Express + PostgreSQL

---

## 📋 المحتويات | Table of Contents

- [📍 نظرة عامة | Overview](#-نظرة-عامة--overview)
- [✨ الميزات | Features](#-الميزات--features)
- [🏗️ البنية التقنية | Architecture](#️-البنية-التقنية--architecture)
- [🚀 البدء السريع | Quick Start](#-البدء-السريع--quick-start)
- [📊 هيكل قاعدة البيانات | Database Schema](#-هيكل-قاعدة-البيانات--database-schema)
- [🔒 الأمان | Security](#-الأمان--security)
- [🌐 الترجمة | Localization](#-الترجمة--localization)
- [📦 نشر الإنتاج | Production Deployment](#-نشر-الإنتاج--production-deployment)

---

## 📍 نظرة عامة | Overview

GymCore ERP هو نظام متكامل لإدارة الصالات الرياضية والأندية الصحية، يدعم تعدد الجهات (Multi-Tenancy) مع عزل كامل للبيانات باستخدام Row-Level Security (RLS) في PostgreSQL.

## ✨ الميزات | Features
- إدارة عدة صالات مع عزل بيانات كل صالة.
- إدارة الأعضاء والاشتراكات والحضور والموظفين.
- فواتير وباقات وأدوات تقارير وتشغيل للمنصة.
- واجهة عربية وإنجليزية مع دعم اتجاه RTL.

## 🏗️ البنية التقنية | Architecture
المصدر الوحيد للحقيقة المعمارية: **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — مخطط Mermaid مبني على الكود الفعلي (العملاء → طبقة العزل والباقات → Express → PostgreSQL بمنطقه الداخلي من RLS وتشفير وترايجرز ودوال الباقات → النشر على Railway) مع جداول بالمسارات وفجوات معروفة. يُعرض رسوميًا أيضًا في `ARCH_MAP.html`. **القاعدة:** أي milestone يغيّر البنية يحدّث `ARCHITECTURE.md` في نفس الـcommit، ولا صور خارجية مولَّدة تلقائيًا لأنها تثبت لقطة قديمة.

المجلدات الأساسية: src للواجهة، server/src للـ API، server/migrations لترحيلات قاعدة البيانات، mobile/ لمشروع React Native المنفصل، وdocs للتوثيق.

## 🚀 البدء السريع | Quick Start

### الخيار أ: التطوير المحلي (اليومي، موصى به)
1. PostgreSQL 17 محلياً على 5432 + Redis على 6379 (راجع `AGENT_HANDOVER.md` §2).
2. انسخ `server/.env.example` إلى `server/.env` (gitignored) واضبط `DATABASE_URL` والأسرار.
3. من `server`: `npm install` ثم `npm run migrate` ثم `npm run db:seed10` ثم `npm run db:seed:engagement`.
4. أنشئ السوبر أدمن: `npm run bootstrap:platform-admin` (مع `BOOTSTRAP_ADMIN_*`).
5. شغّل `npm run dev` في `server/` (باكند :4000) وفي الجذر (واجهة :9000).
6. أو بأمر واحد: `.\server\scripts\reset-local.ps1` (تصفير + تغذية + أدمن).

### الخيار ب: Docker Desktop (راجع `DOCKER_GUIDE.md`)
```bash
docker compose up -d --build
```
- **postgres**: قاعدة البيانات (مضيف 5433)
- **redis**: التخزين المؤقت (مضيف 6379)
- **backend**: خادم Express (مضيف 4001)
- **frontend**: خادم Nginx (مضيف 9000)
- **mailpit**: بريد وهمي (`--profile dev`, واجهة 8025)

⚠️ لا تشغّل النسختين معاً على 9000/6379 — واحدة فقط في كل مرة.

### Admin Access | بيانات دخول المدير

لا توجد بيانات دخول افتراضية في المشروع. أنشئ أول سوبر أدمن بالطريقة الآمنة الموضحة في server/PLATFORM_ADMIN_BOOTSTRAP.md، ثم أضف مديري الصالات من شاشة المستخدمين داخل كل صالة.

---

## 📊 هيكل قاعدة البيانات | Database Schema

### الجداول الأساسية | Core Tables
- `gyms` — الصالات الرياضية (مع all subscription management)
- `staff_users` — الموظفون (مع RLS لكل صالة)
- `members` — الأعضاء
- `membership_offers` — باقات العضوية
- `attendance_logs` — سجل الحضور
- `invoices` — الفواتير
- `billing_plans` — خطط الفوترة (Starter, Professional, Enterprise)
- `platform_settings` — إعدادات المنصة
- `platform_admins` — مدراء المنصة
- `activity_logs` — سجل النشاطات

### الجداول المساعدة | Supporting Tables
- `billing_coupons`, `cashbox_sessions`, `announcements`, `gym_settings`
- `user_sessions`, `audit_logs`, `notifications`, `support_tickets`
- `api_keys`, `security_settings`, `workflow_definitions`
- وأكثر من 30 جدولاً متخصصاً

### عزل البيانات | Tenant Isolation
يتم عزل بيانات كل صالة عبر PostgreSQL Row-Level Security (RLS) باستخدام:
```sql
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_isolation ON members
  USING (gym_id = current_setting('app.current_gym_id')::UUID);
```

---

## 🔒 الأمان | Security

### المصادقة | Authentication
- JWT (JSON Web Tokens) للمصادقة
- صلاحية 24 ساعة للـ Access Token
- 7 أيام للـ Refresh Token مع Rotate
- كلمات مرور مشفرة بـ bcrypt

### التفويض | Authorization
- أدوار متعددة (super-admin, gym-admin, trainer, reception, player)
- التحقق من الصلاحيات في كل طلب API
- عزل كامل باستخدام RLS على مستوى الصفوف

### الحماية | Protection
- Rate Limiting على واجهات المصادقة
- Helmet للأمان من هجمات الويب
- CORS مقيد
- تشفير البيانات الحساسة

---

## 🌐 الترجمة | Localization

يدعم النظام اللغتين العربية والإنجليزية مع:
- RTL الكامل للعربية
- LTR للإنجليزية
- تبديل فوري بين اللغتين
- توطين التاريخ والعملات والأرقام

---

## 📦 نشر الإنتاج | Production Deployment

> **ملاحظة (2026-10-10):** الـ staging على Railway متوقف مؤقتاً — التركيز حالياً على التطوير والاختبار المحلي. راجع `RAILWAY_DEPLOYMENT_GUIDE.md` و`AGENT_HANDOVER.md` §7 عند العودة.

```bash
docker compose up -d
```

> المنافذ الصحيحة في `docker-compose.yml`: postgres مضيف **5433**، redis مضيف **6379**، backend مضيف **4001**، frontend مضيف **9000**، mailpit **8025** (profile `dev`).

---

## 📄 الترخيص | License

جميع الحقوق محفوظة © 2024 GymCore
