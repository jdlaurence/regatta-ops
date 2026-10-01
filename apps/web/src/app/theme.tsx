// Theme: light, dark, or follow the system. The choice lives in localStorage (read before first
// paint by index.html) and in the signed-in user's preferences, so it follows the coach to
// another device.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'regatta-ops-theme';

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyToDocument(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

const darkQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = darkQuery();
      q?.addEventListener('change', cb);
      return () => q?.removeEventListener('change', cb);
    },
    () => darkQuery()?.matches ?? false,
    () => false,
  );
}

interface ThemeContextValue {
  choice: ThemeChoice;
  /** What is showing now. */
  resolved: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  onChoiceChange,
}: {
  children: ReactNode;
  /** Called after the user picks a theme (used to save it to their preferences). */
  onChoiceChange?: (choice: ThemeChoice) => void;
}) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored);
  const systemDark = useSystemDark();

  useEffect(() => applyToDocument(choice), [choice]);

  const setChoice = useCallback(
    (next: ThemeChoice) => {
      setChoiceState(next);
      try {
        if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
        else localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Storage unavailable: the choice lasts for this page load.
      }
      onChoiceChange?.(next);
    },
    [onChoiceChange],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      choice,
      resolved: choice === 'system' ? (systemDark ? 'dark' : 'light') : choice,
      setChoice,
    }),
    [choice, systemDark, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return ctx;
}

/** Adopt the theme saved in a user's preferences (on sign-in, from another device). */
export function useAdoptUserTheme(preferred: ThemeChoice | undefined) {
  const { choice, setChoice } = useTheme();
  useEffect(() => {
    if (preferred && preferred !== choice) setChoice(preferred);
    // Only when the saved preference itself changes (sign-in, another device).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferred]);
}
