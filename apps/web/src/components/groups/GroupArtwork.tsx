"use client";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { Crown } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
export function GroupArtwork({
  group,
  size = 64,
  status = "overlay",
  presentation = "thumbnail",
}: {
  group: Pick<GroupRecordResponse, "id" | "logo" | "role">;
  size?: number;
  status?: "overlay" | "none";
  presentation?: "thumbnail" | "background";
}) {
  const { t } = useLingui();
  return (
    <span
      className={presentation === "background" ? "absolute inset-0" : "relative shrink-0"}
      style={presentation === "background" ? undefined : { width: size, height: size }}
    >
      {group.logo ? (
        // biome-ignore lint/performance/noImgElement: Authenticated, optimized MongoDB data URI, not a remote image.
        <img
          src={group.logo}
          alt=""
          width={size}
          height={size}
          className="rounded-xl object-contain"
          style={
            presentation === "background"
              ? { width: "100%", height: "100%" }
              : { width: size, height: size }
          }
        />
      ) : (
        <AnimatedDicebearArtwork
          seed={group.id}
          variant="landscape"
          size={size}
          presentation={presentation}
        />
      )}
      {status === "overlay" && group.role === "admin" ? (
        <span
          role="img"
          aria-label={t`Group admin`}
          className="absolute left-0 top-0 rounded-br-lg bg-surface p-1"
        >
          <Crown aria-hidden className="size-4 text-warning" />
        </span>
      ) : null}
      {status === "overlay" && (group.role === "invited" || group.role === "requested") ? (
        <PendingArtworkBadge
          kind={group.role === "invited" ? "invitation" : "request"}
          label={group.role === "invited" ? t`Invitation received` : t`Membership requested`}
        />
      ) : null}
    </span>
  );
}
