"use client";
import { useLingui } from "@lingui/react/macro";
import Image from "next/image";
export function ProfileBggAttribution() {
  const { t } = useLingui();
  return (
    <div>
      <a
        href="https://boardgamegeek.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t`Powered by BGG — open BoardGameGeek`}
        className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span data-theme="light" className="rounded-lg bg-surface p-2">
          <Image
            src="/bgg-powered.png"
            width={120}
            height={40}
            alt={t`Powered by BGG`}
            className="h-10 w-30 object-contain"
          />
        </span>
      </a>
    </div>
  );
}
