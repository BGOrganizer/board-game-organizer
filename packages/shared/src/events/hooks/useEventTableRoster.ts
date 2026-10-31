"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useState } from "react";
import { useScopedMutations } from "../../common/hooks/useScopedMutations";
import type { CommunityApiOptions } from "../../community/communityApi";
import { useProfileQuery } from "../../profile/hooks/useProfile";
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
  const [limit, setLimit] = useState(20);
  // Subscribe to the canonical owned profile; roster presentation never starts another request.
  const selfProfile = useProfileQuery({ ...o, userId: o.userId, enabled: false }).data;
  const accepted = useTableSeats(o, table.eventId, table.id);
  const pending = useTableSeats(
    {
      ...o,
      enabled:
        o.enabled !== false && table.eventStatus === "PLANNING" && table.adminUserId === o.userId,
    },
    table.eventId,
    table.id,
    true,
  );
  const ownerPending = table.eventStatus === "PLANNING" && table.adminUserId === o.userId;
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
    more: () => {
      if (fetching) return;
      const page = pages.find((page) => page.hasNextPage);
      if (page) void page.fetchNextPage();
      setLimit((old) => old + 20);
    },
  };
}
