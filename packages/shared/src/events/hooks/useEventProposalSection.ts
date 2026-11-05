"use client";
import {
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
  const [capturedDecision, setDecision] = useState<{
    row: ClientEventProposal;
    action: "accept" | "reject";
    eventVersion: number;
    apiUrl: string;
    userId: string | null | undefined;
    eventId: string;
  } | null>(null);
  useEffect(() => {
    if (
      capturedDecision &&
      (!visible ||
        !manager ||
        capturedDecision.apiUrl !== o.apiUrl ||
        capturedDecision.userId !== o.userId ||
        capturedDecision.eventId !== event.id)
    ) {
      setDecision(null);
      deciding.current = false;
    }
  }, [capturedDecision, visible, manager, o.apiUrl, o.userId, event.id]);
  const decision =
    capturedDecision &&
    visible &&
    manager &&
    capturedDecision.apiUrl === o.apiUrl &&
    capturedDecision.userId === o.userId &&
    capturedDecision.eventId === event.id
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
      !row.clientAction &&
      !actions.busy,
  );
  const withinLimit =
    kind === "game" || (kind === "date" ? event.dates : event.locations).length < MAX_EVENT_OPTIONS;
  const canPropose =
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
    open: (row: ClientEventProposal, action: "accept" | "reject") => {
      if (
        !disabled &&
        manager &&
        q.hasVerifiedBase &&
        event.status === "PLANNING" &&
        row.status === "PENDING" &&
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
        });
      }
    },
    cancel: () => setDecision(null),
    confirm: () => {
      if (!validDecision || !decision || deciding.current) return;
      deciding.current = true;
      actions.decide({
        action: decision.action,
        eventVersion: decision.eventVersion,
        proposalId: decision.row.id,
        version: decision.row.version,
      });
      setDecision(null);
    },
  };
}
