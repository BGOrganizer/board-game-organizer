"use client";

import { createQueryClient } from "@board-game-organizer/query";
import { clearSessionQueryCache } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as it } from "../../../../../../messages/it.js";

function SessionQueries({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const generation = useRef(0);
  useLayoutEffect(() => {
    const current = ++generation.current;
    return () => {
      // Strict Mode replays effects without ending the session or its in-flight consent.
      queueMicrotask(() => {
        if (generation.current === current) clearSessionQueryCache(client);
      });
    };
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function InviteProviders({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  initialLocale?: "en" | "it";
}) {
  const { isLoaded, userId, sessionId } = useAuth();
  const owner = !isLoaded ? "loading" : `${userId ?? "anonymous"}:${sessionId ?? ""}`;
  const [i18n] = useState(() => setupI18n({ locale: initialLocale, messages: { en, it } }));
  useEffect(() => {
    const locale = navigator.language.toLowerCase().startsWith("it") ? "it" : "en";
    i18n.activate(locale);
    document.documentElement.lang = locale;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      document.documentElement.classList.toggle("dark", preference.matches);
      document.documentElement.dataset.theme = preference.matches ? "dark" : "light";
    };
    syncTheme();
    preference.addEventListener("change", syncTheme);
    return () => preference.removeEventListener("change", syncTheme);
  }, [i18n]);
  return (
    <I18nProvider i18n={i18n}>
      <SessionQueries key={owner}>{children}</SessionQueries>
    </I18nProvider>
  );
}
