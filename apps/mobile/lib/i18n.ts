/**
 * i18n setup for the Hunty mobile app.
 *
 * Locale is resolved from the device via expo-localization so the UI
 * language tracks the system setting automatically. Falls back to "en".
 *
 * Usage:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   t('dashboard.title')
 */

import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';

// Derive the best-match BCP-47 language tag from the device locale list.
// expo-localization returns tags like "en-US", "fr-FR", "es-419".
// We normalize to the two-letter base code so we can match our resource files.
function resolveDeviceLocale(): string {
  const locales = getLocales();
  if (locales.length > 0) {
    const tag = locales[0].languageTag ?? locales[0].languageCode ?? 'en';
    return tag.split('-')[0]; // "en-US" → "en"
  }
  return 'en';
}

const deviceLocale = resolveDeviceLocale();

void i18next.use(initReactI18next).init({
  // Resolved from device; falls back to "en" if no resource file found.
  lng: deviceLocale,
  fallbackLng: 'en',

  // String resources keyed by locale code.
  resources: {
    en: { translation: en },
  },

  // i18next uses {{}} interpolation by default; keep it explicit.
  interpolation: {
    escapeValue: false, // React already escapes JSX output.
  },

  // Don't suspend rendering during init; resources are bundled synchronously.
  initImmediate: false,
});

export default i18next;
