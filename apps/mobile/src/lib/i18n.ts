import { type I18n, setupI18n } from "@lingui/core";
import * as Localization from "expo-localization";
import { messages as messagesEn } from "../../../../messages/en.js";
import { messages as messagesIt } from "../../../../messages/it.js";

/**
 * Mobile LinguiJS bootstrap.
 *
 * Locale detection (Phase 0 spec): the device locale via
 * `expo-localization` (`getLocales()[0].languageCode`), falling back to `en`
 * for unsupported languages. The compiled catalogs (`messages/{en,it}.js`)
 * are imported statically — Metro requires static imports, and the two
 * catalogs are small.
 */

export const SUPPORTED_LOCALES = ["en", "it"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const catalogs: Record<AppLocale, typeof messagesEn> = {
  en: messagesEn,
  it: messagesIt,
};

/** Maps any locale tag to a supported app locale (default: en). */
export function normalizeLocale(value: string | null | undefined): AppLocale {
  return value?.split("-")[0]?.toLowerCase() === "it" ? "it" : "en";
}

/** Device locale (expo-localization), normalized to a supported locale. */
export function getDeviceLocale(): AppLocale {
  return normalizeLocale(Localization.getLocales()[0]?.languageCode);
}

/** Creates an i18n instance preloaded with the given locale's catalog. */
export function createAppI18n(locale: AppLocale = getDeviceLocale()): I18n {
  return setupI18n({
    locale,
    messages: { [locale]: catalogs[locale] },
  });
}
