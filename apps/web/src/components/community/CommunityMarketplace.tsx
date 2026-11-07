"use client";
import { useLingui } from "@lingui/react/macro";
import { Store } from "lucide-react";
export function CommunityMarketplace() {
  const { t } = useLingui();
  return (
    <section
      className="flex min-h-80 flex-col items-center justify-center gap-3 px-5 text-center"
      aria-label={t`Marketplace`}
    >
      <Store className="size-14 text-muted" aria-hidden />
      <h2 className="text-lg font-semibold">{t`Marketplace`}</h2>
      <p className="font-medium text-foreground">{t`Coming soon`}</p>
      <p className="max-w-md text-sm text-muted">{t`A place to buy, sell and trade board games with the BGO community.`}</p>
    </section>
  );
}
