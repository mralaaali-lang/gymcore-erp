import { Download, Share as Share2, X } from '@phosphor-icons/react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import Modal from '../shared/Modal';

interface PwaInstallPromptsProps {
  isRtl: boolean;
  appName: string;
  /** Tailwind-safe hex used for glows/buttons, e.g. '#f97316' or '#114b5f' */
  accentColor: string;
  logoInitial: string;
}

export default function PwaInstallPrompts({ isRtl, appName, accentColor, logoInitial }: PwaInstallPromptsProps) {
  const { isIOS, isStandalone, showInstallBanner, showIOSModal, handleInstallClick, dismissBanner, closeIOSModal } = usePwaInstall();

  return (
    <>
      {!isStandalone && showInstallBanner && !isIOS && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-slide-up">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0"
              style={{ backgroundColor: `${accentColor}33`, color: accentColor }}
            >
              {logoInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">
                {isRtl ? `ثبّت تطبيق ${appName}` : `Install ${appName} App`}
              </p>
              <p className="text-white/50 text-xs mt-0.5">
                {isRtl ? 'للوصول السريع من شاشتك الرئيسية' : 'Quick access from your home screen'}
              </p>
            </div>
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-colors shrink-0"
              style={{ backgroundColor: accentColor }}
            >
              <Download size={16} />
              {isRtl ? 'تثبيت' : 'Install'}
            </button>
            <button onClick={dismissBanner} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0">
              <X size={16} className="text-white/50" />
            </button>
          </div>
        </div>
      )}

      {/* موجة 3 / دفعة 12 — صدفة يدوية (overlay مثبّت + حشوة بـ onClick + X بـ left
       * ثابتة) على `shared/Modal`: القفل والفوكس-تراب والعزل وEscape و`dir` بقى من
       * القشرة، وX بقى `inset-inline-end` فبيتقلب مع الاتجاه بدل ما يكون محشور على
       * الشمال في اللغتين.
       * التوكنات الحرفية (bg-white/10 · border-white/20 · rounded-3xl · shadow-2xl)
       * مستنية موجة 5 (مهمة #11) — اللوحة دي زجاج فوق مشهد تسجيل الدخول الداكن،
       * و`bg-card`/`border-hairline` لو فضلوا هيمسحوا الزجاج، فوقفتهم هنا override
       * صريح في `className` (القشرة بتستخدم `tailwind-merge` فآخر فئة هي اللي بتفوز).
       * لون العنوان والزر الحرفي لازم كمان: `--foreground` في الوضع الفاتح #2b2620
       * يعني العنوان يبقى أسود فوق زجاج أسود. */}
      <Modal
        open={showIOSModal}
        onClose={closeIOSModal}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
        className="rounded-3xl border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl [&>button[aria-label]]:text-white/70 [&>button[aria-label]]:opacity-100 [&>button[aria-label]:hover]:text-white"
        title={<span className="block text-center text-white">{isRtl ? 'تثبيت التطبيق على iPhone' : 'Install on iPhone'}</span>}
        description={
          <span className="block text-center text-white/50">
            {isRtl ? 'اتبع هذه الخطوات لتثبيت التطبيق على شاشتك الرئيسية' : 'Follow these steps to add to your home screen'}
          </span>
        }
        footer={
          <button
            onClick={closeIOSModal}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl px-6 text-base font-bold text-white transition-colors sm:w-auto"
            style={{ backgroundColor: accentColor }}
          >
            {isRtl ? 'فهمت' : 'Got it'}
          </button>
        }
      >
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold"
          style={{ backgroundColor: `${accentColor}33`, color: accentColor }}
        >
          {logoInitial}
        </div>

        <div className="space-y-4">
          {[
            { icon: <Share2 size={16} className="text-white/60" />, title: isRtl ? 'اضغط على زر المشاركة' : 'Tap the Share button', sub: isRtl ? 'في شريط العنوان السفلي في Safari' : 'In the bottom Safari toolbar' },
            { icon: <Download size={16} className="text-white/60" />, title: isRtl ? 'اختر "إضافة إلى الشاشة الرئيسية"' : 'Choose "Add to Home Screen"', sub: isRtl ? 'مرر لأسفل في قائمة المشاركة' : 'Scroll down in the share sheet' },
            { icon: <span className="text-white/60 text-lg font-bold">+</span>, title: isRtl ? 'اضغط على "إضافة" في الأعلى' : 'Tap "Add" in the top right', sub: isRtl ? 'سيظهر التطبيق على شاشتك الرئيسية' : 'The app will appear on your home screen' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ backgroundColor: `${accentColor}33`, color: accentColor }}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="mt-0.5 text-xs text-white/40">{step.sub}</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                {step.icon}
              </div>
            </div>
          ))}
        </div>

        {/* زر acknowledgement واحد بقى `footer` القشرة (سطر إجراءات موحّد بـ min-h-[48px]
         * وحدّ علوي من التوكن) بدل ما يكون حشواً تحت الخطوات بـ mt-6. */}
      </Modal>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%) translateX(-50%); opacity: 0; }
          to { transform: translateY(0) translateX(-50%); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.4s ease-out; }
      `}</style>
    </>
  );
}
