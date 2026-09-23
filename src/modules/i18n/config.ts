/**
 * i18n Configuration
 *
 * Configures i18next for internationalization support.
 * Features:
 * - Lazy-loading of translation namespaces
 * - Language detection from localStorage
 * - Fallback to English for missing translations
 * - Development mode warnings for missing keys
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation resources
import enCommon from '@/modules/i18n/locales/en/common.json';
import enSettings from '@/modules/i18n/locales/en/settings.json';
import enAuth from '@/modules/i18n/locales/en/auth.json';
import enSidebar from '@/modules/i18n/locales/en/sidebar.json';
import enChat from '@/modules/i18n/locales/en/chat.json';
import enCodeEditor from '@/modules/i18n/locales/en/codeEditor.json';
// oxlint-disable-next-line importx/order
import enTasks from '@/modules/i18n/locales/en/tasks.json';
// oxlint-disable-next-line importx/order
import enGit from '@/modules/i18n/locales/en/git.json';

// oxlint-disable-next-line importx/order

// oxlint-disable-next-line importx/order

// oxlint-disable-next-line importx/order

// oxlint-disable-next-line importx/order

// oxlint-disable-next-line importx/order

// oxlint-disable-next-line importx/order

// oxlint-disable-next-line importx/order

// oxlint-disable-next-line importx/order

// Import supported languages configuration
import { languages } from '@/modules/i18n/languages';
import {
  readUserPreference,
  subscribeToUserPreferences,
  writeUserPreference,
} from '@/shared/userSettings';

// The chosen language lives in auth.db so it follows the user between devices.
// It is read synchronously from the preference mirror because i18n has to be
// configured at module load, long before any request could resolve.
const getSavedLanguage = (): string => {
  const saved = readUserPreference<string | null>('userLanguage', null);
  // Validate that the saved language is supported
  if (saved && languages.some(lang => lang.value === saved)) {
    return saved;
  }
  return 'en';
};

// Initialize i18next
i18n
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    // Resources containing all translations
    // Only English is bundled. Every other language is a chunk fetched on
    // demand by loadLanguage() below: eleven languages were imported statically
    // here, 577 KB of JSON, so each user downloaded ten sets of translations
    // they will never read. English stays because it is the fallback — a missing
    // key in any language resolves against it, so it has to be there from the
    // first frame.
    resources: {
      en: {
        common: enCommon,
        settings: enSettings,
        auth: enAuth,
        sidebar: enSidebar,
        chat: enChat,
        codeEditor: enCodeEditor,
        tasks: enTasks,
        git: enGit,
      },
    },

    // English until the saved language's chunk lands, which loadSavedLanguage()
    // below arranges before the app mounts.
    lng: 'en',

    // Fallback language when a translation is missing
    fallbackLng: 'en',

    // Enable debug mode in development (logs missing keys to console)
    debug: false,

    // Namespaces - load only what's needed
    ns: ['common', 'settings', 'auth', 'sidebar', 'chat', 'codeEditor', 'tasks', 'git'],
    defaultNS: 'common',

    // Key separator for nested keys (default: '.')
    keySeparator: '.',

    // Namespace separator (default: ':')
    nsSeparator: ':',

    // Save missing translations (disabled - requires manual review)
    saveMissing: false,

    // Interpolation settings
    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // React-specific settings
    react: {
      useSuspense: true, // Use Suspense for lazy-loading
      bindI18n: 'languageChanged', // Re-render on language change
      bindI18nStore: false, // Don't re-render on resource changes
    },
  });

/**
 * The translation files of every language except English, as chunks Vite emits
 * one per language and fetches only when asked for.
 */
const LOCALE_FILES = import.meta.glob<Record<string, unknown>>('@/modules/i18n/locales/*/*.json');

const loadedLanguages = new Set<string>(['en']);

/** Fetches a language's namespaces and registers them with i18next. */
export async function loadLanguage(language: string): Promise<void> {
  if (loadedLanguages.has(language)) return;

  const prefix = `/src/modules/i18n/locales/${language}/`;
  const entries = Object.entries(LOCALE_FILES).filter(([path]) => path.includes(prefix));
  if (entries.length === 0) return;

  await Promise.all(
    entries.map(async ([path, load]) => {
      const namespace = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');
      const module = (await load()) as { default: Record<string, unknown> };
      i18n.addResourceBundle(language, namespace, module.default, true, true);
    }),
  );

  loadedLanguages.add(language);
}

/**
 * Applies the language the user picked, downloading it first.
 *
 * Awaited by main.tsx before the first render so a Spanish or Japanese user does
 * not watch the interface flash through English. The file is a few KB over the
 * wire and the app already has to fetch its own bundle, so it costs a request,
 * not a wait. If it fails the app still mounts, in English.
 */
export async function loadSavedLanguage(): Promise<void> {
  const saved = getSavedLanguage();
  if (saved === 'en') return;
  try {
    await loadLanguage(saved);
    await i18n.changeLanguage(saved);
  } catch {
    // English is already loaded and remains the fallback.
  }
}

// Save language preference when it changes
i18n.on('languageChanged', (lng: string) => {
  writeUserPreference('userLanguage', lng);
});

// A language chosen on another device arrives with the hydrated preferences,
// after i18n was already initialized with whatever the mirror held.
subscribeToUserPreferences(() => {
  const saved = readUserPreference<string | null>('userLanguage', null);
  if (saved && saved !== i18n.language && languages.some(lang => lang.value === saved)) {
    void loadLanguage(saved).then(() => i18n.changeLanguage(saved));
  }
});

export default i18n;
