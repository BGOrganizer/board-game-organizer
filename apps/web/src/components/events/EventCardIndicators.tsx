"use client";

import type { ClientEventRecord } from "@board-game-organizer/shared";
import {
  eventCardRoles,
  eventPendingAction,
  eventRecordVisibility,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Globe, LockKeyhole, Settings } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { EventCardStatusPopover } from "./EventCardStatusPopover";
import { EventPlanningSettingsSummary } from "./EventPlanningSettingsSummary";
import { EventRolePopover } from "./EventRolePopover";

export function EventCardIndicators({ event }: { event: ClientEventRecord }) {
  const { t } = useLingui();
  const roles = eventCardRoles(event);
  const publicEvent = eventRecordVisibility(event, event.groupType) === "PUBLIC";
  return (
    <>
      <EventRolePopover
        roles={roles}
        action={eventPendingAction(event)}
        pending={!!event.optimistic}
        description={t`Your roles in this event:`}
      />
      <HelpPopover
        size="compact"
        label={publicEvent ? t`Public event` : t`Private event`}
        title={publicEvent ? t`Public event` : t`Private event`}
        icon={publicEvent ? Globe : LockKeyhole}
        tone={publicEvent ? "accent" : "muted"}
        triggerClassName="bg-default"
      >
        <p>
          {publicEvent
            ? t`Authenticated users can enroll without joining the group.`
            : t`Participation is limited to authorized group members or invited users.`}
        </p>
      </HelpPopover>
      {!event.sharedResultsOnly && !event.personalAccessOnly ? (
        <HelpPopover
          size="compact"
          label={t`Settings`}
          title={t`Settings`}
          icon={Settings}
          triggerClassName="bg-default"
        >
          <EventPlanningSettingsSummary event={event} />
        </HelpPopover>
      ) : null}
      <EventCardStatusPopover event={event} roles={roles} />
    </>
  );
}
