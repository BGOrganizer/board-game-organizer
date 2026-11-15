"use client";

import type {
  EventVote,
  JoinEventAvailability,
  JoinTableInput,
} from "@board-game-organizer/schemas";
import { useEffect, useMemo, useRef, useState } from "react";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import {
  eventFirstInvalidVote,
  eventJoinAvailabilityIsComplete,
  eventOptionsRequireVote,
  eventOptionVotesAreComplete,
  eventVotingChoices,
  hasOtherAcceptedTable,
} from "../eventJoinAvailability";
import { useEventCutoff } from "./useEventCutoff";
import { useEventParticipationIntent } from "./useEventParticipationIntent";
import { useEventRecordActions } from "./useEventRecordActions";
import { useEventRecord, useRecordTable } from "./useEventRecords";

type Choices = JoinEventAvailability["dateVotes"];
type JoinTab = "dates" | "locations" | "games";
const emptyOptions: readonly { id: string }[] = [];
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
  const denied = communityAccessDenied(q.error) || communityAccessDenied(tableQuery.error);
  const event = denied ? undefined : q.data,
    table = denied ? undefined : tableQuery.data;
  const intent = useEventParticipationIntent(
    o,
    eventId,
    tableId,
    !tableQuery.isPlaceholderData &&
      table?.myRegistration?.userId === o.userId &&
      table?.myRegistration?.status === "ACCEPTED",
  );
  const recovery = intent?.phase === "failed" ? intent.input : undefined;
  const scope = JSON.stringify([o.apiUrl, o.userId, eventId, tableId, registrationId]);
  const [draftScope, setDraftScope] = useState(scope),
    [dateVotes, setDates] = useState<Choices>({}),
    [locationVotes, setLocations] = useState<Choices>({}),
    [gameVotes, setGames] = useState<Choices>({}),
    [initialTab, setInitialTab] = useState<JoinTab>(),
    [validationAttempt, setValidationAttempt] = useState(0);
  const initialized = useRef({ scope, availability: false, games: false, submitted: false });
  const sameOwner = draftScope === scope;
  const requiresAvailability = Boolean(event && event.groupType !== "PUBLIC"),
    isInvitation = registrationId !== undefined,
    gamesOnly = isInvitation && event?.groupType === "PUBLIC";
  const dates = event?.dates ?? emptyOptions,
    locations = event?.locations ?? emptyOptions;
  const votingTabs = useMemo<JoinTab[]>(
    () => [
      ...(requiresAvailability && eventOptionsRequireVote(dates) ? ["dates" as const] : []),
      ...(requiresAvailability && eventOptionsRequireVote(locations) ? ["locations" as const] : []),
      ...(!tableQuery.isPlaceholderData && eventOptionsRequireVote(table?.games ?? [])
        ? ["games" as const]
        : []),
    ],
    [requiresAvailability, dates, locations, table?.games, tableQuery.isPlaceholderData],
  );
  const ready = Boolean(
    sameOwner && event && !q.isPlaceholderData && event.myRegistrations !== undefined,
  );
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
    if (initialized.current.scope !== scope) {
      initialized.current = { scope, availability: false, games: false, submitted: false };
      setDraftScope(scope);
      setDates({});
      setLocations({});
      setGames({});
      setInitialTab(undefined);
      setValidationAttempt(0);
    }
    if (!event || q.isPlaceholderData || event.myRegistrations === undefined) return;
    const firstTab =
      event.groupType === "PUBLIC" || hasOtherAcceptedTable(event.myRegistrations, tableId)
        ? "games"
        : "dates";
    setInitialTab((current) =>
      current && votingTabs.includes(current)
        ? current
        : firstTab === "games" && (!table || tableQuery.isPlaceholderData)
          ? undefined
          : votingTabs.includes(firstTab)
            ? firstTab
            : votingTabs[0],
    );
    const explicit = (choices: Record<string, EventVote> | undefined): Choices =>
      Object.fromEntries(
        Object.entries(choices ?? {}).filter(([, vote]) => vote !== "UNKNOWN"),
      ) as Choices;
    if (!initialized.current.availability) {
      setDates(explicit(recovery?.availability?.dateVotes ?? event.myVotes?.dateVotes));
      setLocations(explicit(recovery?.availability?.locationVotes ?? event.myVotes?.locationVotes));
      initialized.current.availability = true;
    }
    if (!table || tableQuery.isPlaceholderData || initialized.current.games) return;
    setGames(explicit(recovery?.gameVotes ?? table.myRegistration?.gameVotes));
    initialized.current.games = true;
  }, [
    event,
    table,
    q.isPlaceholderData,
    tableQuery.isPlaceholderData,
    tableId,
    scope,
    recovery,
    votingTabs,
  ]);
  const current = (options: readonly { id: string }[], choices: Choices): Choices =>
    sameOwner ? eventVotingChoices(options, choices) : {};
  const gameOptions = (table?.games ?? []).map((game) => ({ id: String(game.gameId) }));
  const closed = useEventCutoff(event?.bookingClosesAt, event?.groupType === "PUBLIC");
  const votes = {
    dateVotes: current(dates, dateVotes),
    locationVotes: current(locations, locationVotes),
    gameVotes: current(gameOptions, gameVotes),
  };
  const checking = intent?.phase === "verifying";
  const canAttempt = Boolean(
    sameOwner &&
      event &&
      table &&
      table.eventId === eventId &&
      table.id === tableId &&
      (isInvitation ? invitationAvailable : table.canRegister) &&
      !q.isError &&
      !tableQuery.isError &&
      !q.isPlaceholderData &&
      !tableQuery.isPlaceholderData &&
      !actions.blocking &&
      intent?.phase !== "saving" &&
      !checking &&
      (isInvitation || !closed) &&
      event.status === "PLANNING" &&
      table.eventStatus === "PLANNING" &&
      event.myRegistrations !== undefined &&
      event.dates.length > 0 &&
      event.locations.length > 0 &&
      gameOptions.length > 0,
  );
  const canSubmit = Boolean(
    canAttempt &&
      event &&
      (!requiresAvailability || eventJoinAvailabilityIsComplete(event, votes)) &&
      eventOptionVotesAreComplete(gameOptions, votes.gameVotes),
  );
  const invalidChoice = votingTabs.flatMap((tab) => {
    const index =
      tab === "dates"
        ? eventFirstInvalidVote(dates, votes.dateVotes)
        : tab === "locations"
          ? eventFirstInvalidVote(locations, votes.locationVotes)
          : eventFirstInvalidVote(gameOptions, votes.gameVotes);
    return index === undefined ? [] : [{ tab, index }];
  })[0];
  const choose = (kind: "date" | "location" | "game", id: string, vote: EventVote) => {
    const options =
      kind === "game"
        ? gameOptions
        : kind === "date"
          ? (event?.dates ?? [])
          : (event?.locations ?? []);
    if (sameOwner && eventOptionsRequireVote(options) && vote !== "UNKNOWN")
      (kind === "date" ? setDates : kind === "location" ? setLocations : setGames)((previous) => ({
        ...previous,
        [id]: vote,
      }));
  };
  const refetch = () => {
    void q.refetch({ cancelRefetch: false });
    void tableQuery.refetch({ cancelRefetch: false });
  };
  const submit = () => {
    if (initialized.current.submitted || !canAttempt || !event) return;
    if (!canSubmit) {
      setValidationAttempt((value) => value + 1);
      return;
    }
    initialized.current.submitted = true;
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
    if (isInvitation)
      actions.respond.mutate({
        tableId,
        registrationId,
        input: { action: "accept", version: invitation!.version, participation },
      });
    else actions.register.mutate({ tableId, ...participation });
    onComplete();
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
    initialTab: sameOwner ? initialTab : undefined,
    votingTabs,
    ready,
    votes,
    choose,
    canSubmit,
    canAttempt,
    validationAttempt,
    invalidChoice,
    failed: intent?.phase === "failed",
    checking,
    submit,
    refetch,
  };
}
