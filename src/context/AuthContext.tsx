// ── AuthContext — Manages authentication state (isAuthenticated, role, tenantId) ──
import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { UserRole } from '../types';

export interface AuthState {
  isAuthenticated: boolean;
  role: UserRole;
  tenantId: string;
  isZeroState: boolean;
}

interface AuthContextProps extends AuthState {
  login: (role: UserRole, tenantId: string) => void;
  logout: () => void;
  setRole: (role: UserRole) => void;
  switchTenant: (id: string, isNew: boolean) => void;
}

export type AuthAction =
  | { type: 'LOGIN'; payload: { role: UserRole; tenantId: string } }
  | { type: 'LOGOUT' }
  | { type: 'SET_ROLE'; payload: UserRole }
  | { type: 'SWITCH_TENANT'; payload: { id: string; isNew: boolean } }
  | { type: 'RESTORE_SESSION'; payload: { role: UserRole; tenantId: string } };

export const initialAuthState: AuthState = {
  isAuthenticated: false,
  role: 'gym-admin',
  tenantId: '',
  isZeroState: false,
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, isAuthenticated: true, role: action.payload.role, tenantId: action.payload.tenantId };
    case 'LOGOUT':
      return { ...initialAuthState };
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    case 'SWITCH_TENANT':
      return { ...state, tenantId: action.payload.id, isZeroState: action.payload.isNew };
    case 'RESTORE_SESSION':
      return { ...state, isAuthenticated: true, role: action.payload.role, tenantId: action.payload.tenantId };
    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  const login = (role: UserRole, tenantId: string) =>
    dispatch({ type: 'LOGIN', payload: { role, tenantId } });
  const logout = () => dispatch({ type: 'LOGOUT' });
  const setRole = (role: UserRole) => dispatch({ type: 'SET_ROLE', payload: role });
  const switchTenant = (id: string, isNew: boolean) =>
    dispatch({ type: 'SWITCH_TENANT', payload: { id, isNew } });

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setRole, switchTenant }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};