"use client";

import { useLingui } from "@lingui/react/macro";
import Image from "next/image";
import { BggAttribution } from "./BggAttribution";

export function ProfileBggAttribution() {
  const { t } = useLingui();
  return (
    <BggAttribution>
      <Image
        src="/bgg-powered.png"
        width={120}
        height={40}
        alt={t`Powered by BGG`}
        className="h-10 w-30 object-contain"
      />
    </BggAttribution>
  );
}
