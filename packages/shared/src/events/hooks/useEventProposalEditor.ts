"use client";
import {
  type EventProposalPayload,
  eventProposalPayloadSchema,
  MAX_EVENT_OPTIONS,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import { hashKey } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import { useEventProposalActions, useEventProposalIntents } from "./useEventProposalActions";
import { useEventRecord, useRecordTable } from "./useEventRecords";
export function useEventProposalEditor(
  o: CommunityApiOptions,
  eventId: string,
  kind: string,
  tableId = "",
  draftId?: string,
) {
  const q = useEventRecord(o, eventId),
    table = useRecordTable(
      { ...o, enabled: o.enabled !== false && kind === "game" },
      eventId,
      tableId,
    );
  const event = communityAccessDenied(q.error) ? undefined : q.data;
  const category = kind === "date" || kind === "location" || kind === "game" ? kind : undefined;
  const actions = useEventProposalActions(o, eventId, event?.groupId ?? "", category, tableId);
  const recovery = useEventProposalIntents(o, eventId, category, tableId).find(
    (intent) =>
      intent.draftId === draftId &&
      intent.variables.payload.kind === kind &&
      (intent.variables.payload.kind !== "game" || intent.variables.payload.tableId === tableId),
  );
  const identity = hashKey([o.apiUrl, o.userId, eventId, kind, tableId, draftId]);
  const [draft, setDraft] = useState<{
    identity: string;
    payload: EventProposalPayload | null;
    label: string;
  }>(() => ({
    identity,
    payload: recovery?.variables.payload ?? null,
    label: recovery?.variables.clientLabel ?? "",
  }));
  const current = draft.identity === identity ? draft : { identity, payload: null, label: "" };
  const sent = useRef("");
  const validKind = kind === "date" || kind === "location" || (kind === "game" && Boolean(tableId));
  const withinLimit =
    kind === "game" ||
    Boolean(event && (kind === "date" ? event.dates : event.locations).length < MAX_EVENT_OPTIONS);
  const allowed = Boolean(
    withinLimit &&
      validKind &&
      event &&
      !q.isPlaceholderData &&
      event.groupType === "PRIVATE" &&
      !event.readOnly &&
      event.status === "PLANNING" &&
      (!draftId || recovery) &&
      (kind === "date"
        ? event.canProposeDates === true
        : kind === "location"
          ? event.canProposeLocations === true
          : !table.isPlaceholderData &&
            !communityAccessDenied(table.error) &&
            table.data?.canProposeGames === true),
  );
  const choose = (payload: EventProposalPayload, label: string) => {
    if (payload.kind === kind) setDraft({ identity, payload, label });
  };
  return {
    q,
    table,
    event,
    actions,
    allowed,
    validInput: Boolean(eventId) && validKind,
    payload: current.payload,
    label: current.label,
    canSubmit:
      allowed &&
      !actions.busy &&
      sent.current !== identity &&
      current.payload?.kind === kind &&
      eventProposalPayloadSchema.safeParse(current.payload).success,
    chooseDate: (wall: string) =>
      choose(
        { kind: "date", day: wall.slice(0, 10), startTime: wall.slice(11, 16) },
        wall.replace("T", " "),
      ),
    chooseGame: (game: { id: number; name: string }) =>
      choose({ kind: "game", tableId, gameId: game.id }, game.name),
    chooseLocation: (location: MatchLocation) => {
      const result = eventProposalPayloadSchema.safeParse({ kind: "location", location });
      if (result.success) choose(result.data, location.name);
    },
    submit: () => {
      if (
        !allowed ||
        !event ||
        actions.busy ||
        sent.current === identity ||
        current.payload?.kind !== kind ||
        !eventProposalPayloadSchema.safeParse(current.payload).success
      )
        return false;
      sent.current = identity;
      actions.propose({
        eventVersion: event.version,
        payload: current.payload,
        clientLabel: current.label,
        clientReplaces: recovery?.draftId,
        clientRequestId:
          recovery?.variables.eventVersion === event.version &&
          JSON.stringify(recovery.variables.payload) === JSON.stringify(current.payload)
            ? recovery.variables.clientRequestId
            : undefined,
      });
      return true;
    },
  };
}
