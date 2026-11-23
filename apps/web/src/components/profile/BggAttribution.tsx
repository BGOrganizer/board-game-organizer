"use client";

import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

export function BggAttribution({ children, onOpen }: { children: ReactNode; onOpen?: () => void }) {
  const { t } = useLingui();
  return (
    <div>
      <a
        href="https://boardgamegeek.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t`Powered by BGG — open BoardGameGeek`}
        onClick={
          onOpen
            ? (event) => {
                event.preventDefault();
                onOpen();
              }
            : undefined
        }
        className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span data-theme="light" className="rounded-lg bg-surface p-2">
          {children}
        </span>
      </a>
    </div>
  );
}
