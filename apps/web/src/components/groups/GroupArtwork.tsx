"use client";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { Crown } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
export function GroupArtwork({
  group,
}: {
  group: Pick<GroupRecordResponse, "name" | "logo" | "role">;
}) {
  const { t } = useLingui();
  return (
    <span className="relative size-16 shrink-0">
      {group.logo ? (
        // biome-ignore lint/performance/noImgElement: Authenticated, optimized MongoDB data URI, not a remote image.
        <img
          src={group.logo}
          alt=""
          width={64}
          height={64}
          className="size-16 rounded-xl object-contain"
        />
      ) : (
        <AnimatedDicebearArtwork seed={group.name} variant="landscape" />
      )}
      {group.role === "admin" ? (
        <span
          role="img"
          aria-label={t`Group admin`}
          className="absolute left-0 top-0 rounded-br-lg bg-surface p-1"
        >
          <Crown aria-hidden className="size-4 text-warning" />
        </span>
      ) : null}
      {group.role === "invited" || group.role === "requested" ? (
        <PendingArtworkBadge
          kind={group.role === "invited" ? "invitation" : "request"}
          label={group.role === "invited" ? t`Invitation received` : t`Membership requested`}
        />
      ) : null}
    </span>
  );
}
