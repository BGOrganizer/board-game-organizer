"use client";
import type { OrganizationResponse } from "@board-game-organizer/schemas";

import { Crown } from "lucide-react";

export function OrganizationArtwork({ organization }: { organization: OrganizationResponse }) {
  return (
    <span className="relative size-16 shrink-0">
      {/* biome-ignore lint/performance/noImgElement: Authenticated, optimized MongoDB data URI, not a remote image. */}
      <img src={organization.logo} alt="" className="size-16 rounded-xl object-contain" />
      {organization.role === "admin" ? (
        <Crown aria-hidden className="absolute left-0 top-0 size-4 text-warning" />
      ) : null}
    </span>
  );
}
