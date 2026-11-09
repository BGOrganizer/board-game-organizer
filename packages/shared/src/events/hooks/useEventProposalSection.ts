"use client";
import {
  eventProposalPayloadSchema,
  MAX_EVENT_OPTIONS,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { useEffect, useRef, useState } from "react";
import type { CommunityApiOptions } from "../../community/communityApi";
import type { ClientEventProposal, EventProposalCategory } from "../eventProposalCache";
import { useEventProposalActions, useEventProposalIntents } from "./useEventProposalActions";
import { useEventProposals } from "./useEventProposals";
/** One category workflow. Hosts retain their own navigation, controls, layout and accessibility. */
export function useEventProposalSection(
  o: CommunityApiOptions,
  event: PlannedEventResponse,
  kind: EventProposalCategory,
  table?: PlannedTableResponse,
  disabled = false,
) {
  const visible = event.groupType === "PRIVATE" && !event.readOnly && Boolean(event.groupId);
  const manager = event.canManage === true;
  const scope = {
    eventId: event.id,
    groupId: event.groupId ?? "",
    kind,
    tableId: kind === "game" ? table?.id : undefined,
    mode: manager ? ("review" as const) : ("mine" as const),
  };
  const q = useEventProposals(
    {
      ...o,
      enabled:
        o.enabled !== false &&
        visible &&
        !disabled &&
        (kind !== "game" || Boolean(table && !table.readOnly)),
    },
    scope,
  );
  const actions = useEventProposalActions(o, event.id, event.groupId ?? "", kind, table?.id);
  const intents = useEventProposalIntents(o, event.id, kind, table?.id)
    .slice(0, 5)
    .filter(
      (intent) =>
        intent.variables.payload.kind === kind &&
        (intent.variables.payload.kind !== "game" ||
          intent.variables.payload.tableId === table?.id) &&
        !q.items.some((row) => row.clientRequestId === intent.variables.clientRequestId),
    );
  const deciding = useRef(false);
  const decisionGeneration = useRef(0);
  const sending = useRef<string | null>(null);
  const ownerKey = JSON.stringify([o.apiUrl, o.userId, event.id, event.version, kind, table?.id]);
  const liveOwner = useRef(ownerKey);
  liveOwner.current = ownerKey;
  useEffect(() => {
    liveOwner.current = ownerKey;
    return () => {
      liveOwner.current = "";
    };
  }, [ownerKey]);
  const [capturedDecision, setDecision] = useState<{
    row: ClientEventProposal;
    action: "accept" | "reject";
    eventVersion: number;
    apiUrl: string;
    userId: string | null | undefined;
    eventId: string;
    kind: EventProposalCategory;
    tableId?: string;
    generation: number;
  } | null>(null);
  useEffect(() => {
    if (
      capturedDecision &&
      (!visible ||
        !manager ||
        capturedDecision.apiUrl !== o.apiUrl ||
        capturedDecision.userId !== o.userId ||
        capturedDecision.eventId !== event.id ||
        capturedDecision.kind !== kind ||
        capturedDecision.tableId !== table?.id)
    ) {
      setDecision(null);
      decisionGeneration.current++;
      deciding.current = false;
    }
  }, [capturedDecision, visible, manager, o.apiUrl, o.userId, event.id, kind, table?.id]);
  const decision =
    capturedDecision &&
    visible &&
    manager &&
    capturedDecision.apiUrl === o.apiUrl &&
    capturedDecision.userId === o.userId &&
    capturedDecision.eventId === event.id &&
    capturedDecision.kind === kind &&
    capturedDecision.tableId === table?.id
      ? capturedDecision
      : null;
  const row = decision ? q.items.find((item) => item.id === decision.row.id) : undefined;
  const validDecision = Boolean(
    decision &&
      visible &&
      !disabled &&
      manager &&
      q.hasVerifiedBase &&
      event.status === "PLANNING" &&
      event.version === decision.eventVersion &&
      event.id === decision.eventId &&
      o.apiUrl === decision.apiUrl &&
      o.userId === decision.userId &&
      row?.status === "PENDING" &&
      row.version === decision.row.version &&
      row.groupRevision === decision.row.groupRevision &&
      !row.clientAction &&
      !actions.busy,
  );
  const withinLimit =
    kind === "game" || (kind === "date" ? event.dates : event.locations).length < MAX_EVENT_OPTIONS;
  const canPropose =
    !manager &&
    event.role !== "admin" &&
    withinLimit &&
    visible &&
    !disabled &&
    event.status === "PLANNING" &&
    !actions.busy &&
    (kind === "date"
      ? event.canProposeDates === true
      : kind === "location"
        ? event.canProposeLocations === true
        : table?.canProposeGames === true && table.eventStatus === "PLANNING");
  return {
    q,
    actions,
    visible,
    manager,
    intents,
    decision,
    validDecision,
    canPropose,
    submitDate: (wall: string) => {
      if (
        kind !== "date" ||
        !canPropose ||
        liveOwner.current !== ownerKey ||
        sending.current === ownerKey
      )
        return false;
      const result = eventProposalPayloadSchema.safeParse({
        kind: "date",
        day: wall.slice(0, 10),
        startTime: wall.slice(11, 16),
      });
      if (!result.success) return false;
      sending.current = ownerKey;
      actions.propose(
        { eventVersion: event.version, payload: result.data, clientLabel: wall.replace("T", " ") },
        {
          onSettled: () => {
            if (sending.current === ownerKey) sending.current = null;
          },
        },
      );
      return true;
    },
    open: (row: ClientEventProposal, action: "accept" | "reject" = "accept") => {
      if (
        !disabled &&
        liveOwner.current === ownerKey &&
        row.payload.kind === kind &&
        (row.payload.kind !== "game" || row.payload.tableId === table?.id) &&
        manager &&
        q.hasVerifiedBase &&
        !row.clientAction &&
        !actions.busy
      ) {
        deciding.current = false;
        setDecision({
          row,
          action,
          eventVersion: event.version,
          eventId: event.id,
          apiUrl: o.apiUrl,
          userId: o.userId,
          kind,
          tableId: table?.id,
          generation: ++decisionGeneration.current,
        });
      }
    },
    cancel: () => {
      decisionGeneration.current++;
      deciding.current = true;
      setDecision(null);
    },
    confirm: (action: "accept" | "reject" = decision?.action ?? "accept") => {
      if (
        !validDecision ||
        !decision ||
        deciding.current ||
        liveOwner.current !== ownerKey ||
        decision.generation !== decisionGeneration.current
      )
        return;
      deciding.current = true;
      decisionGeneration.current++;
      actions.decide({
        action,
        eventVersion: decision.eventVersion,
        proposalId: decision.row.id,
        version: decision.row.version,
        ...(decision.row.groupRevision ? { groupRevision: decision.row.groupRevision } : {}),
        ...(decision.row.payload.kind === "game"
          ? { game: { gameId: decision.row.payload.gameId, tableId: decision.row.payload.tableId } }
          : {}),
      });
      setDecision(null);
    },
  };
}
