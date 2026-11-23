"use client";

import {
  type EventVote,
  notificationItemId,
  type PlannedEventResponse,
} from "@board-game-organizer/schemas";
import {
  type ClientEventRecord,
  eventAvailabilityVoteIsAllowed,
  eventDateWall,
  eventLocalToIso,
  eventOptionsRequireVote,
  hasOptionVoters,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { ExpandableGroupedRow } from "@/components/common/ui/ExpandableGroupedRow";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EventSectionHeader } from "./EventSectionHeader";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteLegend } from "./EventVoteLegend";
import { OptionVoteVoters } from "./OptionVoteVoters";

export function EventOverview({
  event,
  namedVotes,
  onVote,
  busy = false,
  dateProposals,
  locationProposals,
  group,
}: {
  event: ClientEventRecord;
  namedVotes?: PlannedEventResponse["voteVoters"];
  onVote?: (
    kind: "date" | "location",
    optionId: string,
    vote: Exclude<EventVote, "UNKNOWN">,
  ) => void;
  busy?: boolean;
  dateProposals?: ReactNode;
  locationProposals?: ReactNode;
  group?: ReactNode;
}) {
  const { t } = useLingui();
  const canVote = event.canVote && Boolean(onVote);
  const voting = event.status === "PLANNING" && event.groupType !== "PUBLIC";
  const voteDates = voting && eventOptionsRequireVote(event.dates, event.dateVoteRequired);
  const voteLocations = voting && eventOptionsRequireVote(event.locations, event.locationVoteRequired);
  return (
    <>
      <EventSectionHeader
        event={event}
        section="details"
        voteDates={voteDates}
        voteLocations={voteLocations}
      />
      <NotificationItem itemId={notificationItemId(event.id, "overview")} />
      {event.readOnly ? (
        <p className="text-sm text-muted">
          {event.personalAccessOnly
            ? t`Personal access to your table. Group details are hidden.`
            : event.sharedResultsOnly
              ? t`Shared finalized results. Group details are hidden.`
              : t`Public event. Group membership is not required to participate.`}
        </p>
      ) : null}
      <section
        aria-label={event.groupType === "PUBLIC" ? t`Start Date and Time` : t`Dates and times`}
        className="space-y-3"
      >
        <NotificationItem itemId={notificationItemId(event.id, "dates")}>
          <div className="flex items-center gap-1">
            <h2 className="font-semibold">
              {event.groupType === "PUBLIC" ? t`Start Date and Time` : t`Dates and times`}
            </h2>
            {voteDates ? (
              <EventVoteLegend label={t`Dates and times`} singleOption={event.dateVoteRequired} />
            ) : null}
          </div>
        </NotificationItem>
        <GroupedList>
          {event.dates
            .filter(
              (row) =>
                event.status === "PLANNING" ||
                !event.confirmed ||
                row.id === event.confirmed.dateId,
            )
            .map((row) => {
              const voters = voteDates ? namedVotes?.dates[row.id] : undefined;
              const label = eventDateWall(event, row).replace("T", " ");
              const schedule = (
                <div key="schedule" className="flex min-w-0 flex-1 items-center gap-2">
                  <DateTimeInfo
                    startsAt={eventLocalToIso(eventDateWall(event, row), event.timeZone)}
                    timeZone={event.timeZone}
                  />
                  <NotificationItem itemId={notificationItemId(event.id, "date", row.id)} />
                </div>
              );
              const voteAction =
                (voteDates && canVote) || voters ? (
                  <EventVoteButtons
                    key="vote"
                    compact
                    label={label}
                    voters={voters}
                    readOnly={!canVote}
                    value={event.myVotes?.dateVotes[row.id]}
                    disabledVotes={
                      eventAvailabilityVoteIsAllowed(
                        event.dates,
                        event.myVotes?.dateVotes ?? {},
                        row.id,
                        "NO",
                        event.dateVoteRequired,
                      )
                        ? []
                        : ["NO"]
                    }
                    busy={busy}
                    onChange={(vote) => onVote?.("date", row.id, vote)}
                  />
                ) : null;
              return hasOptionVoters(voters) ? (
                <ExpandableGroupedRow
                  key={row.id}
                  summary={schedule}
                  actions={voteAction}
                  disclosure={{
                    label: `${t`Vote summary`}: ${label}`,
                    triggerText: t`Votes`,
                    content: <OptionVoteVoters label={label} voters={voters} />,
                  }}
                />
              ) : (
                <GroupedRow key={row.id} className="flex-wrap">
                  {schedule}
                  {voteAction}
                </GroupedRow>
              );
            })}
        </GroupedList>
      </section>
      {dateProposals}
      {event.endsAt ? (
        <section aria-label={t`End Date and Time`} className="space-y-3">
          <h2 className="font-semibold">{t`End Date and Time`}</h2>
          <GroupedList>
            <GroupedRow>
              <DateTimeInfo
                startsAt={event.endsAt}
                timeZone={event.timeZone}
                timeLabel={t`End time`}
              />
            </GroupedRow>
          </GroupedList>
        </section>
      ) : null}
      {event.bookingClosesAt ? (
        <section aria-label={t`Registration Deadline Date and Time`} className="space-y-3">
          <h2 className="font-semibold">{t`Registration Deadline Date and Time`}</h2>
          <GroupedList>
            <GroupedRow>
              <DateTimeInfo
                startsAt={event.bookingClosesAt}
                timeZone={event.timeZone}
                timeLabel={t`Registration Deadline Date and Time`}
              />
            </GroupedRow>
          </GroupedList>
        </section>
      ) : null}
      <section aria-label={t`Locations`} className="space-y-3">
        <NotificationItem itemId={notificationItemId(event.id, "locations")}>
          <div className="flex items-center gap-1">
            <h2 className="font-semibold">{t`Locations`}</h2>
            {voteLocations ? (
              <EventVoteLegend label={t`Locations`} singleOption={event.locationVoteRequired} />
            ) : null}
          </div>
        </NotificationItem>
        <GroupedList>
          {event.locations
            .filter(
              (row) =>
                event.status === "PLANNING" ||
                !event.confirmed ||
                row.id === event.confirmed.locationId,
            )
            .map((row) => {
              const voters = voteLocations ? namedVotes?.locations[row.id] : undefined;
              return (
                <LocationListRow
                  key={row.id}
                  name={row.name}
                  address={row.address}
                  disclosure={
                    hasOptionVoters(voters)
                      ? {
                          label: `${t`Vote summary`}: ${row.name}`,
                          triggerText: t`Votes`,
                          content: <OptionVoteVoters label={row.name} voters={voters} />,
                        }
                      : undefined
                  }
                  titleAccessory={
                    <NotificationItem itemId={notificationItemId(event.id, "location", row.id)} />
                  }
                  actions={
                    (voteLocations && canVote) || voters ? (
                      <EventVoteButtons
                        compact
                        voters={voters}
                        readOnly={!canVote}
                        label={row.name}
                        value={event.myVotes?.locationVotes[row.id]}
                        disabledVotes={
                          eventAvailabilityVoteIsAllowed(
                            event.locations,
                            event.myVotes?.locationVotes ?? {},
                            row.id,
                            "NO",
                            event.locationVoteRequired,
                          )
                            ? []
                            : ["NO"]
                        }
                        busy={busy}
                        onChange={(vote) => onVote?.("location", row.id, vote)}
                      />
                    ) : undefined
                  }
                />
              );
            })}
        </GroupedList>
        {locationProposals}
      </section>
      {group}
    </>
  );
}
