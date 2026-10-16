import { Download, Share as Share2, X } from '@phosphor-icons/react';
import { usePwaInstall } from '../../hooks/usePwaInstall';

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

      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-margin-mobile bg-black/60 backdrop-blur-sm"
          onClick={closeIOSModal}
        >
          <div
            className="relative w-full max-w-sm backdrop-blur-2xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={closeIOSModal} className="absolute top-4 left-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <X size={18} className="text-white/50" />
            </button>

            <div className="text-center mb-6">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-3"
                style={{ backgroundColor: `${accentColor}33`, color: accentColor }}
              >
                {logoInitial}
              </div>
              <h3 className="text-white text-lg font-bold">
                {isRtl ? 'تثبيت التطبيق على iPhone' : 'Install on iPhone'}
              </h3>
              <p className="text-white/50 text-sm mt-1">
                {isRtl ? 'اتبع هذه الخطوات لتثبيت التطبيق على شاشتك الرئيسية' : 'Follow these steps to add to your home screen'}
              </p>
            </div>

            <div className="space-y-4">
              {[
                { icon: <Share2 size={16} className="text-white/60" />, title: isRtl ? 'اضغط على زر المشاركة' : 'Tap the Share button', sub: isRtl ? 'في شريط العنوان السفلي في Safari' : 'In the bottom Safari toolbar' },
                { icon: <Download size={16} className="text-white/60" />, title: isRtl ? 'اختر "إضافة إلى الشاشة الرئيسية"' : 'Choose "Add to Home Screen"', sub: isRtl ? 'مرر لأسفل في قائمة المشاركة' : 'Scroll down in the share sheet' },
                { icon: <span className="text-white/60 text-lg font-bold">+</span>, title: isRtl ? 'اضغط على "إضافة" في الأعلى' : 'Tap "Add" in the top right', sub: isRtl ? 'سيظهر التطبيق على شاشتك الرئيسية' : 'The app will appear on your home screen' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: `${accentColor}33`, color: accentColor }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-semibold">{step.title}</p>
                    <p className="text-white/40 text-xs mt-0.5">{step.sub}</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    {step.icon}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={closeIOSModal}
              className="w-full mt-6 py-3 rounded-2xl text-white font-bold text-base transition-colors shadow-lg"
              style={{ backgroundColor: accentColor }}
            >
              {isRtl ? 'فهمت' : 'Got it'}
            </button>
          </div>
        </div>
      )}

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
