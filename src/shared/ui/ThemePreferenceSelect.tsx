import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/context/ThemeContext';
import type { ThemePreference } from '@/shared/types';
import { cn } from '@/shared/utils';

/**
 * The three choices, in the order they are shown. Light first and system last
 * reads as "lightest to most delegated", which is the order every OS uses.
 */
const THEME_OPTIONS: { value: ThemePreference; labelKey: string; fallback: string; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'appearanceSettings.theme.light', fallback: 'Claro', icon: Sun },
  { value: 'dark', labelKey: 'appearanceSettings.theme.dark', fallback: 'Oscuro', icon: Moon },
  { value: 'system', labelKey: 'appearanceSettings.theme.system', fallback: 'Sistema', icon: Monitor },
];

/**
 * Used by the settings and quick-settings-panel modules to pick the theme.
 *
 * Replaces DarkModeToggle in those two places: a two-position switch cannot
 * represent three states, and rendering one would silently drop `'system'` the
 * first time it was touched.
 */
export function ThemePreferenceSelect({ ariaLabel }: { ariaLabel?: string }) {
  const { t } = useTranslation('settings');
  const { themePreference, setThemePreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? t('appearanceSettings.theme.label', { defaultValue: 'Tema' })}
      className="inline-flex flex-none rounded-lg border border-input bg-muted p-0.5"
    >
      {THEME_OPTIONS.map(({ value, labelKey, fallback, icon: Icon }) => {
        const isSelected = themePreference === value;
        const label = t(labelKey, { defaultValue: fallback });

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            onClick={() => setThemePreference(value)}
            className={cn(
              'flex touch-manipulation items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
