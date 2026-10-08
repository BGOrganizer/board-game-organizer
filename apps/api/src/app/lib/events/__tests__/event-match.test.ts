import { describe, expect, it, vi } from "vitest";
import { MatchService } from "../../matches/match.service";

const source = {
  id: "match",
  clerkId: "admin",
  name: "Table · Event",
  status: "PLANNING",
  dates: ["2026-10-12T12:00:00.000Z"],
  minPlayers: 2,
  maxPlayers: 4,
  gameIds: [1],
  selectedGameId: 1,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  eventTable: {
    organizationId: "org",
    eventId: "event",
    tableId: "table",
    eventName: "Event",
    tableName: "Table",
    demonstratorUserId: "demo",
    openSkill: false,
    bookingClosesAt: "2026-10-11T12:00:00.000Z",
    endsAt: "2026-10-12T13:00:00.000Z",
  },
};
function setup(status = "PLANNING", openSkill = false, tableRepository = true) {
  const match = { ...source, status, eventTable: { ...source.eventTable, openSkill } };
  const matches = {
    findById: vi.fn(async () => match),
    serializeInvitationChange: vi.fn(async () => ({ matchedCount: 1 })),
    registerResults: vi.fn(async (_id, _owner, results) => ({
      ...match,
      results,
      status: "TERMINATED",
    })),
  };
  const invitations = {
    listByMatch: vi.fn(async () =>
      ["p1", "p2"].map((inviteeUserId) => ({
        id: inviteeUserId,
        matchId: "match",
        inviteeUserId,
        status: "ACCEPTED",
      })),
    ),
  };
  const ratings = {
    applyMatch: vi.fn(),
    currentForPlayers: vi.fn(async () => []),
    matchStats: vi.fn(async () => new Map()),
  };
  const tables = { markTerminated: vi.fn() };
  const service = new MatchService(
    matches as never,
    invitations as never,
    { findByIds: vi.fn(async () => []) } as never,
    {} as never,
    { findByIds: vi.fn(async () => []) } as never,
    undefined,
    undefined,
    ratings as never,
    undefined,
    tableRepository ? (tables as never) : undefined,
  );
  return { service, matches, ratings, tables };
}
describe("event table match boundaries", () => {
  it("omits unbooked administrator from table leaderboard", async () => {
    const { service, ratings } = setup("CREATED");
    await service.leaderboard("p1", "match", 1);
    expect(ratings.currentForPlayers).toHaveBeenCalledWith(["p1", "p2"], 1, null);
  });
  it("fails closed without transactional table finalizer", async () => {
    const { service } = setup("CREATED", false, false);
    await expect(
      service.registerResults("admin", "match", {
        lowerWins: false,
        entries: [
          { userId: "p1", score: "10" },
          { userId: "p2", score: "5" },
        ],
        tieBreaks: [],
      }),
    ).rejects.toThrow("Event service unavailable");
  });
  it("closes expired table before detail or results, failing closed if worker service is missing", async () => {
    const { matches } = setup();
    const initial = await matches.findById();
    initial.eventTable.bookingClosesAt = "2000-01-01T00:00:00.000Z";
    const make = (events?: unknown) =>
      new MatchService(
        matches as never,
        { listByMatch: vi.fn(async () => []) } as never,
        { findByIds: vi.fn(async () => []) } as never,
        {} as never,
        { findByIds: vi.fn(async () => []) } as never,
        undefined,
        undefined,
        undefined,
        events as never,
      );
    await expect(make().detail("demo", "match")).rejects.toThrow("Event service unavailable");
    await expect(
      make().registerResults("demo", "match", { lowerWins: false, entries: [], tieBreaks: [] }),
    ).rejects.toThrow("Event service unavailable");
    const close = vi.fn(async () => {
      initial.status = "CREATED";
    });
    expect((await make({ close }).detail("demo", "match")).match.status).toBe("CREATED");
    expect(close).toHaveBeenCalledWith("event");
    initial.status = "PLANNING";
    await expect(
      make({ close }).registerResults("demo", "match", {
        lowerWins: false,
        entries: [],
        tieBreaks: [],
      }),
    ).rejects.toThrow("At least one player must have participated");
    expect(close).toHaveBeenCalledTimes(2);
  });
  it("rejects ordinary voting, editing, invitation and deletion routes", async () => {
    const { service } = setup();
    for (const operation of [
      () => service.setChoice("admin", "match", { kind: "games", itemId: 1, choice: "YES" }),
      () => service.update("admin", "match", { name: "Changed table" }),
      () => service.invite("admin", "match", "guest"),
      () => service.deleteMatch("admin", "match"),
      () => service.setStatus("admin", "match", "CREATED"),
    ]) {
      await expect(operation()).rejects.toThrow(
        "Event tables must be managed through event bookings",
      );
    }
  });
  it("lets demonstrator register frozen booked roster without an implicit administrator seat", async () => {
    const { service, matches, ratings, tables } = setup("CREATED");
    const result = await service.registerResults("demo", "match", {
      lowerWins: false,
      entries: [
        { userId: "p1", score: "10" },
        { userId: "p2", score: null },
      ],
      tieBreaks: [],
    });
    expect(result.status).toBe("TERMINATED");
    expect(matches.registerResults).toHaveBeenCalledWith("match", "admin", expect.any(Object));
    expect(ratings.applyMatch).not.toHaveBeenCalled();
    expect(tables.markTerminated).toHaveBeenCalledWith("table");
  });
  it("still requires exact frozen roster and rejects an invented admin seat", async () => {
    const { service, matches } = setup("CREATED");
    await expect(
      service.registerResults("admin", "match", {
        lowerWins: false,
        entries: [
          { userId: "admin", score: "10" },
          { userId: "p1", score: "5" },
        ],
        tieBreaks: [],
      }),
    ).rejects.toThrow("Results must include every accepted player exactly once");
    expect(matches.registerResults).not.toHaveBeenCalled();
  });
  it("rejects an ordinary participant attempting result administration", async () => {
    const { service } = setup("CREATED");
    await expect(
      service.registerResults("p1", "match", { lowerWins: false, entries: [], tieBreaks: [] }),
    ).rejects.toThrow("Only match admin or demonstrator can register results");
  });
  it("rates only when table explicitly enables GLOBAL OpenSkill", async () => {
    const { service, ratings } = setup("CREATED", true);
    await service.registerResults("admin", "match", {
      lowerWins: false,
      entries: [
        { userId: "p1", score: "10" },
        { userId: "p2", score: "5" },
      ],
      tieBreaks: [],
    });
    expect(ratings.applyMatch).toHaveBeenCalledOnce();
  });
});
