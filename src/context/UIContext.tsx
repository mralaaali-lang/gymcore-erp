// ── UIContext — Manages UI state (language, isSidebarOpen) ──
import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import i18n from '../i18n';

// ── State ──
export interface UIState {
  language: 'ar' | 'en';
  isSidebarOpen: boolean;
  currency: string;
}

interface UIContextProps extends UIState {
  setLanguage: (lang: 'ar' | 'en') => void;
  toggleSidebar: () => void;
  setCurrency: (currency: string) => void;
}

export type UIAction =
  | { type: 'SET_LANGUAGE'; payload: 'ar' | 'en' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR'; payload: boolean }
  | { type: 'SET_CURRENCY'; payload: string };

const initialUIState: UIState = {
  language: 'ar',
  isSidebarOpen: true,
  currency: 'E£',
};

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarOpen: !state.isSidebarOpen };
    case 'SET_SIDEBAR':
      return { ...state, isSidebarOpen: action.payload };
    case 'SET_CURRENCY':
      return { ...state, currency: action.payload };
    default:
      return state;
  }
}

const UIContext = createContext<UIContextProps | undefined>(undefined);

export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(uiReducer, initialUIState);

  const setLanguage = (lang: 'ar' | 'en') => {
    i18n.changeLanguage(lang);
    dispatch({ type: 'SET_LANGUAGE', payload: lang });
  };
  const toggleSidebar = () => dispatch({ type: 'TOGGLE_SIDEBAR' });
  const setCurrency = (currency: string) => dispatch({ type: 'SET_CURRENCY', payload: currency });

  // Sync document direction and language
  useEffect(() => {
    const root = document.documentElement;
    root.dir = state.language === 'ar' ? 'rtl' : 'ltr';
    root.lang = state.language;
  }, [state.language]);

  return (
    <UIContext.Provider value={{ ...state, setLanguage, toggleSidebar, setCurrency }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within UIProvider');
  return context;
};