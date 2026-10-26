"use client";

import type { EventVote, JoinEventAvailability } from "@board-game-organizer/schemas";
import { useEffect, useRef, useState } from "react";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import { eventJoinAvailabilityIsComplete } from "../eventJoinAvailability";
import { useEventRecordActions } from "./useEventRecordActions";
import { useEventRecord } from "./useEventRecords";

type Choices = JoinEventAvailability["dateVotes"];
export function useEventJoinForm(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  onComplete: () => void,
) {
  const q = useEventRecord(o, eventId),
    actions = useEventRecordActions(o, eventId);
  const [dateVotes, setDates] = useState<Choices>({}),
    [locationVotes, setLocations] = useState<Choices>({}),
    [failed, setFailed] = useState(false),
    initialized = useRef(false);
  const event = communityAccessDenied(q.error) ? undefined : q.data;
  useEffect(() => {
    if (!event || q.isPlaceholderData || initialized.current) return;
    const explicit = (choices: Record<string, EventVote> | undefined): Choices =>
      Object.fromEntries(
        Object.entries(choices ?? {}).filter(([, vote]) => vote !== "UNKNOWN"),
      ) as Choices;
    setDates(explicit(event.myVotes?.dateVotes));
    setLocations(explicit(event.myVotes?.locationVotes));
    initialized.current = true;
  }, [event, q.isPlaceholderData]);
  const current = (options: Array<{ id: string }> | undefined, choices: Choices): Choices =>
    Object.fromEntries(
      (options ?? [])
        .filter((option) => choices[option.id])
        .map((option) => [option.id, choices[option.id]]),
    );
  const votes = {
    dateVotes: current(event?.dates, dateVotes),
    locationVotes: current(event?.locations, locationVotes),
  };
  const canSubmit = Boolean(
    event &&
      !q.isError &&
      !q.isPlaceholderData &&
      !actions.busy &&
      event.groupType === "PRIVATE" &&
      event.status === "PLANNING" &&
      eventJoinAvailabilityIsComplete(event, votes),
  );
  const choose = (kind: "date" | "location", id: string, vote: EventVote) => {
    if (vote !== "UNKNOWN")
      (kind === "date" ? setDates : setLocations)((previous) => ({ ...previous, [id]: vote }));
  };
  const submit = async () => {
    if (!canSubmit || !event) return;
    setFailed(false);
    try {
      await actions.register.mutateAsync({
        tableId,
        availability: { version: event.version, ...votes },
      });
      onComplete();
    } catch {
      setFailed(true);
      void q.refetch();
    }
  };
  return { q, event, votes, choose, canSubmit, busy: actions.busy, failed, submit };
}
