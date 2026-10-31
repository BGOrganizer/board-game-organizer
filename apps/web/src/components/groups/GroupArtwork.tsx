"use client";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { Crown } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
export function GroupArtwork({
  group,
  size = 64,
}: {
  group: Pick<GroupRecordResponse, "name" | "logo" | "role">;
  size?: number;
}) {
  const { t } = useLingui();
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {group.logo ? (
        // biome-ignore lint/performance/noImgElement: Authenticated, optimized MongoDB data URI, not a remote image.
        <img
          src={group.logo}
          alt=""
          width={size}
          height={size}
          className="rounded-xl object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <AnimatedDicebearArtwork seed={group.name} variant="landscape" size={size} />
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
