"use client";

import type {
  ChangeEventVoteInput,
  EventVote,
  PlannedEventResponse,
  PlannedTableResponse,
  TableGuestVotes,
} from "@board-game-organizer/schemas";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import { eventAvailabilityVoteIsAllowed, eventOptionsRequireVote } from "../eventJoinAvailability";
import { eventDateWall } from "../eventRecordPolicy";
import { useEventRecord } from "./useEventRecords";
import { useTableGuestActions, useTableGuestVotes } from "./useTableGuestActions";

type Vote = Exclude<EventVote, "UNKNOWN">;
type VoteChoice = {
  key: string;
  label: string;
  value: EventVote | undefined;
  allowNo: boolean;
  change: (vote: Vote) => ChangeEventVoteInput;
};

export function canEditTableGuestVotes(table: PlannedTableResponse) {
  return (
    table.canManage === true &&
    !table.readOnly &&
    table.eventStatus === "PLANNING" &&
    table.groupType !== "PUBLIC" &&
    (eventOptionsRequireVote(table.games) ||
      (table.eventSchedule?.dateCount ?? 0) > 1 ||
      (table.eventSchedule?.locationCount ?? 0) > 1)
  );
}

function groups(event: PlannedEventResponse, table: PlannedTableResponse, votes: TableGuestVotes) {
  const games = table.games.map(({ gameId }) => ({ id: String(gameId) }));
  return [
    {
      kind: "date",
      rows: eventOptionsRequireVote(event.dates)
        ? event.dates.map(
            ({ id, ...option }): VoteChoice => ({
              key: `date:${id}`,
              label: eventDateWall(event, { id, ...option }).replace("T", " "),
              value: votes.dateVotes[id],
              allowNo: eventAvailabilityVoteIsAllowed(event.dates, votes.dateVotes, id, "NO"),
              change: (vote) => ({ kind: "date", optionId: id, vote }),
            }),
          )
        : [],
    },
    {
      kind: "location",
      rows: eventOptionsRequireVote(event.locations)
        ? event.locations.map(
            ({ id, name }): VoteChoice => ({
              key: `location:${id}`,
              label: name,
              value: votes.locationVotes[id],
              allowNo: eventAvailabilityVoteIsAllowed(
                event.locations,
                votes.locationVotes,
                id,
                "NO",
              ),
              change: (vote) => ({ kind: "location", optionId: id, vote }),
            }),
          )
        : [],
    },
    {
      kind: "game",
      rows: eventOptionsRequireVote(table.games)
        ? table.games.map(
            ({ gameId }): VoteChoice => ({
              key: `game:${gameId}`,
              label: table.gamesDetail.find(({ id }) => id === gameId)?.name ?? "",
              value: votes.gameVotes[String(gameId)],
              allowNo: eventAvailabilityVoteIsAllowed(games, votes.gameVotes, String(gameId), "NO"),
              change: (vote) => ({ kind: "game", tableId: table.id, gameId, vote }),
            }),
          )
        : [],
    },
  ].filter(({ rows }) => rows.length);
}

export function useTableGuestVoteForm(
  options: CommunityApiOptions,
  table: PlannedTableResponse,
  registrationId: string,
) {
  const allowed = canEditTableGuestVotes(table);
  const event = useEventRecord(
    { ...options, enabled: allowed && options.enabled !== false },
    table.eventId,
  );
  const canVote =
    allowed &&
    event.data?.status === "PLANNING" &&
    event.data.canManage === true &&
    !event.isPlaceholderData &&
    !communityAccessDenied(event.error);
  const load = useTableGuestVotes(
    { ...options, enabled: canVote && options.enabled !== false },
    table.eventId,
    table.id,
    registrationId,
  );
  const actions = useTableGuestActions(options, table.eventId, table.id);
  const unavailable =
    !allowed ||
    (!!event.data && !event.isPlaceholderData && !canVote) ||
    communityAccessDenied(load.error);
  const blocked = unavailable || event.isError || load.isError;
  const sections =
    canVote && !blocked && event.data && load.data ? groups(event.data, table, load.data) : [];
  return {
    sections,
    loading: !blocked && (!canVote || load.isPending),
    error: blocked,
    unavailable,
    saving: actions.vote.isPending,
    failed: actions.vote.isError,
    refresh() {
      if (canVote) void load.refetch();
      else if (allowed) void event.refetch();
    },
    save(option: VoteChoice, vote: Vote) {
      if (
        canVote &&
        !blocked &&
        !actions.vote.isPending &&
        option.value !== vote &&
        (vote !== "NO" || option.allowNo)
      )
        actions.vote.mutate({ registrationId, vote: option.change(vote) });
    },
  };
}
