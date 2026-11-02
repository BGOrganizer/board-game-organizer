"use client";
import type { ParticipationIndicator, PendingAction } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, Crown, ListOrdered, Mail, UserRoundCheck, UserRoundPlus } from "lucide-react";
import { HelpPopover } from "./HelpPopover";

/** A list-card action, outside its navigation link. Unknown seats are never guessed. */
export function ArtworkStatusPopover({
  kind,
  label,
  action,
}: {
  kind: ParticipationIndicator | "admin" | "member" | undefined;
  label?: string;
  action?: PendingAction | null;
}) {
  const { t } = useLingui();
  if (kind === undefined && !action)
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
      description: t`You have received an invitation.`,
    },
    waiting: {
      icon: ListOrdered,
      label: t`Waiting list`,
      description: t`You are on the waiting list, not assigned a place.`,
    },
    admin: { icon: Crown, label: t`Administrator`, description: t`You administer this item.` },
    member: {
      icon: UserRoundCheck,
      label: t`Group member`,
      description: t`You are a member of this group.`,
    },
  };
  const state = states[kind ?? "invitation"];
  const title = label ?? state.label;
  const actionLabel = action === "review" ? t`Requests to review` : t`Reply required`;
  const ActionIcon = action === "review" ? UserRoundPlus : Mail;
  return (
    <HelpPopover
      label={action ? `${title} · ${actionLabel}` : title}
      title={title}
      icon={state.icon}
      tone={kind === "confirmed" || kind === "member" ? "success" : "warning"}
      indicator={
        action && state.icon !== ActionIcon ? (
          <span
            className="pointer-events-none absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-surface text-warning-soft-foreground"
            aria-hidden
          >
            <ActionIcon className="size-3" />
          </span>
        ) : undefined
      }
    >
      <p>{state.description}</p>
      {action ? (
        <p className="mt-2">
          {action === "review"
            ? t`Open Members to approve or reject membership requests.`
            : t`Open details to accept or decline your invitation.`}
        </p>
      ) : null}
    </HelpPopover>
  );
}
