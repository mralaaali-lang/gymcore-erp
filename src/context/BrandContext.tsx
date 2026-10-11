// ── BrandContext — Manages branding state (branding, theme, isZeroState) ──
import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { GymBranding } from '../types';

// ── State ──
export interface BrandState {
  branding: GymBranding;
  theme: 'light' | 'dark';
}

interface BrandContextProps extends BrandState {
  updateBranding: (branding: Partial<GymBranding>) => void;
}

export type BrandAction =
  | { type: 'UPDATE_BRANDING'; payload: Partial<GymBranding> }
  | { type: 'SET_BRANDING'; payload: GymBranding }
  | { type: 'RESET_BRANDING' };

export const defaultBranding: GymBranding = {
  name: 'GymCore',
  logoUrl: '',
  primaryColor: '#10b981',
};

const initialBrandState: BrandState = {
  branding: defaultBranding,
  theme: 'light',
};

export function brandReducer(state: BrandState, action: BrandAction): BrandState {
  switch (action.type) {
    case 'UPDATE_BRANDING':
      return { ...state, branding: { ...state.branding, ...action.payload } };
    case 'SET_BRANDING':
      return { ...state, branding: action.payload };
    case 'RESET_BRANDING':
      return { ...state, branding: defaultBranding };
    default:
      return state;
  }
}

const BrandContext = createContext<BrandContextProps | undefined>(undefined);

export const BrandProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(brandReducer, initialBrandState);

  const updateBranding = (payload: Partial<GymBranding>) =>
    dispatch({ type: 'UPDATE_BRANDING', payload });

  return (
    <BrandContext.Provider value={{ ...state, updateBranding }}>
      {children}
    </BrandContext.Provider>
  );
};

export const useBrand = () => {
  const context = useContext(BrandContext);
  if (!context) throw new Error('useBrand must be used within BrandProvider');
  return context;
};