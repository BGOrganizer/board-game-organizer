"use client";

import type { ClientEventRecord } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Dices, Info, UsersRound } from "lucide-react";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { EventPlanningSettingsSummary } from "./EventPlanningSettingsSummary";
import { EventVoteLegendContent } from "./EventVoteLegendContent";

export function EventSectionHeader({
  event,
  section,
  voteDates = false,
  voteLocations = false,
}: {
  event: ClientEventRecord;
  section: "details" | "participants" | "tables";
  voteDates?: boolean;
  voteLocations?: boolean;
}) {
  const { t } = useLingui();
  const sections = {
    details: {
      title: t`Details`,
      label: t`Event details help`,
      icon: Info,
      help: t`To join the event, open Tables, choose a table and sign up.`,
    },
    participants: {
      title: t`Participants`,
      label: t`Event participants help`,
      icon: UsersRound,
      help: t`Players with a seat or a waiting-list place at one or more event tables appear here.`,
    },
    tables: {
      title: t`Tables`,
      label: t`Event tables help`,
      icon: Dices,
      help: t`To take part in the event, register for at least one table.`,
    },
  };
  const { title, label, icon: Icon, help } = sections[section];
  const canExplainProposals =
    section === "details" &&
    event.status === "PLANNING" &&
    event.groupType !== "PUBLIC" &&
    !event.readOnly;
  return (
    <HelpSectionCard title={title} label={label} icon={Icon}>
      <p>
        {event.status === "PLANNING"
          ? help
          : t`Only players with confirmed seats at tables that reached the minimum player count and met the event requirements take part.`}
      </p>
      {section === "details" && !event.personalAccessOnly && !event.sharedResultsOnly ? (
        <div className="space-y-1">
          <p className="font-semibold">{t`Settings`}</p>
          <EventPlanningSettingsSummary event={event} />
        </div>
      ) : null}
      {section === "details" && (voteDates || voteLocations) ? (
        <div className="space-y-2">
          <p className="font-semibold">
            {voteDates && voteLocations
              ? t`Dates, times and locations`
              : voteDates
                ? t`Dates and times`
                : t`Locations`}
          </p>
          <EventVoteLegendContent scope="event" multipleCategories={voteDates && voteLocations} />
        </div>
      ) : null}
      {canExplainProposals && event.allowParticipantDates ? (
        <p>{t`Players seated at an event table can propose other dates and times for a manager to approve.`}</p>
      ) : null}
      {canExplainProposals && event.allowParticipantLocations ? (
        <p>{t`Players seated at an event table can propose other locations for a manager to approve.`}</p>
      ) : null}
    </HelpSectionCard>
  );
}
