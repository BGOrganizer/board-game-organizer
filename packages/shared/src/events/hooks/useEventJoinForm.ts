"use client";

import type {
  EventVote,
  JoinEventAvailability,
  JoinTableInput,
} from "@board-game-organizer/schemas";
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
  registrationId?: string,
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
  const isInvitation = registrationId !== undefined;
  const gamesOnly = isInvitation && event?.groupType === "PUBLIC";
  const invitation = table?.myRegistration;
  const invitationAvailable = Boolean(
    table?.canRespond &&
      invitation?.id === registrationId &&
      invitation?.userId === o.userId &&
      invitation?.status === "PENDING" &&
      invitation?.kind === "INVITATION",
  );
  const invitationUnavailable = Boolean(
    isInvitation && table && !tableQuery.isPlaceholderData && !invitationAvailable,
  );
  useEffect(() => {
    if (!event || q.isPlaceholderData || event.myRegistrations === undefined) return;
    const firstTab =
      event.groupType === "PUBLIC" || hasOtherAcceptedTable(event.myRegistrations, tableId)
        ? "games"
        : "dates";
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
      (isInvitation ? invitationAvailable : table.canRegister) &&
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
      const participation: JoinTableInput = {
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
      };
      if (isInvitation) {
        await actions.respond.mutateAsync({
          registrationId,
          input: { action: "accept", version: invitation!.version, participation },
        });
      } else await actions.register.mutateAsync({ tableId, ...participation });
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
    isInvitation,
    gamesOnly,
    invitationUnavailable,
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
