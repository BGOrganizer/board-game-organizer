"use client";
import type { PlannedTableResponse, TableSeatOrderSnapshot } from "@board-game-organizer/schemas";
import { useEffect, useRef, useState } from "react";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { useEventRecordActions } from "./useEventRecordActions";
export function useTableSeatOrder(o: CommunityApiOptions, table: PlannedTableResponse) {
  const action = useEventRecordActions(o, table.eventId);
  const ownerKey = JSON.stringify([
    o.apiUrl,
    o.userId,
    table.id,
    table.canManage,
    table.eventStatus,
  ]);
  const snapshotOwner = useRef(ownerKey);
  const [snapshot, setSnapshot] = useState<TableSeatOrderSnapshot | null>(null),
    [rows, setRows] = useState<TableSeatOrderSnapshot["registrations"]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false),
    [editing, setEditing] = useState(false);
  const [seatedCount, setSeatedCount] = useState(0);
  const [needsReview, setNeedsReview] = useState(false);
  const epoch = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => {
    snapshotOwner.current = ownerKey;
    epoch.current++;
    setSnapshot(null);
    setRows([]);
    setEditing(false);
    setError(false);
    setLoading(false);
    setNeedsReview(false);
    return () => {
      requestController.current?.abort();
      epoch.current++;
    };
  }, [ownerKey]);
  const stale =
    needsReview ||
    Boolean(
      snapshot && table.eventVersion !== undefined && snapshot.version !== table.eventVersion,
    );
  const revoke = () => {
    requestController.current?.abort();
    epoch.current++;
    setSnapshot(null);
    setRows([]);
    setEditing(false);
    setLoading(false);
    setError(false);
    setNeedsReview(false);
    setSeatedCount(0);
  };
  const start = async () => {
    if (!table.canManage || table.eventStatus !== "PLANNING") return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const current = ++epoch.current;
    snapshotOwner.current = ownerKey;
    setEditing(true);
    setLoading(true);
    setError(false);
    try {
      const value = await communityRequest<TableSeatOrderSnapshot>(
        o,
        `events/${table.eventId}/tables/${table.id}/seats/order`,
        "GET",
        undefined,
        controller.signal,
      );
      if (current !== epoch.current) return;
      setSnapshot(value);
      setRows(value.registrations);
      setSeatedCount(value.seatedCount);
      setNeedsReview(false);
    } catch (error) {
      if (current !== epoch.current) return;
      if (communityAccessDenied(error)) {
        revoke();
        return;
      }
      if (error instanceof CommunityApiError && error.status === 409) setNeedsReview(true);
      setError(true);
    } finally {
      if (current === epoch.current) setLoading(false);
    }
  };
  const canMove = (index: number, delta: number) => {
    if (index === seatedCount && delta === -1 && seatedCount < (snapshot?.capacity ?? 0))
      return rows[index]?.status === "ACCEPTED" && !rows[index].locked;
    const other = index + delta;
    return (
      other >= 0 &&
      other < rows.length &&
      rows[index].status === "ACCEPTED" &&
      !rows[index].locked &&
      rows[other].status === "ACCEPTED" &&
      !rows[other].locked
    );
  };
  const move = (index: number, delta: number) => {
    if (!canMove(index, delta)) return;
    if (index === seatedCount && delta === -1 && seatedCount < (snapshot?.capacity ?? 0)) {
      setSeatedCount((value) => value + 1);
      return;
    }
    setRows((old) => {
      const next = [...old];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  };
  const lock = (index: number) =>
    setRows((old) =>
      old.map((row, i) =>
        i === index && row.status === "ACCEPTED" && index < seatedCount
          ? { ...row, locked: !row.locked }
          : row,
      ),
    );
  const reset = () => {
    requestController.current?.abort();
    epoch.current++;
    setRows(snapshot?.registrations ?? []);
    setSeatedCount(snapshot?.seatedCount ?? 0);
    setEditing(false);
    setError(false);
    setNeedsReview(false);
  };
  const save = async () => {
    if (!snapshot || stale) return;
    const current = epoch.current;
    try {
      const value = await action.reorderSeats.mutateAsync({
        tableId: table.id,
        input: {
          version: snapshot.version,
          allocationKey: snapshot.allocationKey,
          seatedCount,
          registrations: rows.map((row) => ({
            id: row.id,
            version: row.version,
            locked: Boolean(row.locked),
          })),
        },
      });
      if (current !== epoch.current) return;
      setSnapshot(value);
      setRows(value.registrations);
      setSeatedCount(value.seatedCount);
      setEditing(false);
    } catch (error) {
      if (current !== epoch.current) return;
      if (communityAccessDenied(error)) {
        revoke();
        return;
      }
      if (error instanceof CommunityApiError && error.status === 409) setNeedsReview(true);
      setError(true);
    }
  };
  return {
    editing: editing && snapshotOwner.current === ownerKey,
    loading,
    error,
    stale,
    rows: snapshotOwner.current === ownerKey ? rows : [],
    capacity: snapshot?.capacity ?? table.maxPlayers,
    seatedCount,
    start,
    move,
    canMove,
    lock,
    reset,
    save,
    busy: action.reorderSeats.isPending,
  };
}
