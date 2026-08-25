/**
 * Locale detection helpers — pure, shared by server and client code.
 * Kept OUT of i18n.ts so client components can import them without pulling
 * in `next/headers` (server-only).
 */

export const SUPPORTED_LOCALES = ["en", "it"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** Maps any locale tag to a supported app locale (default: en). */
export function normalizeLocale(value: string | null | undefined): AppLocale {
  const primary = value?.split("-")[0]?.toLowerCase();
  return primary === "it" ? "it" : "en";
}

/** Best-supported locale from an Accept-Language header, respecting q-values. */
export function detectLocaleFromHeaders(acceptLanguage: string | null | undefined): AppLocale {
  if (!acceptLanguage) return "en";
  const candidates = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((c) => c.tag && !Number.isNaN(c.q) && c.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    if (normalizeLocale(tag) === "it") return "it";
  }
  return "en";
}
