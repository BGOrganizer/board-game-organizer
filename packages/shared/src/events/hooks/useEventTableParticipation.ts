"use client";

import type { EventBookingResponse, MatchDetailResponse } from "@board-game-organizer/schemas";
import { useState } from "react";
import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import { matchParticipants } from "../../matches/matchParticipants";
import { eventBookingReservesSeat } from "../eventPolicy";
import { eventTableSeats, type TableSeatUser } from "../eventTableSeats";
import { useEventActions, useEventBookings } from "./useEvents";
import { useEventTableContext } from "./useEventTableContext";

type BookingDialog = {
  kind: "booking";
  id: string;
  status: string;
  bookingKind: string;
  updatedAt: string;
  mode: "manage" | "invitation" | "cancel" | "remove";
};
export type TableParticipationDialog = { kind: "join"; index: number } | BookingDialog;
export function useEventTableParticipation(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  frozen?: MatchDetailResponse,
) {
  const {
    eventQuery: eq,
    tableQuery: tq,
    event,
    table,
    open: windowOpen,
  } = useEventTableContext(o, eventId, tableId);
  const visitor = !frozen && event?.role === "visitor";
  const bookings = useEventBookings(
    { ...o, enabled: o.enabled !== false && Boolean(event && table && !visitor && !frozen) },
    eventId,
    tableId,
  );
  const open =
    o.enabled !== false &&
    windowOpen &&
    table?.status === "PLANNING" &&
    !frozen &&
    !communityAccessDenied(bookings.error);
  const actions = useEventActions(o);
  const [dialog, setDialog] = useState<TableParticipationDialog | null>(null);
  const [limit, setLimit] = useState(20);
  const [pin, setPin] = useState<{ userId: string; index: number }>();
  const rows =
    o.enabled === false || !event || !table || visitor || communityAccessDenied(bookings.error)
      ? []
      : bookings.items;
  const mine = o.enabled === false ? undefined : table?.myBooking;
  const live = rows.filter(eventBookingReservesSeat);
  if (mine && eventBookingReservesSeat(mine) && !live.some((row) => row.id === mine.id))
    live.push({ ...mine, username: null, avatarUrl: null });
  const frozenPlayers = frozen && o.enabled !== false ? matchParticipants(frozen) : undefined;
  const users: TableSeatUser[] = frozenPlayers
    ? frozenPlayers.map((p) => ({
        id: p.id,
        userId: p.id,
        name: p.name,
        secondary: p.email,
        avatarUrl: p.avatarUrl,
      }))
    : live.map((b) => ({
        id: b.id,
        userId: b.userId,
        name: b.username ?? "",
        avatarUrl: b.avatarUrl,
      }));
  const maxPlayers = o.enabled === false ? 0 : (frozen?.match.maxPlayers ?? table?.maxPlayers ?? 0);
  const seats = eventTableSeats({
    users,
    maxPlayers,
    reservedCount: frozenPlayers?.length ?? table?.reservedCount ?? 0,
    limit,
    pin,
  });
  const canJoin = Boolean(
    o.enabled !== false && open && table?.canBook && !actions.busy && !visitor,
  );
  const admin = event?.role === "admin";
  const managed =
    dialog?.kind === "booking"
      ? live.find(
          (row) =>
            row.id === dialog.id &&
            row.status === dialog.status &&
            row.kind === dialog.bookingKind &&
            row.updatedAt === dialog.updatedAt,
        )
      : undefined;
  const canManage = (b: EventBookingResponse) =>
    Boolean(open && admin && b.status === "PENDING" && b.kind === "REQUEST");
  const canLeave = (b: EventBookingResponse) => Boolean(open && b.userId === o.userId);
  const canRespond = (b: EventBookingResponse) =>
    Boolean(canLeave(b) && b.status === "PENDING" && b.kind === "INVITATION");
  const openBooking = (b: EventBookingResponse, mode: BookingDialog["mode"]) => {
    if (
      actions.busy ||
      !(mode === "manage"
        ? canManage(b)
        : mode === "invitation"
          ? canRespond(b)
          : mode === "remove"
            ? open && admin
            : canLeave(b))
    )
      return;
    setDialog({
      kind: "booking",
      id: b.id,
      status: b.status,
      bookingKind: b.kind,
      updatedAt: b.updatedAt,
      mode,
    });
  };
  const submit = async (
    action?: "approve" | "reject" | "accept" | "decline" | "cancel" | "remove",
  ) => {
    if (actions.busy || !open || !dialog) return;
    if (dialog.kind === "join") {
      if (!canJoin || !seats.some((seat) => seat.index === dialog.index && !seat.reserved)) return;
      const previous = pin;
      setPin({ userId: o.userId ?? "", index: dialog.index });
      try {
        const booking = await actions.request.mutateAsync({ eventId, tableId });
        setPin({ userId: booking.userId, index: dialog.index });
      } catch (error) {
        setPin(previous);
        throw error;
      }
    } else {
      if (!managed || !action) return;
      const allowed =
        dialog.mode === "manage"
          ? canManage(managed) && (action === "approve" || action === "reject")
          : dialog.mode === "invitation"
            ? canRespond(managed) && (action === "accept" || action === "decline")
            : dialog.mode === "remove"
              ? admin && action === "remove"
              : canLeave(managed) && action === "cancel";
      if (!allowed) return;
      await actions.booking.mutateAsync({ id: managed.id, action, eventId });
    }
    setDialog(null);
  };
  const canPage =
    o.enabled !== false && !visitor && (Boolean(frozen) || !communityAccessDenied(bookings.error));
  const advance = async () => {
    if (!canPage || bookings.isFetchingNextPage || bookings.isFetchNextPageError) return;
    const next = Math.min(maxPlayers, limit + 20);
    if (!frozen && bookings.hasNextPage && live.length < Math.min(next, table?.reservedCount ?? 0))
      await bookings.fetchNextPage();
    setLimit(next);
  };
  return {
    eventQuery: eq,
    tableQuery: tq,
    event,
    table,
    bookings,
    live,
    seats,
    frozen: Boolean(frozen),
    visitor,
    loading:
      !frozen &&
      (eq.isPending ||
        (Boolean(event) && tq.isPending) ||
        (Boolean(event && table && !visitor) && bookings.isPending && !live.length)),
    error: frozen ? null : (eq.error ?? tq.error ?? bookings.error),
    open,
    admin,
    busy: actions.busy,
    canJoin,
    canManage,
    canLeave,
    canRespond,
    managed,
    dialog:
      !open ||
      (dialog?.kind === "booking" && !managed) ||
      (dialog?.kind === "join" &&
        !actions.busy &&
        (!canJoin || !seats.some((seat) => seat.index === dialog.index && !seat.reserved)))
        ? null
        : dialog,
    openJoin: (index: number) => {
      if (canJoin && seats.some((seat) => seat.index === index && !seat.reserved))
        setDialog({ kind: "join", index });
    },
    openBooking,
    submit,
    dismiss: () => {
      if (!actions.busy) setDialog(null);
    },
    hasMore:
      canPage &&
      ((!frozen && bookings.hasNextPage && live.length < (table?.reservedCount ?? 0)) ||
        limit < maxPlayers),
    advance,
  };
}
