# 🤝 بروتوكول الجلسات المتوازية — GymCore ERP

> **آخر تحديث:** 2026-10-17 • **السبب:** 3 جلسات agent شغالة على نفس الشجرة ونفس `gymcore-db`
> **الملفات المرجعية:** `AGENT_HANDOVER.md` (الفخاخ والإجراءات) • `LOCAL_TESTING_REPORT.md` (السجل الحي) • `TODO.md` (الأولويات)

---

## 1) التوزيع الحالي

| الجلسة | التخصص | النطاق المملوك | سطح التطوير |
|---|---|---|---|
| **A** | الفرونت-إند | `src/pages/**` • `src/components/**` • `src/styles/**` • `src/hooks/**` | Vite على `http://127.0.0.1:9100` |
| **B** (الحالية) | الباك-إند | `server/src/**` • `server/tests/**` • `server/migrations/081–099` | `ts-node-dev` على `:4000` |
| **C** | الدمج + التحقق الحيّ | `docker-compose.yml` • `Dockerfile` • `server/Dockerfile` • الوثايق المشتركة • `server/migrations/100+` | Docker `:9000` + المتصفح |

**المالك = C** للنشر: `git push` و`railway up` قرارين منفصلين وكل واحد بأمر صريح منه (راجع
`AGENT_HANDOVER.md` §6د و§6ز). مفيش جلسة تانية تدفع أو تنشر.

**تسجيل إسناد (المالك، 2026-10-17 — بأمر صريح: «هنطبق الكلام دا وهتبقا انتا الفرونت-إند
والدمج + التحقق الحيّ»):** جلستا **A** و**C** اتوكّلوا لنفس الجلسة (المحادثة دي). فالملكيتين
اتحدّتوا في إيد واحدة، والحدود بتتقرى كده: شغل الفرونت (`src/**`) بشروط A، والصور والحزم
والوثايق والتحقق الحيّ بشروط C، و`server/src/**` و`server/tests/**` وmigrations `081–099`
لسه لجلسة **B** وحدها. لما نفس الجلسة تشتغل بصفة C على `docker compose build` ده مش خرق
لسطر A — ده دورها المعلَن؛ والواجب المقابل: إعلان أي ملفات غير مدفوعة اتخبّزت في الصورة كل
بناء، وعدم لمس شجرة B وقت الشغل بصفة A. القياسات والتفاصيل في `LOCAL_TESTING_REPORT.md` §47.

---

## 2) الملفات الساخنة (مالك واحد، والباقي يقترح)

دول اللي بيخبطوا في بعض حتميًا، فممنوع تعدين متوازي عليهم. أي جلسة عايزة تغيير في واحد منهم
تكتب الـdiff الكامل في الشات وتحيله لمالكه:

| الملف | المالك | ليه |
|---|---|---|
| `src/services/api.ts` | A | كل جلسة تضيف دالة API وهي مكان التصادم الأول |
| `src/routes/index.tsx` | A | مسار جديد = تعديل مشترك دائمًا |
| `server/src/routes/platform.ts` و`routes/index.ts` | B | كل endpoint جديد يمر من هنا |
| `server/src/validators/schemas.ts` | B | zod schemas بتتراكم في ملف واحد |
| `package.json` • `server/package.json` • الـlockfiles | C | تثبيت حزم يغيّر البناء والصور |
| `src/styles/tokens.css` • `tailwind-tokens.js` • `shadcn-colors.js` | A | مصدر اللون الوحيد (صدفة Chalk & Brass) |
| `docker-compose.yml` • `Dockerfile` • `server/Dockerfile` | C | إعادة بناء تصوّق شجرة الجميع |
| `TODO.md` • `AGENT_HANDOVER.md` • `LOCAL_TESTING_REPORT.md` | C (وكل جلسة تُضيف فقط) | انظر §5 |

---

## 3) قواعد الكتابة على القاعدة الواحدة

- **migrations:** B على `081–099`، C على `100+`. اسم الملف `<رقم>_<اسم>.sql` وممنوع رقم مكرر؛
  قبل الإنشاء: `ls server/migrations/*.sql | tail -3`. الملفات `999_*` هي checklists يدوية —
  الـrunner بيتجاهلها (راجع `server/src/config/migrate.ts:41`).
- **صفوف التجربة:** بادئة الجلسة `ZZ A:%` / `ZZ B:%` / `ZZ C:%`، وتنظيف في نفس النداء، والباقي
  اللي **ما يتمسحش** (الجداول append-only: `activity_logs` و`platform_audit_logs`) يُكتب رقمه
  في التقرير.
