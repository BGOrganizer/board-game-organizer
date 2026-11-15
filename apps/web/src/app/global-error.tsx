"use client";

import { Button } from "@heroui/react/button";
import { setupI18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import * as Sentry from "@sentry/nextjs";
import { useEffect, useMemo, useState } from "react";
import { type AppLocale, normalizeLocale } from "@/lib/i18n-locale";
import { messages as messagesEn } from "../../../../messages/en.js";
import { messages as messagesIt } from "../../../../messages/it.js";
import "./globals.css";

const title = msg`Something went wrong`;
const retry = msg`Try again`;

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const [locale, setLocale] = useState<AppLocale>("en");
  const i18n = useMemo(
    () => setupI18n({ locale, messages: { en: messagesEn, it: messagesIt } }),
    [locale],
  );
  useEffect(() => {
    Sentry.captureException(error);
    setLocale(normalizeLocale(navigator.language));
  }, [error]);
  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
        <h1 className="text-xl font-semibold">{i18n._(title)}</h1>
        <Button variant="primary" onPress={reset}>
          {i18n._(retry)}
        </Button>
      </body>
    </html>
  );
}
