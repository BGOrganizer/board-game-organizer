"use client";

import type { EventVote, JoinEventAvailability } from "@board-game-organizer/schemas";
import { useEffect, useRef, useState } from "react";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import {
  eventJoinAvailabilityIsComplete,
  eventOptionVotesAreComplete,
  hasOtherAcceptedTable,
} from "../eventJoinAvailability";
import { useEventCutoff } from "./useEventCutoff";
import { useEventRecordActions } from "./useEventRecordActions";
import { useEventRecord, useRecordTable } from "./useEventRecords";

type Choices = JoinEventAvailability["dateVotes"];
export function useEventJoinForm(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  onComplete: () => void,
) {
  const q = useEventRecord(o, eventId),
    tableQuery = useRecordTable(o, eventId, tableId),
    actions = useEventRecordActions(o, eventId);
  const [dateVotes, setDates] = useState<Choices>({}),
    [locationVotes, setLocations] = useState<Choices>({}),
    [gameVotes, setGames] = useState<Choices>({}),
    [failed, setFailed] = useState(false),
    [initialTab, setInitialTab] = useState<"dates" | "games">(),
    initialized = useRef({ availability: false, games: false });
  const denied = communityAccessDenied(q.error) || communityAccessDenied(tableQuery.error);
  const event = denied ? undefined : q.data,
    table = denied ? undefined : tableQuery.data;
  const requiresAvailability = event?.groupType === "PRIVATE";
  useEffect(() => {
    if (!event || q.isPlaceholderData || event.myRegistrations === undefined) return;
    const firstTab = hasOtherAcceptedTable(event.myRegistrations, tableId) ? "games" : "dates";
    setInitialTab((current) => current ?? firstTab);
    const explicit = (choices: Record<string, EventVote> | undefined): Choices =>
      Object.fromEntries(
        Object.entries(choices ?? {}).filter(([, vote]) => vote !== "UNKNOWN"),
      ) as Choices;
    if (!initialized.current.availability) {
      setDates(explicit(event.myVotes?.dateVotes));
      setLocations(explicit(event.myVotes?.locationVotes));
      initialized.current.availability = true;
    }
    if (!table || tableQuery.isPlaceholderData || initialized.current.games) return;
    setGames(explicit(table.myRegistration?.gameVotes));
    initialized.current.games = true;
  }, [event, table, q.isPlaceholderData, tableQuery.isPlaceholderData, tableId]);
  const current = (options: Array<{ id: string }> | undefined, choices: Choices): Choices =>
    Object.fromEntries(
      (options ?? [])
        .filter((option) => choices[option.id])
        .map((option) => [option.id, choices[option.id]]),
    );
  const gameOptions = (table?.games ?? []).map((game) => ({ id: String(game.gameId) }));
  const closed = useEventCutoff(event?.bookingClosesAt, event?.groupType === "PUBLIC");
  const votes = {
    dateVotes: current(event?.dates, dateVotes),
    locationVotes: current(event?.locations, locationVotes),
    gameVotes: current(gameOptions, gameVotes),
  };
  const canSubmit = Boolean(
    event &&
      table &&
      table.eventId === eventId &&
      table.id === tableId &&
      table.canRegister &&
      !q.isError &&
      !tableQuery.isError &&
      !q.isPlaceholderData &&
      !tableQuery.isPlaceholderData &&
      !actions.busy &&
      !closed &&
      event.status === "PLANNING" &&
      table.eventStatus === "PLANNING" &&
      event.myRegistrations !== undefined &&
      (!requiresAvailability || eventJoinAvailabilityIsComplete(event, votes)) &&
      eventOptionVotesAreComplete(gameOptions, votes.gameVotes),
  );
  const choose = (kind: "date" | "location" | "game", id: string, vote: EventVote) => {
    if (vote !== "UNKNOWN" && !actions.busy)
      (kind === "date" ? setDates : kind === "location" ? setLocations : setGames)((previous) => ({
        ...previous,
        [id]: vote,
      }));
  };
  const refetch = () => {
    void q.refetch();
    void tableQuery.refetch();
  };
  const submit = async () => {
    if (!canSubmit || !event) return;
    setFailed(false);
    try {
      await actions.register.mutateAsync({
        tableId,
        version: event.version,
        gameVotes: votes.gameVotes,
        ...(requiresAvailability
          ? {
              availability: {
                version: event.version,
                dateVotes: votes.dateVotes,
                locationVotes: votes.locationVotes,
              },
            }
          : {}),
      });
      onComplete();
    } catch {
      setFailed(true);
      refetch();
    }
  };
  return {
    q,
    tableQuery,
    event,
    table,
    requiresAvailability,
    initialTab,
    votes,
    choose,
    canSubmit,
    busy: actions.busy,
    failed,
    submit,
    refetch,
  };
}