- **قاعدة مستنسخة للكتابة الثقيلة:** لو جلسة هتعدّل بيانات بكميات، تعمل DB خاصة:
  ```bash
  docker exec gymcore-db psql -U gymcore -d postgres -c 'CREATE DATABASE gymcore_b OWNER gymcore'
  docker exec gymcore-db pg_dump -U gymcore -d gymcore | docker exec -i gymcore-db psql -U gymcore -d gymcore_b -q
  ```
  وتشغّل باكند خاص على `PORT=4002 DATABASE_URL=postgres://gymcore:gymcore_secret@localhost:5433/gymcore_b`.
- **الـsecrets:** مفيش جلسة تقرأ/تقارن/تطبع password hashes أو tokens أو API keys. متغيرات
  Railway بتتقرأ بالأسماء بس (`railway variable list` بطباعة القيم ممنوعة — §6د).

---

## 4) طقس كل جلسة (نفس الخطوات، نطاقات مختلفة)

**B — الباك-إند (الحالية):**

```bash
cd server && npx tsc --noEmit                                  # = 0 errors
cd server && npx vitest run tests/unit                         # اختبارات الوحدة
docker exec gymcore-db psql -U gymcore -d gymcore -c '\d <table>'   # قبل أي CRUD
docker exec gymcore-db psql -U gymcore -d gymcore -c 'SELECT id, filename FROM schema_migrations ORDER BY id DESC LIMIT 3;'
cd server && npm run dev                                       # :4000 (ts-node-dev)
```

فحص الـendpoints من غير دخول المالك: سكربت `ts-node --transpile-only` **داخل `server/`** يستدعي
الـcontrollers بـ`req`/`res` وهميين (`AGENT_HANDOVER.md` §6و) — الأسطر اللي بتتسجّل في
`platform_audit_logs` بتيجي بـ`actor_id IS NULL`، وده يُعلن.

**A — الفرونت-إند:**

```bash
npx tsc --noEmit -p tsconfig.json                              # noUnusedLocals مفعّل
npx vite build
node .qoder/skills/gymcore-shell/scripts/audit-shell-colors.mjs src/pages/<الملف>.tsx
npx vite --port 9100 --host 127.0.0.1
```

قواعد الصدفة (تلوين من التوكنات فقط، `CARD_CLASS` بلا ظل، مودالات متمركزة، RTL منطقي، أرقام
غربية، لمس ≥48px، صفر mocks) في skill `gymcore-shell`.

**C — الدمج والتحقق:**

```bash
git status --short && git log --oneline -5                     # قبل أي add
docker compose ps && curl -s http://localhost:9000/ | grep -oE 'assets/[A-Za-z0-9._-]+\.js'
docker compose build frontend backend && docker compose up -d backend frontend
```

`docker compose build` بيخبّز **شجرة العمل** — يعني files جلسة تانية غير مدفوعة ممكن تدخل
الصورة؛ يتقال صراحة في التقرير كل مرة. القياس داخل المتصفح يكون على **صفحة الجلسة نفسها**
(`list_pages`/`select_page`) مش على «الصفحة النشطة»، ومنافذ التطوير تُقاس على `127.0.0.1`
(Vite مربوط IPv4 فقط؛ `localhost` ممكن يتحلّل لـ`::1` ويرجع `000` كاذب).

---

## 5) الوثايق: إضافة فقط، من غير تعديل نص الآخرين

- `LOCAL_TESTING_REPORT.md` → كل جلسة تضيف `## §NN — <عنوان> (<تاريخ>)` **في آخر الملف**، وما
  تعدّش بلوك لغيرها.
- `AGENT_HANDOVER.md` → كل درس قابل للتكرار يتضاف كـسطر/قسم مرقّم جديد (مثل §6ز).
- `TODO.md` → سطر واحد تحت `### <التاريخ>` بترتيب زمني تصاعدي، و`[ ]`/`[x]` في أقسام المرحلة.
- **قبل أي commit للوثايق:** `git log --oneline -3` — HEAD ممكن يكون تحرّك (حصل 3 مرات يوم
  2026-10-17). لو `git status` بيّن تعديلات لجلسة تانية في نفس الملف، **ممنوع** `git add <ملف>`؛
  تتعمل تجزئة: `git diff -- <file> > /tmp/x.diff` → اختار hunks بتاعتك → `git apply --cached`.

---

## 6) التسليم للدمج (commit واحد = milestone متحقق)

1. `npx tsc` (الوجهة المناسبة) + البناء + الاختبارات = أرقام، مش «تمام».
2. قياس حيّ على النسخة المحلية، ثم مسح بيانات التجربة والإعلان عن الباقي.
3. `git status --short` → stage بمساراتك انت فقط. **ممنوع:** `git add -A`، `git stash`،
   `git checkout --` على ملف مش بتاعك، وإعادة بناء صور من غير C.
