/**
 * ThemeContext — the shell's light/dark control.
 *
 * Three deliberate decisions:
 *
 * 1. `system` is a first-class value, not an afterthought. `theme` is what the
 *    user picked (and what persists); `resolvedTheme` is what is actually on
 *    screen. Components that need to know which palette is live — the chart
 *    bridge, the theme-color meta — read `resolvedTheme`.
 * 2. The default is `light`, NOT the OS setting. The dark shell is rolling out a
 *    group of screens at a time, so a machine in OS-dark mode must not flip the
 *    whole app by itself; an existing user only gets dark when they choose it.
 * 3. `applyTheme()` is exported for the boot script in `index.html`, which runs
 *    the same resolution before first paint so a dark preference never flashes
 *    bone paper first. Keep the two in sync — the keys and the class name are
 *    the contract.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'gymcore-theme';

interface ThemeContextValue {
  /** What the user picked. May be `system`. */
  theme: ThemePreference;
  /** What is on screen. */
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
  /** light → dark → light… `system` is left to the explicit picker. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* private mode / storage disabled — the boot script already painted light */
  }
  return 'light';
}

/** Paints the shell. Also called by the boot script in `index.html`. */
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#12241d' : '#f5f3ee');
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => applyTheme(readPreference()));

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* non-fatal: the preference just will not survive a reload */
    }
    setResolvedTheme(applyTheme(theme));
    if (theme !== 'system') return;
    // `system` is live: follow the OS while it is the chosen preference.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setResolvedTheme(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = (t: ThemePreference) => setThemeState(t);
  const toggleTheme = () => setThemeState((prev) => (resolveTheme(prev) === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export { ThemeContext };
