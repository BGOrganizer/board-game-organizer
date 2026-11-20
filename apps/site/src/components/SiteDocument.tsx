import type { ReactNode } from "react";
import type { Locale } from "../lib/copy";
import "../app/globals.css";

export function SiteDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html className="light" data-theme="light" lang={locale}>
      <body id="top">{children}</body>
    </html>
  );
}
