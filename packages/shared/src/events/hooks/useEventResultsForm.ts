"use client";

import type { FinalizeEventInput } from "@board-game-organizer/schemas";
import { useEffect, useRef, useState } from "react";
import { useClientMutationDraft } from "../../common/hooks/useClientMutationDraft";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import type { TableScoreInput } from "../tableScoreForm";
import { useEventRecordActions } from "./useEventRecordActions";
import {
  eventRecordKeys,
  useEventRecord,
  useRecordTable,
  useRecordTables,
  useTableSeats,
} from "./useEventRecords";
export function useEventResultsForm(options: CommunityApiOptions, eventId: string) {
  const event = useEventRecord(options, eventId),
    tables = useRecordTables(options, eventId),
    actions = useEventRecordActions(options, eventId);
  const draft = useClientMutationDraft<FinalizeEventInput>(
    [...eventRecordKeys.mutation(options, eventId), "finalize"],
    communityAccessDenied(event.error) || event.isPlaceholderData ? undefined : event.data?.version,
  );
  const recovered = draft?.variables;
  const scope = JSON.stringify([options.apiUrl, options.userId, eventId]);
  const [owner, setOwner] = useState(scope),
    [selected, setSelected] = useState<string | null>(null),
    [scores, setScores] = useState<Record<string, TableScoreInput>>(() =>
      Object.fromEntries(
        (recovered?.results ?? []).map(({ tableId, ...score }) => [tableId, score]),
      ),
    ),
    [scoreVersions, setScoreVersions] = useState<Record<string, number>>(() =>
      Object.fromEntries(
        (recovered?.results ?? []).map((row) => [row.tableId, recovered?.version ?? 0]),
      ),
    ),
    [baseVersion, setBaseVersion] = useState<number | null>(recovered?.version ?? null),
    [confirm, setConfirm] = useState(false);
  const submitted = useRef(false);
  const sameOwner = owner === scope;
  useEffect(() => {
    if (owner === scope) return;
    setOwner(scope);
    setSelected(null);
    setScores({});
    setScoreVersions({});
    setBaseVersion(null);
    setConfirm(false);
    submitted.current = false;
  }, [owner, scope]);
  const table = useRecordTable(
      { ...options, enabled: options.enabled !== false && sameOwner && !!selected },
      eventId,
      sameOwner ? (selected ?? "") : "",
    ),
    seats = useTableSeats(
      { ...options, enabled: options.enabled !== false && sameOwner && !!selected },
      eventId,
      sameOwner ? (selected ?? "") : "",
    );
  const included = tables.items.filter((row) => Boolean(row.confirmed));
  const currentScores = sameOwner ? scores : {};
  const isScoreCurrent = (id: string) =>
    Boolean(sameOwner && scores[id] && scoreVersions[id] === event.data?.version);
  const players = (table.data?.confirmed?.playerIds ?? []).flatMap((id) => {
    const person = seats.items.find((row) => row.userId === id);
    return person
      ? [{ id, name: person.name ?? id, email: person.email ?? null, avatarUrl: person.avatarUrl }]
      : [];
  });
  const ready = Boolean(
    sameOwner &&
      included.length &&
      !tables.hasNextPage &&
      !tables.isPending &&
      !tables.isError &&
      included.every((row) => isScoreCurrent(row.id)) &&
      event.data?.canFinalize &&
      baseVersion === event.data.version &&
      draft?.phase !== "saving" &&
      draft?.phase !== "verifying",
  );
  const open = (id: string) => {
    if (!sameOwner || !event.data) return;
    // Opening/reviewing a current frozen roster is explicit; old Table drafts keep
    // their own version and all must be reviewed again after an Event change.
    setBaseVersion(event.data.version);
    setSelected(id);
  };
  const save = (input: TableScoreInput) => {
    if (!selected || !sameOwner || !event.data || baseVersion === null) return;
    setScores((old) => ({ ...old, [selected]: input }));
    setScoreVersions((old) => ({ ...old, [selected]: baseVersion }));
    setSelected(null);
  };
  const finalize = () => {
    if (submitted.current || !ready || !event.data || actions.busy) return false;
    submitted.current = true;
    actions.finalize.mutate({
      version: baseVersion ?? event.data.version,
      results: included.map((row) => ({ tableId: row.id, ...scores[row.id] })),
    });
    setConfirm(false);
    return true;
  };
  return {
    event,
    tables,
    selected: sameOwner ? selected : null,
    table,
    seats,
    players,
    included,
    scores: currentScores,
    isScoreCurrent,
    ready,
    actions,
    error: draft?.phase === "failed",
    checking: draft?.phase === "verifying",
    confirm: sameOwner && confirm,
    setConfirm,
    open,
    save,
    close: () => setSelected(null),
    finalize,
    playersReady: Boolean(
      table.data?.confirmed &&
        !communityAccessDenied(table.error) &&
        players.length === table.data.confirmed.playerIds.length &&
        !seats.isError,
    ),
    conflict: Boolean(
      sameOwner &&
        event.data &&
        Object.keys(scores).some((id) => scoreVersions[id] !== event.data.version),
    ),
  };
}