4. رسالة commit مصريّة: سطر «ليه» + الناتج المقاس.
5. توثيق في الوثايق (تحت §5) و`TODO.md`.
6. **الدفع والنشر مش جزء من الطقس** — يُطلب من المالك.

---

## 7) أخطاء متوازية موثقة (2026-10-17) — اللي بنيت عليه البروتوكول

- HEAD تحرّك 3 مرات أثناء شغل جلسة واحدة (`5f89ced` ← `78718c2` ← `181e50d`)؛ الدمج الجزئي
  للوثايق احتاج بناء blob في الـindex يدويًا.
- إعادة بناء `server` صوّرت ملفات جلسة تانية غير مدفوعة في `:9000` (اتعلنت وقتها).
- `curl http://localhost:9100/` = `000` اتفسّر غلط كـ«خادم موقوف» — القياس الصحيح
  `http://127.0.0.1:9100/` = **200** و`http://[::1]:9100/` = `000` (تصحيح §46.2 مسجل).
- حالة باقة «الأساسية» اتغيرت على staging في نص القياس من جلسة تانية/المالك — القياسات
  البصرية لازم تُنسب لصفحة ومستخدم محددين.

## 8) جاهز للتشغيل (first message لكل جلسة)

**للجلسة A:**
> أنت **A — الفرونت-إند** في GymCore ERP. اقرأ `SESSIONS.md` ثم skill `gymcore-shell`.
> ملكيتك: `src/pages/**`، `src/components/**`، `src/styles/**`، `src/hooks/**`،
> بالإضافة لـ`src/services/api.ts` و`src/routes/index.tsx` (الملفات الساخنة ليك، بس اطلب إذن
> لو جلسة B محتاجة نفس الملف في نفس اللحظة). سطحك `http://127.0.0.1:9100`. ممنوع تلمس
> `server/**` أو `docker-compose.yml` أو الصور. التسليم: `tsc` = 0 + `vite build` ✓ +
> `audit-shell-colors` نظيف + قياس حيّ + commit بمساراتك فقط + توثيق تحت `## §NN`. الدفع والنشر
> للمالك فقط.

**للجلسة B (أنا):**
> أنت **B — الباك-إند**. اقرأ `SESSIONS.md` ثم `AGENT_HANDOVER.md` (§6و و§6ز). ملكيتك
> `server/src/**` و`server/tests/**` وmigrations `081–099`. سطحك `:4000`. ممنوع تلمس `src/**`
> والـDockerfiles و`package.json`. أي endpoint جديد: `\d <table>` أولًا، schemas صريحة (بلا
> `.partial()` على schema فيه defaults)، `logPlatformAudit` لكل mutation، و`tsc` + `vitest run
> tests/unit` قبل commit. صف قاعدة التطوير **مش staging**.

**للجلسة C:**
> أنت **C — الدمج والتحقق الحيّ**. اقرأ `SESSIONS.md` كامل ثم `AGENT_HANDOVER.md`. ملكيتك
> `docker-compose.yml` والـDockerfiles و`package.json` والوثايق الثلاثة وmigrations `100+`.
> شغلك: قياس حيّ على `:9100` و`:9000` بنفسك، مراجعة كل milestone قبل الدمج، وتنفيذ أمر المالك
> للدفع/النشر بس. كل إعادة بناء صور تُعلن فيها أي ملفات غير مدفوعة دخلت الصورة.

**للجلسة A+C (الأسناد الجاري — 2026-10-17):**
> أنت **A + C** في GymCore ERP. اقرأ `SESSIONS.md` كامل ثم skill `gymcore-shell` ثم
> `AUDIT_REPORT_2026-10-17.md` §10 و§11. ملكيتك = نطاق A (`src/pages|components|styles|hooks`
> + `src/services/api.ts` و`src/routes/index.tsx` وتوكنات اللون) **زائد** نطاق C
> (`docker-compose.yml`، الـDockerfiles، `package.json` والـlockfiles، `TODO.md` و
> `AGENT_HANDOVER.md` و`LOCAL_TESTING_REPORT.md` إضافةً فقط، `server/migrations/100+`).
> ممنوع `server/src/**` و`server/tests/**` وmigrations `081–099`. طقس A: `npx tsc --noEmit -p
> tsconfig.json` = 0 ثم `npx vite build` ثم `audit-shell-colors.mjs` ثم قياس حيّ على
> `127.0.0.1:9100`. طقس C قبل أي add: `git status --short` + `git log --oneline -3` (HEAD
> بيتحرّك)، تجزئة إلزامية لو الملف فيه تعديل جلسة تانية، وإعلان صريح لأي شجرة غير مدفوعة
> اتخبّزت في صورة. الدفع والنشر بأمر المالك لوحده، وكل مرة بأمر جديد.
