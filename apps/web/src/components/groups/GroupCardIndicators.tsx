"use client";

import type { ClientGroupRecord } from "@board-game-organizer/shared";
import { formatLocationAddress, groupPendingAction } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Globe, LockKeyhole, MapPin, UsersRound } from "lucide-react";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { GroupStatusBadge } from "./GroupStatusBadge";

export function GroupCardIndicators({ group }: { group: ClientGroupRecord }) {
  const { t, i18n } = useLingui();
  const publicGroup = group.type === "PUBLIC";
  const indicator = group.optimistic
    ? null
    : group.role === "admin"
      ? "admin"
      : group.role === "moderator"
        ? "manager"
        : group.role === "accepted"
          ? "member"
          : group.role === "invited"
            ? "invitation"
            : group.role === "requested"
              ? "request"
              : null;
  const visibility = publicGroup ? t`Public` : t`Private`;
  return (
    <>
      {indicator ? (
        <ArtworkStatusPopover
          size="compact"
          kind={indicator}
          action={groupPendingAction(group)}
          label={
            group.role === "admin"
              ? t`Admin`
              : group.role === "moderator"
                ? t`Moderator`
                : group.role === "requested"
                  ? t`Member with pending request`
                  : group.role === "invited"
                    ? t`Member with pending invitation`
                    : t`Accepted member`
          }
        />
      ) : null}
      <HelpPopover
        size="compact"
        label={visibility}
        title={visibility}
        icon={publicGroup ? Globe : LockKeyhole}
        tone={publicGroup ? "accent" : "muted"}
        triggerClassName="bg-default"
        className="w-[min(24rem,calc(100vw-2rem))]"
      >
        <div className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain">
          <p>
            {publicGroup
              ? t`Public groups accept membership requests.`
              : t`Private groups are invitation-only.`}
          </p>
          <p className="flex items-center gap-2">
            <UsersRound aria-hidden className="size-4 shrink-0 text-muted" />
            {i18n._({
              id: "group.card.members",
              message: "{count, plural, one {# Member} other {# Members}}",
              values: { count: group.memberCount },
            })}
          </p>
          {group.canViewEvents && group.eventCount !== null ? (
            <p className="flex items-center gap-2">
              <CalendarDays aria-hidden className="size-4 shrink-0 text-muted" />
              {i18n._({
                id: "group.card.events",
                message: "{count, plural, one {# Event} other {# Events}}",
                values: { count: group.eventCount },
              })}
            </p>
          ) : null}
          {group.location ? (
            <p className="flex items-start gap-2">
              <MapPin aria-hidden className="size-4 shrink-0 text-muted" />
              <span>{formatLocationAddress(group.location.address)}</span>
            </p>
          ) : null}
        </div>
      </HelpPopover>
      {publicGroup && !group.optimistic ? <GroupStatusBadge group={group} withPopover /> : null}
    </>
  );
}
