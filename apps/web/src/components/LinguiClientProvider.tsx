"use client";

import { type Messages, setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEffect, useState } from "react";
import { type AppLocale, normalizeLocale } from "@/lib/i18n-locale";
import { messages as messagesEn } from "../../../../messages/en.js";
import { messages as messagesIt } from "../../../../messages/it.js";

const catalogs: Record<AppLocale, Messages> = {
  en: messagesEn,
  it: messagesIt,
};

/**
 * Client-side Lingui provider.
 *
 * The server component (root layout) passes the detected locale and its
 * catalog; this client component keeps the I18n instance in state (the
 * instance itself is not serializable, so it is recreated here). On mount it
 * re-checks `navigator.language` as a client fallback and swaps the catalog
 * when the browser speaks a supported language the server did not honor
 * (e.g. non-browser clients without an Accept-Language header).
 *
 * The two catalogs are imported statically: they are small, and a variable
 * dynamic import would pull Vite's dynamic-import helper (breaking coverage
 * reporting on its virtual module).
 */
export function LinguiClientProvider({
  children,
  initialLocale,
  initialMessages,
}: {
  children: React.ReactNode;
  initialLocale: AppLocale;
  initialMessages: Messages;
}) {
  const [i18n] = useState(() =>
    setupI18n({
      locale: initialLocale,
      messages: { [initialLocale]: initialMessages },
    }),
  );

  useEffect(() => {
    const navigatorLocale = normalizeLocale(
      typeof navigator !== "undefined" ? navigator.language : null,
    );
    if (navigatorLocale !== i18n.locale) {
      // Client fallback: the browser speaks a supported language the server
      // did not honor — activate its catalog.
      i18n.load(navigatorLocale, catalogs[navigatorLocale]);
      i18n.activate(navigatorLocale);
    }
  }, [i18n]);

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
