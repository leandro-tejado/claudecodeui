import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { ThemePreference } from '@/shared/types';
import {
  readUserPreference,
  subscribeToUserPreferences,
  writeUserPreference,
} from '@/shared/userSettings';

type ThemeContextValue = {
  /** The colour actually on screen. Most consumers only need this. */
  isDarkMode: boolean;
  /** What the user picked, which is `'system'` when they delegated to the OS. */
  themePreference: ThemePreference;
  /** Flips between light and dark. From `'system'` it lands on the opposite of what is showing. */
  toggleDarkMode: () => void;
  /** The three-way setter behind the Appearance settings control. */
  setThemePreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

function prefersDarkScheme(): boolean {
  return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

/**
 * Reads the stored choice, treating anything unrecognised as "never chose".
 *
 * A user who has not picked yet is deliberately `'system'` rather than
 * `'light'`: following the OS is the better first impression, and it keeps the
 * old two-value storage ('light'/'dark') working untouched.
 */
function readStoredThemePreference(): ThemePreference {
  const stored = readUserPreference<string | null>('theme', null);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

/** The colour a preference resolves to right now. Only `'system'` depends on the OS. */
function resolveIsDarkMode(preference: ThemePreference): boolean {
  return preference === 'system' ? prefersDarkScheme() : preference === 'dark';
}

/** Mounted once by App so every module can read and switch the colour theme through useTheme. */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // The user's choice, not the resulting colour. Kept as the single source of
  // truth so that `'system'` survives a re-render instead of collapsing into
  // whichever colour the OS happened to be on at mount. Read synchronously
  // from the preference mirror so the first paint is already correct.
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(readStoredThemePreference);

  // The resolved colour. Derived from the preference plus the OS, but held in
  // state because the OS half is an event source, not a value we can read
  // during render and expect to stay true.
  const [isDarkMode, setIsDarkMode] = useState(() => resolveIsDarkMode(readStoredThemePreference()));

  // The theme now lives in auth.db, so a change made on another device (or in
  // another tab) arrives through the preference store rather than a re-render.
  useEffect(() => subscribeToUserPreferences(() => {
    const stored = readStoredThemePreference();
    setThemePreferenceState(stored);
    setIsDarkMode(resolveIsDarkMode(stored));
  }), []);

  // Applying the theme to the document and persisting it are deliberately
  // separate. Persisting from here would also fire on mount — before the stored
  // theme had been fetched — writing this device's system default over the
  // theme the user actually chose on another one.
  useEffect(() => {
    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      statusBarMeta?.setAttribute('content', 'black-translucent');
      themeColorMeta?.setAttribute('content', '#141414'); // Dark background color (hsl(0 0% 8%))
    } else {
      document.documentElement.classList.remove('dark');
      statusBarMeta?.setAttribute('content', 'default');
      themeColorMeta?.setAttribute('content', '#f6f4ef'); // Light background color (warm cream)
    }
  }, [isDarkMode]);

  // Follow the OS, but only while the preference actually delegates to it.
  // Re-subscribing on every preference change is what makes switching away
  // from `'system'` stop the tracking immediately.
  useEffect(() => {
    if (themePreference !== 'system' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setIsDarkMode(event.matches);

    // The OS may have changed between the last render and this subscription.
    setIsDarkMode(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themePreference]);

  // The only writer: a theme is stored because the user picked it, never
  // because this device happened to start on one.
  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    setIsDarkMode(resolveIsDarkMode(preference));
    writeUserPreference('theme', preference);
  }, []);

  // Toggling from `'system'` resolves to a concrete choice on purpose: the
  // header button is a two-position switch, and leaving it on `'system'` would
  // make it a no-op whenever the OS already matched the requested colour.
  const toggleDarkMode = useCallback(() => {
    setThemePreference(isDarkMode ? 'light' : 'dark');
  }, [isDarkMode, setThemePreference]);

  // A fresh object here would re-render every consumer in the app on any
  // render of this provider, theme change or not.
  const value = useMemo<ThemeContextValue>(
    () => ({ isDarkMode, themePreference, toggleDarkMode, setThemePreference }),
    [isDarkMode, themePreference, toggleDarkMode, setThemePreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
