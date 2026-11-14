"use client";
import type { PlannedTableResponse, TableSeatOrderSnapshot } from "@board-game-organizer/schemas";
import { useEffect, useRef, useState } from "react";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { moveSeatOrder, normalizeSeatOrder, seatOrderPlaces } from "../tableSeatOrderDraft";
import { useEventRecordActions } from "./useEventRecordActions";

type SeatRow = TableSeatOrderSnapshot["registrations"][number] & { seatIndex: number | null };
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
    [rows, setRows] = useState<SeatRow[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false),
    [editing, setEditing] = useState(false);
  const seatedCount = rows.filter((row) => row.seatIndex !== null).length;
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
    Boolean(snapshot && table.eventVersion !== undefined && table.eventVersion > snapshot.version);
  const revoke = () => {
    requestController.current?.abort();
    epoch.current++;
    setSnapshot(null);
    setRows([]);
    setEditing(false);
    setLoading(false);
    setError(false);
    setNeedsReview(false);
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
      setRows(normalizeSeatOrder(value.registrations, value.seatedCount));
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
  const capacity = snapshot?.capacity ?? table.maxPlayers;
  const canMove = (index: number, delta: number) =>
    Boolean(moveSeatOrder(rows, index, delta, capacity));
  const move = (index: number, delta: number) => {
    setRows((old) => moveSeatOrder(old, index, delta, capacity) ?? old);
  };
  const lock = (index: number) =>
    setRows((old) =>
      old.map((row, i) =>
        i === index && row.seatIndex !== null ? { ...row, locked: !row.locked } : row,
      ),
    );
  const reset = () => {
    requestController.current?.abort();
    epoch.current++;
    setRows(normalizeSeatOrder(snapshot?.registrations ?? [], snapshot?.seatedCount ?? 0));
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
            seatIndex: row.seatIndex,
          })),
        },
      });
      if (current !== epoch.current) return;
      setSnapshot(value);
      setRows(normalizeSeatOrder(value.registrations, value.seatedCount));
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
    capacity,
    places: seatOrderPlaces(snapshotOwner.current === ownerKey ? rows : [], capacity),
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
