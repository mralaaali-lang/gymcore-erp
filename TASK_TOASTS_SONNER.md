# مهمّة معتمدة: التوستات على sonner (المرحلة 2 — الأخيرة فيها)

**للقراءة في جلسة منفصلة.** كل حاجة تانية في خطة البرميوم اتعملت واتعملها commit؛ دي المهمة
الوحدة اللي اتحوّلت لجلسة تانية لأن ملف `ToastContext.tsx` كان فيه شغل غير مكتمل من جلسة
تانية، فاتملّكها هي.

## الحالة وقت التسليم (2026-10-16)

- `package.json` عندي ما فيهوش `sonner` في `dependencies` — تأكدّي إن التثبيت اتعمل فعلاً
  (`node_modules/sonner/package.json` و`git diff package.json package-lock.json`) قبل ما
  تكتبي كود. لو مش موجود اعملي `npm i sonner` واتزمّني الـlockfile.
- `src/context/ToastContext.tsx` = 97 سطر، وفيه نسخة غير محفورة من جلسة تانية: توست زجاجي
  كحلي بتدرجات `bg-slate-900/95` و`shadow-[0_8px_32px_rgba(16,185,129,0.18)]` وألوان
  `emerald-400 / rose-400 / amber-400 / cyan-400` و`font-arabic`. دي بالظبط اللغة البصرية
  اللي صاحب المشروع رفضها (thيم الـAI الكحلي + النئون)، فمش مطلوب تتحسّن — مطلوب تروح.
- الـAPI العام: `useToast().showToast(message, type)` بـ `type ∈ success|error|warning|info`،
  ومستخدم في **383 موضع** في `src`. **ممنوع تغيير التوقيع أو أسماء الاستيراد** — التحول
  داخلي فقط.

## المطلوب

1. `showToast` تبعت نداء sonner (`toast.success/error/warning/info`) وتفضل نفس الشكل
   والمدة الحالية (4.5 ثانية) ومكانها الحالي. حذف الـstate المحلي والقائمة المرسومة يدويًا.
2. `<Toaster />` بتاع sonner يتركّب مرة واحدة في `src/App.tsx` جوه `ToastProvider` (أو في
   مكانها الطبيعي في الشجرة)، وكل التنسيقات هناك مش في الصفحات.
3. **التنسيق من التوكنات فقط** (اتفاقية `AGENT_HANDOVER.md` بند 1هـ و1ز): لا hex ولا
   `slate-*`. القيم المقترحة لكل وضع، نفس روح الصدفة:
   - success → `--series-3` · error → `--series-6` · warning → `--series-1` · info → `--series-8`
   - خلفية `--card`، حد `--hairline`، حبر `--foreground`، نصف قطر `var(--radius)`
   - الوضع الداكن بيتظبط لوحده لأن دي متغيرات، فممنوع `dark:` هاردكود.
4. **RTL:** sonner بياخد `dir="rtl"` على الـ`<Toaster>`، والموضع يبقى في نفس الركن اللي
   التوست القديم كان فيه (bottom center) — وممنوع يتحول side drawer/زاوية مختلفة لأن
   اتفاقيتنا إن النوافذ في النص.
5. `prefers-reduced-motion`: sonner بيحترم الحركة؛ لو لقيتي `toastOptions.classNames` بيعمل
   slide، ضيفي behavior مماثل لـ`motion-reduce:animate-none` المتبع في
   `src/components/shared/Skeleton.tsx`.
6. لو فيه أي استخدام لـ`animate-slide-up` معرّف في `index.css` خصيصًا للتوست القديم،
   امسحيه بعد ما التوست الجديد يشتغل — بس بعد ما تتأكدي إن مفيش مكوّن تاني بيستخدمه
   (`grep -rn "animate-slide-up" src`).

## التحقق المطلوب قبل الـcommit

- `npx tsc --noEmit` = 0 و`npx vite build` ✓.
- `grep -rn "showToast(" src --include=*.tsx | wc -l` يفضل **383** (مفيش نداءات ضاعت).
- `grep -rn "slate-\|rgba(16,185" src/context/ToastContext.tsx` = فاضي.
- **اختبار حقيقي مش بالعين:** افتحي التطبيق (`npm run dev` على :9000 — الكونتينر القديم
  بيقدم build قديم، فمتقارنةش بـ:9000)، عملي إجراء بيطلع توست (حفظ إعدادات / تسجيل دخول
  فاشل / check-in)، وصوري الشاشة في الفاتح والداكن ومن الـRTL. لو التوست طلع من غير أيقونة
  أو اتقطع في العربية ده فشل.
- متكتبيش في `LOCAL_TESTING_REPORT.md` «اتتحقق» قبل ما العمليّة دي تتعمل — السجل ده بيتقرأ
  عليه.

## حدود الملف اللي متلمسش

`server/*`، `src/pages/settings/SettingsPage.tsx`، `src/routes/index.tsx`،
`src/services/api.ts` — كلها شغل جلسة تانية لسه غير مكتمل. اعملي commit لملفات التوستات
و`App.tsx` و`package.json`/`package-lock.json` بس، ومتعملّيش `git add -A`.

## المرجع

- الاتجاه والتوكنات: `LOCAL_TESTING_REPORT.md` §خطة البرميوم و§المرحلة 3 (دفعة 1).
- قواعد الالتزام: `AGENT_HANDOVER.md` §5 بنود 1، 1هـ، 1و، 1ز و§6 المزالق.
