import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

// This replaces the app's previous pattern of `{language === 'ar' ? '...' : '...'}`
// scattered inline in every component. Components should now import
// `useTranslation` from 'react-i18next' and call `t('namespace.key')`.
//
// Language switching still goes through GymBrandContext's setLanguage() —
// that function now also calls i18n.changeLanguage() under the hood (see
// context/GymBrandContext.tsx), so existing call sites don't need to change.
i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: {
    escapeValue: false, // React already escapes
  },
  returnEmptyString: false,
});

export default i18n;
