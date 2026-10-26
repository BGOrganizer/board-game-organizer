import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { eventTableRoster } from "../eventTableRoster";

const at = "2030-06-01T10:00:00Z";
const table: PlannedTableResponse = {
  id: "table",
  eventId: "event",
  name: "Table",
  order: 0,
  minPlayers: 2,
  maxPlayers: 4,
  rankingEnabled: true,
  games: [{ gameId: 1 }],
  createdAt: at,
  updatedAt: at,
  eventName: "Event",
  groupId: null,
  groupType: null,
  eventStatus: "PLANNING",
  adminUserId: "owner",
  myRegistration: null,
  myPosition: null,
  seatedCount: 0,
  pendingCount: 0,
  waitingCount: 0,
  canRegister: true,
  canRespond: false,
  canLeave: false,
  canInvite: true,
  gamesDetail: [],
  ratingChanges: [],
};
function seat(
  id: string,
  status: TableSeatResponse["status"] = "ACCEPTED",
  position: TableSeatResponse["position"] = "SEATED",
): TableSeatResponse {
  return {
    id,
    eventId: "event",
    tableId: "table",
    userId: id,
    kind: status === "PENDING" ? "INVITATION" : "SELF",
    status,
    position,
    priorityAt: at,
    sequence: 0,
    version: 1,
    gameVotes: {},
    createdAt: at,
    updatedAt: at,
    name: id,
    email: `${id}@example.test`,
    username: id,
    avatarUrl: "https://example.test/avatar",
  };
}
it("starts with maximum anonymous places and always leaves a queued entry point even for existing participants", () => {
  expect(eventTableRoster(table, [], [], "owner", 20).rows.map((r) => r.kind)).toEqual([
    "empty",
    "empty",
    "empty",
    "empty",
  ]);
  const full = eventTableRoster(
    {
      ...table,
      seatedCount: 2,
      pendingCount: 2,
      waitingCount: 5,
      canRegister: false,
      canInvite: false,
    },
    [seat("a"), seat("b")],
    [seat("c", "PENDING"), seat("d", "PENDING"), seat("e", "ACCEPTED", "WAITING")],
    "owner",
    20,
  );
  expect(full.rows.at(-1)).toMatchObject({ kind: "empty", queue: true });
  expect(full.rows.filter((r) => r.kind === "player")).toHaveLength(5);
  expect(
    eventTableRoster({ ...table, maxPlayers: 1000000 }, [], [], "owner", 20).rows,
  ).toHaveLength(20);
  expect(eventTableRoster(table, [], [], "owner", -1).rows).toEqual([]);
  expect(
    eventTableRoster({ ...table, eventStatus: "CONFIRMED" }, [], [], "owner", 20).rows,
  ).toEqual([]);
});
it("keeps pending identities private and shows anonymous reserved capacity while paging", () => {
  const result = eventTableRoster(
    { ...table, pendingCount: 4 },
    [],
    [seat("secret", "PENDING")],
    "member",
    20,
  );
  expect(result.rows.filter((r) => r.kind === "reserved")).toHaveLength(4);
  expect(JSON.stringify(result.rows)).not.toContain("secret");
  const own = seat("member", "PENDING");
  expect(
    eventTableRoster(
      { ...table, myRegistration: own, myPosition: "SEATED", pendingCount: 4 },
      [],
      [],
      "member",
      20,
    ).rows[0],
  ).toMatchObject({
    kind: "player",
    user: { userId: "member", position: "SEATED", name: "member" },
  });
  expect(
    eventTableRoster({ ...table, myRegistration: own, pendingCount: 4 }, [], [], "someone", 2).rows,
  ).toHaveLength(2);
});
it("keeps latest registration versions across both streams and own mutation responses", () => {
  const accepted = { ...seat("owner"), version: 3 };
  const old = { ...accepted, status: "PENDING" as const, version: 1 };
  expect(eventTableRoster(table, [accepted, accepted], [old], "owner", 20).rows[0]).toMatchObject({
    user: { status: "ACCEPTED", version: 3 },
  });
  const replaced = eventTableRoster(
    { ...table, myRegistration: { ...accepted, version: 4 } },
    [accepted],
    [],
    "owner",
    20,
  );
  expect(replaced.rows[0]).toMatchObject({
    user: {
      version: 4,
      name: "owner",
      email: accepted.email,
      avatarUrl: accepted.avatarUrl,
      username: "owner",
      position: "SEATED",
    },
  });
  expect(
    eventTableRoster({ ...table, myRegistration: old }, [accepted], [], "owner", 20).rows[0],
  ).toMatchObject({ user: { version: 3 } });
  expect(
    eventTableRoster(
      { ...table, myRegistration: { ...accepted, status: "CANCELLED", version: 4 } },
      [accepted],
      [],
      "owner",
      20,
    ).rows.every((r) => r.kind !== "player"),
  ).toBe(true);
  expect(
    eventTableRoster({ ...table, myRegistration: seat("owner") }, [], [], "owner", 20).rows[0],
  ).toMatchObject({ user: { position: "WAITING" } });
  expect(
    eventTableRoster(table, [seat("cancelled", "CANCELLED")], [], "owner", 20).rows.every(
      (r) => r.kind !== "player",
    ),
  ).toBe(true);
});
it("uses authorized self-profile details for a pending recipient without fetching other pending identities", () => {
  const own = {
    ...seat("member", "PENDING"),
    name: "Current player",
    avatarUrl: "https://example.test/current",
    email: "current@example.test",
    username: "current",
  };
  expect(
    eventTableRoster({ ...table, myRegistration: own, myPosition: "WAITING" }, [], [], "member", 20)
      .rows[0],
  ).toMatchObject({
    user: {
      name: "Current player",
      avatarUrl: own.avatarUrl,
      email: own.email,
      username: own.username,
    },
  });
});
it("retains known profiles or anonymous fallbacks for old unenriched registration responses", () => {
  const raw = {
    ...seat("owner"),
    name: undefined,
    email: undefined,
    username: undefined,
    avatarUrl: undefined,
  };
  expect(
    eventTableRoster({ ...table, myRegistration: raw }, [], [], "owner", 20).rows[0],
  ).toMatchObject({ user: { name: null, email: null, username: null, avatarUrl: null } });
  expect(
    eventTableRoster({ ...table, myRegistration: raw }, [seat("owner")], [], "owner", 20).rows[0],
  ).toMatchObject({
    user: {
      name: "owner",
      email: "owner@example.test",
      username: "owner",
      avatarUrl: "https://example.test/avatar",
    },
  });
});
it("orders seated/frozen before waiters, then original timestamp, sequence and stable ID", () => {
  const rows = [
    seat("waiting", "ACCEPTED", "WAITING"),
    { ...seat("later"), priorityAt: "2030-06-02T10:00:00Z" },
    { ...seat("sequence"), sequence: 2 },
    seat("b"),
    seat("a"),
    seat("pending", "PENDING"),
  ];
  expect(
    eventTableRoster(table, rows, [], "owner", 20)
      .rows.filter((r) => r.kind === "player")
      .map((r) => (r.kind === "player" ? r.user.id : "")),
  ).toEqual(["a", "b", "pending", "sequence", "later", "waiting"]);
  expect(
    eventTableRoster(table, [seat("new", "PENDING")], [seat("new", "PENDING")], "owner", 20)
      .rows[0],
  ).toMatchObject({ user: { id: "new" } });
});
