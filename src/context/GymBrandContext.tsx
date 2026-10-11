import { createContext, useContext, useReducer, useEffect, useState, ReactNode } from 'react';
import type { GymBranding, AppState, AppAction, UserRole } from '../types';
import { ROLE_MAP } from '../types';
import { tryRestoreSession, logout as apiLogout, type GymBrief } from '../services/api';
import i18n from '../i18n';

interface AppContextProps extends AppState {
  updateBranding: (branding: Partial<GymBranding>) => void;
  setLanguage: (lang: 'ar' | 'en') => void;
  switchTenant: (id: string, isNew: boolean) => void;
  setRole: (role: UserRole) => void;
  toggleSidebar: () => void;
  login: (role: UserRole, tenantId: string) => void;
  logout: () => void;
  /** Tenant block from /auth/me (§24): name/subdomain/plan/currency — tenant
   *  pages no longer call the platform-only /platform/gyms/:id (403 for managers). */
  gymProfile: GymBrief | null;
  /** Logged-in staff identity from /auth/me. */
  account: { full_name?: string; email?: string } | null;
}

const initialState: AppState = {
  tenantId: '',
  branding: {
    name: 'GymCore بريميوم',
    logoUrl: '',
    primaryColor: '#114b5f',
  },
  theme: 'light',
  language: 'ar',
  role: 'gym-admin',
  isZeroState: false,
  isSidebarOpen: true,
  isAuthenticated: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'UPDATE_BRANDING':
      return { ...state, branding: { ...state.branding, ...action.payload } };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    case 'SWITCH_TENANT':
      return {
        ...state,
        tenantId: action.payload.id,
        isZeroState: action.payload.isNew,
        branding: action.payload.isNew
          ? { name: 'جيم جديد', logoUrl: '', primaryColor: '#f97316' }
          : initialState.branding,
      };
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarOpen: !state.isSidebarOpen };
    case 'LOGIN':
      return { ...state, isAuthenticated: true, role: action.payload.role, tenantId: action.payload.tenantId };
    case 'LOGOUT':
      return { ...initialState, isAuthenticated: false, tenantId: '' };
    default:
      return state;
  }
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [sessionReady, setSessionReady] = useState(false);
  const [gymProfile, setGymProfile] = useState<GymBrief | null>(null);
  const [account, setAccount] = useState<{ full_name?: string; email?: string } | null>(null);

  useEffect(() => {
    tryRestoreSession().then((restored) => {
      if (restored) {
        const mappedRole = restored.role === 'super-admin'
          ? 'super-admin'
          : ROLE_MAP[restored.role] || 'gym-admin';
        dispatch({ type: 'LOGIN', payload: { role: mappedRole, tenantId: restored.gym_id || '' } });
        if (restored.gym) {
          setGymProfile(restored.gym);
          // Sidebar/header brand shows the actual gym name once known.
          if (restored.gym.name) {
            dispatch({ type: 'UPDATE_BRANDING', payload: { name: restored.gym.name } });
          }
        }
        if (restored.full_name || restored.email) {
          setAccount({ full_name: restored.full_name, email: restored.email });
        }
      }
      setSessionReady(true);
    }).catch(() => setSessionReady(true));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dir = state.language === 'ar' ? 'rtl' : 'ltr';
    root.lang = state.language;
  }, [state.language]);

  const updateBranding = (payload: Partial<GymBranding>) =>
    dispatch({ type: 'UPDATE_BRANDING', payload });
  const setLanguage = (payload: 'ar' | 'en') => {
    // Existing call sites across the app (setLanguage('ar' | 'en')) don't
    // need to change — this now also flips i18next's active language so
    // any component using useTranslation()/t() updates too, in addition to
    // the dir="rtl"/"ltr" + document.lang effect above.
    i18n.changeLanguage(payload);
    dispatch({ type: 'SET_LANGUAGE', payload });
  };
  const switchTenant = (id: string, isNew: boolean) =>
    dispatch({ type: 'SWITCH_TENANT', payload: { id, isNew } });
  const setRole = (payload: UserRole) =>
    dispatch({ type: 'SET_ROLE', payload });
  const toggleSidebar = () => dispatch({ type: 'TOGGLE_SIDEBAR' });
  const login = (role: UserRole, tenantId: string) =>
    dispatch({ type: 'LOGIN', payload: { role, tenantId } });
  const logout = () => {
    apiLogout();
    setGymProfile(null);
    setAccount(null);
    dispatch({ type: 'LOGOUT' });
  };

  if (!sessionReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f9ff]">
        <div className="text-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-petrol">sync</span>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        ...state,
        updateBranding,
        setLanguage,
        switchTenant,
        setRole,
        toggleSidebar,
        login,
        logout,
        gymProfile,
        account,
      }}
    >
      <div className={state.language === 'ar' ? 'font-arabic' : 'font-sans'}>
        {children}
      </div>
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

