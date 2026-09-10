import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, test } from 'vitest';

import { ThemeProvider, useTheme } from '@/shared/context/ThemeContext';
import {
  readUserPreference,
  resetUserPreferences,
  writeUserPreference,
} from '@/shared/userSettings';

/**
 * The theme is stored server-side, so the provider has to distinguish a theme
 * the user picked from one this device merely started on. Persisting the
 * latter — which an effect keyed on the state does, on mount, before the stored
 * theme has been fetched — writes a device's system default over the user's
 * real choice on every other device.
 */

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ThemeProvider, null, children);

beforeEach(() => {
  localStorage.clear();
  // The preference store is a module-level singleton, so its in-memory copy
  // outlives localStorage.clear() and would leak one test's writes into the next.
  resetUserPreferences();
  document.documentElement.classList.remove('dark');
});

test('mounting stores no theme for a user who has never chosen one', () => {
  renderHook(() => useTheme(), { wrapper });

  assert.equal(
    readUserPreference<unknown>('theme', null),
    null,
    'a device must not record the theme it happened to start on',
  );
});

test('mounting does not overwrite the stored theme', () => {
  writeUserPreference('theme', 'dark');

  renderHook(() => useTheme(), { wrapper });

  assert.equal(readUserPreference('theme', null), 'dark');
});

test('a stored theme is applied on the first render', () => {
  writeUserPreference('theme', 'dark');

  const { result } = renderHook(() => useTheme(), { wrapper });

  assert.equal(result.current.isDarkMode, true);
  assert.ok(document.documentElement.classList.contains('dark'));
});

test('toggling stores the theme the user picked', () => {
  const { result } = renderHook(() => useTheme(), { wrapper });
  assert.equal(result.current.isDarkMode, false);

  act(() => {
    result.current.toggleDarkMode();
  });

  assert.equal(result.current.isDarkMode, true);
  assert.equal(readUserPreference('theme', null), 'dark');
  assert.ok(document.documentElement.classList.contains('dark'));
});

test('a theme arriving from the store is applied without being written back', () => {
  const { result } = renderHook(() => useTheme(), { wrapper });

  act(() => {
    // Stands in for a hydrate delivering the theme chosen on another device.
    writeUserPreference('theme', 'dark');
  });

  assert.equal(result.current.isDarkMode, true);
  assert.equal(readUserPreference('theme', null), 'dark');
});

/**
 * The three-state half. `'system'` is a real stored choice, not the absence of
 * one, so it has to survive a reload and keep tracking the OS afterwards —
 * while light and dark must stop tracking it entirely.
 */

/** Drives `prefers-color-scheme` so a test can move the OS theme mid-render. */
function installControllableMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const original = window.matchMedia;
  let matches = initialMatches;

  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  return {
    setMatches(next: boolean) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

test('a user who never chose follows the system theme', () => {
  const media = installControllableMatchMedia(true);

  try {
    const { result } = renderHook(() => useTheme(), { wrapper });

    assert.equal(result.current.themePreference, 'system');
    assert.equal(result.current.isDarkMode, true, 'a dark OS must produce a dark first paint');
    assert.equal(readUserPreference<unknown>('theme', null), null, 'following the OS is not a choice worth storing');
  } finally {
    media.restore();
  }
});

test("'system' keeps tracking the OS after the OS changes", () => {
  const media = installControllableMatchMedia(false);

  try {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemePreference('system');
    });
    assert.equal(result.current.isDarkMode, false);

    act(() => {
      media.setMatches(true);
    });

    assert.equal(result.current.isDarkMode, true);
    assert.equal(result.current.themePreference, 'system', 'following the OS must not collapse into a fixed colour');
    assert.equal(readUserPreference('theme', null), 'system');
  } finally {
    media.restore();
  }
});

test('an explicit theme ignores the OS', () => {
  const media = installControllableMatchMedia(false);

  try {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemePreference('light');
    });

    act(() => {
      media.setMatches(true);
    });

    assert.equal(result.current.isDarkMode, false, 'an explicit light theme must survive a dark OS');
    assert.equal(result.current.themePreference, 'light');
  } finally {
    media.restore();
  }
});

test("toggling away from 'system' lands on a concrete theme", () => {
  const media = installControllableMatchMedia(true);

  try {
    const { result } = renderHook(() => useTheme(), { wrapper });
    assert.equal(result.current.themePreference, 'system');
    assert.equal(result.current.isDarkMode, true);

    act(() => {
      result.current.toggleDarkMode();
    });

    assert.equal(result.current.themePreference, 'light', 'the header switch must not leave the theme delegated');
    assert.equal(result.current.isDarkMode, false);
    assert.equal(readUserPreference('theme', null), 'light');
  } finally {
    media.restore();
  }
});
