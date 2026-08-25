import { type Messages, setupI18n } from "@lingui/core";
import { setI18n } from "@lingui/react/server";
import { headers } from "next/headers";
import { cache } from "react";
import { type AppLocale, detectLocaleFromHeaders, normalizeLocale } from "./i18n-locale";

export {
  type AppLocale,
  detectLocaleFromHeaders,
  normalizeLocale,
  SUPPORTED_LOCALES,
} from "./i18n-locale";

/**
 * Server-side LinguiJS bootstrap for the web app.
 *
 * Locale detection (Phase 0 spec):
 *  - server: the browser's `Accept-Language` header (q-values parsed),
 *    correct SSR locale with no flash of wrong language;
 *  - client fallback: `navigator.language` handled in
 *    `LinguiClientProvider`.
 *
 * The compiled catalogs (`lingui compile` → `messages/{en,it}.js`) are
 * imported lazily per locale. `cache()` keeps a single i18n instance per
 * request, shared by all layouts/pages.
 */

const catalogLoaders: Record<AppLocale, () => Promise<Messages>> = {
  en: () => import("../../../../messages/en.js").then((m) => m.messages),
  it: () => import("../../../../messages/it.js").then((m) => m.messages),
};

/** Loads the compiled catalog for a locale (lazy, per-locale chunk). */
export async function loadCatalog(locale: AppLocale): Promise<Messages> {
  return catalogLoaders[locale]();
}

/**
 * Detects the request locale, loads its catalog, and registers the i18n
 * instance in the React request cache so server components can render
 * translated strings. Idempotent per request (React `cache`).
 */
export const initServerI18n = cache(
  async (): Promise<{
    locale: AppLocale;
    messages: Messages;
  }> => {
    const acceptLanguage = (await headers()).get("accept-language");
    const locale = detectLocaleFromHeaders(acceptLanguage);
    const messages = await loadCatalog(locale);
    setI18n(setupI18n({ locale, messages: { [locale]: messages } }));
    return { locale, messages };
  },
);
