"use client";
import type { EventParticipantResponse, PlannedEventResponse } from "@board-game-organizer/schemas";
import { useRef, useState } from "react";
import type { CommunityApiOptions } from "../../community/communityApi";
import { useGroupRecordActions } from "../../groups/hooks/useGroupRecords";
import { canManageEvent } from "../eventRecordPolicy";
import { useEventCutoff } from "./useEventCutoff";
import type { useEventRecordActions } from "./useEventRecordActions";

export function useEventParticipantManagement(
  o: CommunityApiOptions,
  event: PlannedEventResponse,
  people: readonly EventParticipantResponse[],
  actions: ReturnType<typeof useEventRecordActions>,
  disabled = false,
) {
  const group = useGroupRecordActions(o, event.groupId ?? "");
  const closed = useEventCutoff(event.bookingClosesAt, event.groupType === "PUBLIC");
  const owner = JSON.stringify([o.apiUrl, o.userId, event.id]);
  const [managed, setManaged] = useState<{
    person: EventParticipantResponse;
    action: "remove" | "ban";
    owner: string;
    version: number;
  } | null>(null);
  const submitted = useRef<typeof managed>(null);
  const isBusy = (person: EventParticipantResponse) =>
    actions.busy || Boolean(event.groupId && group.isPersonBusy(event.groupId, person.userId));
  const canAct = (person: EventParticipantResponse, action: "remove" | "ban") =>
    !disabled &&
    !event.readOnly &&
    canManageEvent(event, o.userId) &&
    (action === "remove"
      ? person.canRemove && event.status === "PLANNING" && !closed
      : Boolean(event.groupId && person.canBanGroup));
  const allowed = (person: EventParticipantResponse, action: "remove" | "ban") =>
    canAct(person, action) && !isBusy(person);
  const current = managed && people.find((person) => person.userId === managed.person.userId);
  const stale = Boolean(
    managed &&
      (managed.owner !== owner ||
        managed.version !== event.version ||
        !current ||
        !allowed(current, managed.action)),
  );
  const open = (person: EventParticipantResponse, action: "remove" | "ban") => {
    if (allowed(person, action)) setManaged({ person, action, owner, version: event.version });
  };
  const close = () => setManaged(null);
  const confirm = (until: string | null = null) => {
    if (!managed || !current || stale || submitted.current === managed) return;
    submitted.current = managed;
    if (managed.action === "remove")
      actions.removeParticipant.mutate({ userId: managed.person.userId, version: managed.version });
    else if (event.groupId)
      group.ban.mutate({ id: event.groupId, input: { userId: managed.person.userId, until } });
    setManaged(null);
  };
  return { managed, open, close, confirm, stale, isBusy, closed, canAct };
}
