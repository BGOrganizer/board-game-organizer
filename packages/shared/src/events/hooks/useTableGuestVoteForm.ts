"use client";

import type {
  BggSearchItem,
  ChangeEventVoteInput,
  EventVote,
  PlannedEventResponse,
  PlannedTableResponse,
  TableGuestVotes,
} from "@board-game-organizer/schemas";
import { useRef, useState } from "react";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import { eventLocalToIso } from "../eventForm";
import { eventAvailabilityVoteIsAllowed, eventOptionsRequireVote } from "../eventJoinAvailability";
import { eventDateWall } from "../eventRecordPolicy";
import { useEventRecord } from "./useEventRecords";
import { useTableGuestActions, useTableGuestVotes } from "./useTableGuestActions";

type Vote = Exclude<EventVote, "UNKNOWN">;
const voteFields = { date: "dateVotes", location: "locationVotes", game: "gameVotes" } as const;
type VoteChoice = {
  key: string;
  label: string;
  value: EventVote | undefined;
  allowNo: boolean;
  change: (vote: Vote) => ChangeEventVoteInput;
} & (
  | { kind: "date"; startsAt: string; timeZone: string }
  | { kind: "location"; address: string }
  | { kind: "game"; game?: BggSearchItem }
);

export function canEditTableGuestVotes(table: PlannedTableResponse) {
  return (
    table.canManage === true &&
    !table.readOnly &&
    table.eventStatus === "PLANNING" &&
    table.groupType !== "PUBLIC" &&
    (eventOptionsRequireVote(table.games, table.gameVoteRequired) ||
      (table.eventSchedule?.dateCount ?? 0) > 1 ||
      (table.eventSchedule?.locationCount ?? 0) > 1 ||
      table.eventSchedule?.dateVoteRequired === true ||
      table.eventSchedule?.locationVoteRequired === true)
  );
}

function groups(event: PlannedEventResponse, table: PlannedTableResponse, votes: TableGuestVotes) {
  const games = table.games.map(({ gameId }) => ({ id: String(gameId) }));
  const sections: { kind: VoteChoice["kind"]; rows: VoteChoice[] }[] = [
    {
      kind: "date",
      rows: eventOptionsRequireVote(event.dates, event.dateVoteRequired)
        ? event.dates.map((option): VoteChoice => {
            const wall = eventDateWall(event, option);
            return {
              kind: "date",
              startsAt: eventLocalToIso(wall, event.timeZone),
              timeZone: event.timeZone,
              key: `date:${option.id}`,
              label: wall.replace("T", " "),
              value: votes.dateVotes[option.id],
              allowNo: eventAvailabilityVoteIsAllowed(
                event.dates,
                votes.dateVotes,
                option.id,
                "NO",
                event.dateVoteRequired,
              ),
              change: (vote) => ({ kind: "date", optionId: option.id, vote }),
            };
          })
        : [],
    },
    {
      kind: "location",
      rows: eventOptionsRequireVote(event.locations, event.locationVoteRequired)
        ? event.locations.map(
            ({ id, name, address }): VoteChoice => ({
              kind: "location",
              address,
              key: `location:${id}`,
              label: name,
              value: votes.locationVotes[id],
              allowNo: eventAvailabilityVoteIsAllowed(
                event.locations,
                votes.locationVotes,
                id,
                "NO",
                event.locationVoteRequired,
              ),
              change: (vote) => ({ kind: "location", optionId: id, vote }),
            }),
          )
        : [],
    },
    {
      kind: "game",
      rows: eventOptionsRequireVote(table.games, table.gameVoteRequired)
        ? table.games.map(({ gameId }): VoteChoice => {
            const game = table.gamesDetail.find(({ id }) => id === gameId);
            return {
              kind: "game",
              game,
              key: `game:${gameId}`,
              label: game?.name ?? "",
              value: votes.gameVotes[String(gameId)],
              allowNo: eventAvailabilityVoteIsAllowed(
                games,
                votes.gameVotes,
                String(gameId),
                "NO",
                table.gameVoteRequired,
              ),
              change: (vote) => ({ kind: "game", tableId: table.id, gameId, vote }),
            };
          })
        : [],
    },
  ];
  return sections.filter(({ rows }) => rows.length);
}

export function useTableGuestVoteForm(
  options: CommunityApiOptions,
  table: PlannedTableResponse,
  registrationId: string,
) {
  const [draft, setDraft] = useState<Record<string, ChangeEventVoteInput>>({});
  const submitting = useRef(false);
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
  const saved = load.data;
  const changes: ChangeEventVoteInput[] = [];
  const displayed = saved && {
    ...saved,
    dateVotes: { ...saved.dateVotes },
    locationVotes: { ...saved.locationVotes },
    gameVotes: { ...saved.gameVotes },
  };
  if (saved && displayed) {
    for (const input of Object.values(draft)) {
      const field = voteFields[input.kind];
      const key = input.kind === "game" ? String(input.gameId) : input.optionId;
      if (saved[field][key] !== input.vote) changes.push(input);
      displayed[field][key] = input.vote;
    }
  }
  const sections =
    canVote && !blocked && event.data && displayed ? groups(event.data, table, displayed) : [];
  const canSubmit = canVote && !blocked && changes.length > 0 && !actions.vote.isPending;
  return {
    sections,
    loading: !blocked && (!canVote || load.isPending),
    error: blocked,
    unavailable,
    saving: actions.vote.isPending,
    failed: actions.vote.isError,
    canSubmit,
    refresh() {
      if (canVote) void load.refetch();
      else if (allowed) void event.refetch();
    },
    choose(option: VoteChoice, vote: Vote) {
      if (
        canVote &&
        !blocked &&
        !submitting.current &&
        option.value !== vote &&
        (vote !== "NO" || option.allowNo)
      )
        setDraft((current) => ({ ...current, [option.key]: option.change(vote) }));
    },
    submit(onSaved: () => void) {
      if (!canSubmit || submitting.current) return;
      submitting.current = true;
      actions.vote.mutate(
        { registrationId, votes: changes },
        {
          onSuccess: onSaved,
          onSettled: () => {
            submitting.current = false;
          },
        },
      );
    },
  };
}
