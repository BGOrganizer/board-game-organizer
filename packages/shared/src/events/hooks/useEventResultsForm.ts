"use client";

import { useState } from "react";
import type { CommunityApiOptions } from "../../community/communityApi";
import type { TableScoreInput } from "../tableScoreForm";
import { useEventRecordActions } from "./useEventRecordActions";
import { useEventRecord, useRecordTable, useRecordTables, useTableSeats } from "./useEventRecords";
export function useEventResultsForm(options: CommunityApiOptions, eventId: string) {
  const event = useEventRecord(options, eventId),
    tables = useRecordTables(options, eventId),
    [selected, setSelected] = useState<string | null>(null),
    [scores, setScores] = useState<Record<string, TableScoreInput>>({}),
    [baseVersion, setBaseVersion] = useState<number | null>(null),
    [error, setError] = useState(false),
    [confirm, setConfirm] = useState(false),
    actions = useEventRecordActions(options, eventId),
    table = useRecordTable(
      { ...options, enabled: options.enabled !== false && !!selected },
      eventId,
      selected ?? "",
    ),
    seats = useTableSeats(
      { ...options, enabled: options.enabled !== false && !!selected },
      eventId,
      selected ?? "",
    );
  const included = tables.items.filter((row) => Boolean(row.confirmed)),
    players = (table.data?.confirmed?.playerIds ?? []).flatMap((id) => {
      const p = seats.items.find((row) => row.userId === id);
      return p ? [{ id, name: p.name ?? id, email: p.email ?? null, avatarUrl: p.avatarUrl }] : [];
    }),
    ready = Boolean(
      included.length &&
        !tables.hasNextPage &&
        !tables.isPending &&
        !tables.isError &&
        included.every((row) => scores[row.id]) &&
        event.data?.canFinalize &&
        (baseVersion === null || baseVersion === event.data.version),
    );
  const open = (id: string) => {
    if (baseVersion === null && event.data) setBaseVersion(event.data.version);
    setSelected(id);
  };
  const save = (input: TableScoreInput) => {
    if (selected) setScores((old) => ({ ...old, [selected]: input }));
    setSelected(null);
  };
  const finalize = async () => {
    if (!ready || !event.data || actions.busy) return null;
    setError(false);
    try {
      const result = await actions.finalize.mutateAsync({
        version: baseVersion ?? event.data.version,
        results: included.map((row) => ({ tableId: row.id, ...scores[row.id] })),
      });
      setConfirm(false);
      return result;
    } catch {
      setError(true);
      return null;
    }
  };
  return {
    event,
    tables,
    selected,
    table,
    seats,
    players,
    included,
    scores,
    ready,
    actions,
    error,
    confirm,
    setConfirm,
    open,
    save,
    close: () => setSelected(null),
    finalize,
    playersReady: Boolean(
      table.data?.confirmed &&
        players.length === table.data.confirmed.playerIds.length &&
        !seats.isError,
    ),
    conflict: Boolean(event.data && baseVersion !== null && baseVersion !== event.data.version),
  };
}
