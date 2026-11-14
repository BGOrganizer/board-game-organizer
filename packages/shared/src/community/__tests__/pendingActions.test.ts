import type { TableRegistration } from "@board-game-organizer/schemas";
import { afterEach, expect, it, vi } from "vitest";
import { eventPendingAction, groupPendingAction, tablePendingAction } from "../pendingActions";

const at = Date.parse("2030-01-01T00:00:00.000Z");
const row: TableRegistration = {
  id: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  tableId: "33333333-3333-4333-8333-333333333333",
  userId: "recipient",
  kind: "INVITATION",
  status: "PENDING",
  version: 1,
  sequence: 1,
  priorityAt: "2030-01-01T00:00:00.000Z",
  gameVotes: {},
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
afterEach(() => vi.useRealTimers());
it("shows Group review only to its admin from a complete source count, never from unread state", () => {
  expect(groupPendingAction({ role: "admin", myMembership: null, pendingRequestCount: 1 })).toBe(
    "review",
  );
  for (const count of [0, -1, null, undefined])
    expect(
      groupPendingAction({ role: "admin", myMembership: null, pendingRequestCount: count }),
    ).toBeNull();
  expect(
    groupPendingAction({ role: "accepted", myMembership: null, pendingRequestCount: 8 }),
  ).toBeNull();
});
it("distinguishes a recipient's pending Group invitation from outgoing requests and resolved memberships", () => {
  const membership = { ...row, groupId: row.eventId, kind: "INVITATION" as const };
  expect(groupPendingAction({ role: "invited", myMembership: membership })).toBe("reply");
  expect(groupPendingAction({ role: "invited", myMembership: null })).toBeNull();
  expect(
    groupPendingAction({ role: "invited", myMembership: { ...membership, kind: "REQUEST" } }),
  ).toBeNull();
  expect(
    groupPendingAction({ role: "invited", myMembership: { ...membership, status: "ACCEPTED" } }),
  ).toBeNull();
  expect(
    groupPendingAction({ role: "requested", myMembership: { ...membership, kind: "REQUEST" } }),
  ).toBeNull();
});
it("aggregates complete own Event invitations even when another Table is already accepted, without organizer approval", () => {
  const event = {
    status: "PLANNING" as const,
    groupType: "PRIVATE" as const,
    myRegistrations: [row],
  };
  expect(eventPendingAction(event, at)).toBe("reply");
  expect(
    eventPendingAction(
      { ...event, myRegistrations: [{ ...row, id: "other", status: "ACCEPTED" }, row] },
      at,
    ),
  ).toBe("reply");
  expect(
    eventPendingAction({ ...event, myRegistrations: [{ ...row, kind: "SELF" }] }, at),
  ).toBeNull();
  expect(
    eventPendingAction({ ...event, myRegistrations: [{ ...row, status: "DECLINED" }] }, at),
  ).toBeNull();
  expect(eventPendingAction({ ...event, myRegistrations: [] }, at)).toBeNull();
  expect(eventPendingAction({ ...event, status: "CONFIRMED" }, at)).toBeNull();
  const publicEvent = {
    ...event,
    groupType: "PUBLIC" as const,
    bookingClosesAt: new Date(at + 1).toISOString(),
  };
  expect(eventPendingAction(publicEvent, at)).toBe("reply");
  expect(eventPendingAction(publicEvent, at + 1)).toBeNull();
  expect(eventPendingAction({ ...publicEvent, bookingClosesAt: undefined }, at)).toBeNull();
  expect(eventPendingAction({ ...publicEvent, bookingClosesAt: "invalid" }, at)).toBeNull();
  vi.useFakeTimers();
  vi.setSystemTime(at);
  expect(eventPendingAction(event)).toBe("reply");
});
it("requires actual Table response capability, pending recipient invitation and an open public cutoff", () => {
  const table = {
    eventStatus: "PLANNING" as const,
    groupType: "PRIVATE" as const,
    canRespond: true,
    myRegistration: row,
  };
  expect(tablePendingAction(table, at)).toBe("reply");
  expect(tablePendingAction({ ...table, eventStatus: "TERMINATED" }, at)).toBeNull();
  expect(tablePendingAction({ ...table, canRespond: false }, at)).toBeNull();
  expect(tablePendingAction({ ...table, myRegistration: null }, at)).toBeNull();
  expect(tablePendingAction({ ...table, myRegistration: { ...row, kind: "SELF" } }, at)).toBeNull();
  expect(
    tablePendingAction({ ...table, myRegistration: { ...row, status: "ACCEPTED" } }, at),
  ).toBeNull();
  const publicTable = {
    ...table,
    groupType: "PUBLIC" as const,
    bookingClosesAt: new Date(at + 1).toISOString(),
  };
  expect(tablePendingAction(publicTable, at)).toBe("reply");
  expect(tablePendingAction(publicTable, at + 1)).toBeNull();
  expect(tablePendingAction({ ...publicTable, bookingClosesAt: undefined }, at)).toBeNull();
  vi.useFakeTimers();
  vi.setSystemTime(at);
  expect(tablePendingAction(table)).toBe("reply");
});
