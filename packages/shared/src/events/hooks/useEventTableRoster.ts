"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedMutations } from "../../common/hooks/useScopedMutations";
import type { CommunityApiOptions } from "../../community/communityApi";
import { useProfileQuery } from "../../profile/hooks/useProfile";
import { canManageEvent } from "../eventRecordPolicy";
import {
  type PendingTableInvitation,
  pendingInvitationPlaces,
  pendingParticipationPlaces,
} from "../eventTablePending";
import { eventTableRoster } from "../eventTableRoster";
import { eventTableSections } from "../eventTableSections";
import { useEventParticipationIntent } from "./useEventParticipationIntent";
import { eventRecordKeys, useTableSeats } from "./useEventRecords";
export function useEventTableRoster(o: CommunityApiOptions, table: PlannedTableResponse) {
  const owner = JSON.stringify([o.apiUrl, o.userId, table.eventId, table.id]);
  const [window, setWindow] = useState({ owner, limit: 20 });
  const lease = useRef({ owner, epoch: 0, limit: 20, active: false });
  if (lease.current.owner !== owner) {
    lease.current = { owner, epoch: 0, limit: 20, active: false };
    setWindow({ owner, limit: 20 });
  }
  const generation = lease.current;
  const activation = generation.epoch;
  const limit = window.owner === owner ? window.limit : 20;
  // Subscribe to the canonical owned profile; roster presentation never starts another request.
  const selfProfile = useProfileQuery({ ...o, userId: o.userId, enabled: false }).data;
  const accepted = useTableSeats(o, table.eventId, table.id);
  const pending = useTableSeats(
    {
      ...o,
      enabled:
        o.enabled !== false && table.eventStatus === "PLANNING" && canManageEvent(table, o.userId),
    },
    table.eventId,
    table.id,
    true,
  );
  const resetAccepted = accepted.resetPresentation;
  const resetPending = pending.resetPresentation;
  const resetPresentation = useCallback(() => {
    if (lease.current !== generation) return;
    generation.epoch++;
    generation.limit = 20;
    resetAccepted();
    resetPending();
    setWindow({ owner, limit: 20 });
  }, [generation, owner, resetAccepted, resetPending]);
  useEffect(() => {
    generation.active = true;
    return () => {
      generation.active = false;
      resetPresentation();
    };
  }, [generation, resetPresentation]);
  const ownerPending = table.eventStatus === "PLANNING" && canManageEvent(table, o.userId);
  const pages = ownerPending ? [accepted, pending] : [accepted];
  const view = eventTableRoster(
    table,
    accepted.items,
    ownerPending ? pending.items : [],
    o.userId ?? "",
    limit,
    selfProfile,
  );
  const invitations = useScopedMutations({
    mutationKey: eventRecordKeys.mutation(o, table.eventId, "invite"),
    status: "pending",
  })
    .map((mutation): PendingTableInvitation | undefined => {
      const input = mutation.state.variables as {
        tableId: string;
        userId: string;
        person?: PendingTableInvitation["person"];
      };
      return ownerPending && input.tableId === table.id
        ? { key: `sending:${mutation.mutationId}`, userId: input.userId, person: input.person }
        : undefined;
    })
    .filter((invitation) => invitation !== undefined);
  const canonicalAccepted =
    accepted.items.some((row) => row.userId === o.userId && row.status === "ACCEPTED") ||
    (table.myRegistration?.userId === o.userId && table.myRegistration?.status === "ACCEPTED");
  const participation = useEventParticipationIntent(o, table.eventId, table.id, canonicalAccepted);
  const combined = pendingParticipationPlaces(
    pendingInvitationPlaces(
      view.rows,
      invitations,
      [...accepted.items, ...pending.items].map((row) => row.userId),
    ),
    participation,
    o.userId,
    canonicalAccepted,
    selfProfile,
  );
  const grouped = eventTableSections(combined, view.queueOpen);
  const rows = [...grouped.seats, ...grouped.waiting].slice(0, limit);
  const sections = eventTableSections(rows, view.queueOpen);
  const total = view.total + Math.max(0, combined.length - view.rows.length);
  const fetching = pages.some((page) => page.isFetchingNextPage);
  const failedPage = pages.some((page) => page.isFetchNextPageError);
  return {
    ...view,
    rows,
    seatRows: sections.seats,
    waitingRows: sections.waiting,
    total,
    isPending: pages.some((page) => page.isPending && !page.data),
    isError: pages.some((page) => page.isError),
    isFetchingNextPage: fetching,
    isFetchNextPageError: failedPage,
    hasNextPage: pages.some((page) => page.hasNextPage) || total > limit,
    refetch: () => {
      for (const page of pages) if (page.isError) void page.refetch();
    },
    resetPresentation,
    more: () => {
      if (
        lease.current !== generation ||
        !generation.active ||
        generation.epoch !== activation ||
        generation.limit !== limit ||
        fetching
      )
        return;
      generation.limit = limit + 20;
      const page = pages.find((page) => page.hasNextPage);
      if (page) void page.fetchNextPage();
      setWindow((old) =>
        lease.current === generation && generation.active && generation.epoch === activation
          ? { owner, limit: limit + 20 }
          : old,
      );
    },
  };
}
