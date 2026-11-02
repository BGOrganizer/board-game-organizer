"use client";
import type { ParticipationIndicator } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, Crown, ListOrdered, Mail, UserRoundCheck } from "lucide-react";
import { HelpPopover } from "./HelpPopover";

/** A list-card action, outside its navigation link. Unknown seats are never guessed. */
export function ArtworkStatusPopover({
  kind,
  label,
}: {
  kind: ParticipationIndicator | "admin" | undefined;
  label?: string;
}) {
  const { t } = useLingui();
  if (kind === undefined)
    return <Skeleton aria-label={t`Loading…`} className="size-11 rounded-xl" />;
  const states = {
    confirmed: {
      icon: UserRoundCheck,
      label: t`Confirmed player`,
      description: t`You have a confirmed place at a table.`,
    },
    request: {
      icon: Clock3,
      label: t`Participation requested`,
      description: t`Your request is awaiting approval.`,
    },
    invitation: {
      icon: Mail,
      label: t`Invitation received`,
      description: t`You have an invitation awaiting your response.`,
    },
    waiting: {
      icon: ListOrdered,
      label: t`Waiting list`,
      description: t`You are on the waiting list, not assigned a place.`,
    },
    admin: { icon: Crown, label: t`Administrator`, description: t`You administer this item.` },
  };
  const state = states[kind];
  const title = label ?? state.label;
  return (
    <HelpPopover
      label={title}
      title={title}
      icon={state.icon}
      tone={kind === "confirmed" ? "success" : "warning"}
    >
      <p>{state.description}</p>
    </HelpPopover>
  );
}
