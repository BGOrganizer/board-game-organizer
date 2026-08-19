import { type I18n, setupI18n } from "@lingui/core";
import { useLingui } from "@lingui/react";
import * as Localization from "expo-localization";
import { useCallback } from "react";
import { messages as messagesEn } from "../../../../messages/en.js";
import { messages as messagesIt } from "../../../../messages/it.js";

/**
 * Mobile LinguiJS bootstrap (RUNTIME, no Babel macro).
 *
 * Locale detection (Phase 0 spec): the device locale via
 * `expo-localization` (`getLocales()[0].languageCode`), falling back to `en`
 * for unsupported languages. The compiled catalogs (`messages/{en,it}.js`)
 * are imported statically — Metro requires static imports, and the two
 * catalogs are small.
 *
 * IMPORTANT: mobile deliberately does NOT use the Lingui Babel macro
 * (`@lingui/react/macro` + a custom `babel.config.js`). The custom Babel
 * config forced the worklets plugin (react-native-worklets/reanimated 4.x)
 * to run under @babel/core@7 while the native runtime is built for Babel 8,
 * producing a bundle that crashed at launch on real devices (release +
 * New Architecture). Runtime i18n keeps mobile's Babel setup identical to
 * main and translations still work via the shared catalog.
 */

export const SUPPORTED_LOCALES = ["en", "it"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const catalogs: Record<AppLocale, typeof messagesEn> = {
  en: messagesEn,
  it: messagesIt,
};

/** Reverse index: English source text → catalog message id (hash). */
const idByEnglish: Record<string, string> = {};
for (const [id, [text]] of Object.entries(messagesEn) as [string, string[]][]) {
  if (typeof text === "string") idByEnglish[text] = id;
}

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

/**
 * Runtime `t` translator: maps an English source string to its shared
 * catalog id and returns the translation for the active locale. Usable in
 * components (via the hook) without the Babel macro transform.
 */
export function translate(i18n: I18n, message: string): string {
  const id = idByEnglish[message] ?? message;
  return i18n.t({ id, message });
}

/** React hook: `const t = useT();` then `t("Sign in")`. */
export function useT(): (message: string) => string {
  const { i18n } = useLingui();
  return useCallback((message: string) => translate(i18n, message), [i18n]);
}
