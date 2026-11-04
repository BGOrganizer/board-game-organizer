"use client";

import type { SaveTableResultInput } from "@board-game-organizer/schemas";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useClientMutationDraft } from "../../common/hooks/useClientMutationDraft";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import type { TableScoreInput } from "../tableScoreForm";
import { useEventRecordActions } from "./useEventRecordActions";
import {
  eventRecordKeys,
  eventRecordQuery,
  recordTableQuery,
  useTableSeats,
} from "./useEventRecords";

export function useEventResultsForm(
  options: CommunityApiOptions,
  eventId: string,
  tableId: string,
) {
  // Review one matching parent/Table epoch; separately cached snapshots can belong to different confirmations.
  const event = useQuery({ ...eventRecordQuery(options, eventId), staleTime: 0 }),
    table = useQuery({ ...recordTableQuery(options, eventId, tableId), staleTime: 0 }),
    seats = useTableSeats(options, eventId, tableId),
    actions = useEventRecordActions(options, eventId);
  const draft = useClientMutationDraft<{ tableId: string; input: SaveTableResultInput }>(
    [...eventRecordKeys.mutation(options, eventId), "save-result"],
    communityAccessDenied(event.error) || event.isPlaceholderData ? undefined : event.data?.version,
    (variables) => variables?.tableId === tableId,
  );
  const scope = JSON.stringify([options.apiUrl, options.userId, eventId, tableId]);
  const [base, setBase] = useState<{ scope: string; version: number } | null>(() =>
    event.data && table.data?.eventVersion === event.data.version
      ? { scope, version: event.data.version }
      : null,
  );
  const currentScope = useRef(scope),
    submitted = useRef(false);
  currentScope.current = scope;
  useEffect(() => {
    if (
      (!base || base.scope !== scope) &&
      event.data &&
      table.data &&
      !event.isPlaceholderData &&
      !table.isPlaceholderData &&
      table.data.eventVersion === event.data.version &&
      !communityAccessDenied(event.error) &&
      !communityAccessDenied(table.error)
    ) {
      setBase({ scope, version: event.data.version });
      submitted.current = false;
    }
  }, [
    base,
    scope,
    event.data,
    table.data,
    event.isPlaceholderData,
    table.isPlaceholderData,
    event.isFetching,
    table.isFetching,
    event.error,
    table.error,
  ]);
  const allowed = Boolean(
    event.data?.adminUserId === options.userId &&
      event.data?.status === "CONFIRMED" &&
      event.data.canFinalize &&
      table.data?.confirmed &&
      !communityAccessDenied(event.error) &&
      !communityAccessDenied(table.error),
  );
  const players = (table.data?.confirmed?.playerIds ?? []).flatMap((id) => {
    const person = seats.items.find((row) => row.userId === id);
    return person
      ? [
          {
            id,
            name: person.name ?? id,
            username: person.username ?? null,
            email: person.email ?? null,
            avatarUrl: person.avatarUrl,
          },
        ]
      : [];
  });
  const conflict = Boolean(
    (base?.scope === scope && event.data && base.version !== event.data.version) ||
      (allowed &&
        event.data &&
        table.data &&
        !event.isFetching &&
        !table.isFetching &&
        table.data.eventVersion !== event.data.version),
  );
  const checking =
    draft?.variables?.tableId === tableId &&
    (draft.phase === "saving" || draft.phase === "verifying");
  const recovered = draft?.variables?.tableId === tableId ? draft.variables.input : undefined;
  const playersReady = Boolean(
    allowed &&
      base?.scope === scope &&
      players.length === table.data?.confirmed?.playerIds.length &&
      !seats.isError &&
      !table.isPlaceholderData,
  );
  const save = (input: TableScoreInput, onSaved: () => void) => {
    if (
      !playersReady ||
      !base ||
      base.scope !== scope ||
      conflict ||
      submitted.current ||
      actions.busy ||
      checking ||
      event.isPlaceholderData ||
      table.isPlaceholderData
    )
      return;
    submitted.current = true;
    actions.saveResult.mutate(
      { tableId, input: { ...input, version: base.version } },
      {
        onSuccess: () => {
          if (currentScope.current === scope) onSaved();
        },
        onSettled: () => {
          if (currentScope.current === scope) submitted.current = false;
        },
      },
    );
  };
  return {
    event,
    table,
    seats,
    players,
    actions,
    allowed,
    conflict,
    checking,
    save,
    initial: recovered?.version === event.data?.version ? recovered : table.data?.resultDraft,
    error: draft?.phase === "failed",
    playersReady,
    loading: Boolean(
      event.isPending ||
        table.isPending ||
        (allowed && !playersReady && (seats.isPending || table.isFetching || event.isFetching)),
    ),
    playersIncomplete: Boolean(
      allowed &&
        base?.scope === scope &&
        !playersReady &&
        !seats.isPending &&
        !seats.hasNextPage &&
        !seats.isError &&
        !table.isFetching,
    ),
  };
}
