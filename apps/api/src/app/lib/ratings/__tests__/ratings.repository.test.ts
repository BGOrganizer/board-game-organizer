import type {
  EventRecord,
  Match,
  MatchResults,
  RatingState,
  TableRecord,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { RatingsRepository } from "../ratings.repository";

const id = "00000000-0000-4000-8000-000000000001";
const tableId = "00000000-0000-4000-8000-000000000002";
const groupId = "00000000-0000-4000-8000-000000000003";
const at = "2026-11-18T12:00:00.000Z";
const initial: RatingState = { mu: 25, sigma: 25 / 3, gamesPlayed: 0 };
const event: EventRecord = {
  id,
  groupId,
  name: "Rated evening",
  adminUserId: "user_admin",
  status: "CONFIRMED",
  confirmed: { dateId: id, locationId: id, at },
  timeZone: "Europe/Rome",
  startTime: "12:00",
  dates: [{ id, day: "2026-11-18" }],
  locations: [
    { id, name: "Venue", address: "Via Roma 1, Roma, Italia", latitude: 41.9, longitude: 12.5 },
  ],
  version: 1,
  planningGeneration: 1,
  nextPriority: 0,
  nextTableOrder: 1,
  createdAt: at,
  updatedAt: at,
};
const table: TableRecord = {
  id: tableId,
  eventId: id,
  name: "Rated table",
  order: 0,
  minPlayers: 2,
  maxPlayers: 4,
  games: [{ gameId: 42 }],
  rankingEnabled: true,
  confirmed: { gameId: 42, playerIds: ["user_a", "user_b"], startsAt: at },
  createdAt: at,
  updatedAt: at,
};
const results: MatchResults = {
  lowerWins: false,
  entries: [
    { userId: "user_b", score: "2", rank: 2 },
    { userId: "user_a", score: "4", rank: 1 },
  ],
  tieBreaks: [],
  finalizedAt: at,
};

function setup(session?: ClientSession) {
  const reads: Document[][] = [];
  const eventReads: Document[][] = [];
  const statsRows: Document[][] = [];
  const operations: string[] = [];
  const cursor = {
    sort: vi.fn((_sort: Document) => cursor),
    limit: vi.fn((_limit: number) => cursor),
    toArray: vi.fn(async () => reads.shift() ?? []),
  };
  const find = vi.fn((filter: Document, _options: Document) => {
    operations.push(`read:${filter.scope}`);
    return cursor;
  });
  const updateOne = vi.fn(async (filter: Document, _update: Document, _options: Document) => {
    operations.push(`write:${filter.scope}:${filter.userId}`);
    return { modifiedCount: 1 };
  });
  const insertOne = vi.fn(async (row: Document, _options: Document) => {
    operations.push(`event:${row.scope}:${row.userId}`);
    return { acknowledged: true };
  });
  const eventFind = vi.fn((_filter: Document, _options: Document) => ({
    toArray: async () => eventReads.shift() ?? [],
  }));
  const aggregate = vi.fn((_pipeline: Document[], _options: Document) => ({
    toArray: async () => statsRows.shift() ?? [],
  }));
  const db = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.PLAYER_RATINGS) return { find, updateOne };
      if (name === COLLECTIONS.RATING_EVENTS) return { find: eventFind, insertOne };
      if (name === COLLECTIONS.EVENT_TABLES || name === COLLECTIONS.MATCHES) return { aggregate };
      throw new Error(`Unexpected collection: ${name}`);
    }),
  };
  return {
    reads,
    eventReads,
    statsRows,
    operations,
    cursor,
    find,
    updateOne,
    insertOne,
    eventFind,
    aggregate,
    db,
    repo: new RatingsRepository(db as unknown as Db, session),
  };
}

describe("RatingsRepository actual table outcomes and Mongo boundary", () => {
  it.each([
    [{ ...event, status: "PLANNING" as const }, table],
    [{ ...event, status: "TERMINATED" as const }, table],
    [event, { ...table, confirmed: undefined }],
    [event, { ...table, eventId: groupId }],
  ])(
    "rejects a result without a matching confirmed parent/table before reading ratings",
    async (parent, resource) => {
      const fixture = setup();
      await expect(fixture.repo.applyTableResult(parent, resource, results)).rejects.toThrow(
        "Confirmed event table required",
      );
      expect(fixture.db.collection).not.toHaveBeenCalled();
    },
  );

  it("keeps the retained Match entry guard without synthesizing a selected game", async () => {
    const fixture = setup();
    await expect(fixture.repo.applyMatch({ id } as Match, results)).rejects.toThrow(
      "Confirmed match has no selected game",
    );
    expect(fixture.db.collection).not.toHaveBeenCalled();
  });

  it("reads both pre-outcome scopes before sequentially persisting each rating and immutable source event", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const globalA = { userId: "user_a", mu: 40, sigma: 2, gamesPlayed: 16 };
    const groupB = { userId: "user_b", mu: 18, sigma: 4, gamesPlayed: 8 };
    fixture.reads.push([globalA], [groupB]);
    await fixture.repo.applyTableResult(event, table, results);
    expect(fixture.find.mock.calls).toEqual([
      [
        { userId: { $in: ["user_b", "user_a"] }, gameId: 42, scope: "GLOBAL", groupId: null },
        { projection: { _id: 0 }, session },
      ],
      [
        { userId: { $in: ["user_b", "user_a"] }, gameId: 42, scope: "GROUP", groupId },
        { projection: { _id: 0 }, session },
      ],
    ]);
    expect(fixture.operations).toEqual([
      "read:GLOBAL",
      "read:GROUP",
      "write:GLOBAL:user_a",
      "event:GLOBAL:user_a",
      "write:GLOBAL:user_b",
      "event:GLOBAL:user_b",
      "write:GROUP:user_a",
      "event:GROUP:user_a",
      "write:GROUP:user_b",
      "event:GROUP:user_b",
    ]);
    expect(fixture.updateOne).toHaveBeenCalledTimes(4);
    expect(fixture.insertOne).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 4; index++) {
      const [filter, update, options] = fixture.updateOne.mock.calls[index];
      const [record, eventOptions] = fixture.insertOne.mock.calls[index];
      expect(options).toEqual({ session, upsert: true });
      expect(eventOptions).toEqual({ session });
      expect(update.$setOnInsert).toEqual(filter);
      expect(record).toMatchObject({
        ...filter,
        tableId,
        eventId: id,
        algorithm: "openskill-v1",
        finalizedAt: at,
        didNotFinish: false,
        delta: record.after.mu - record.before.mu,
      });
      expect(record).not.toHaveProperty("matchId");
      expect(update.$set).toEqual({
        ...record.after,
        conservativeScore: record.after.mu - 3 * record.after.sigma,
        updatedAt: at,
      });
      expect(record.after.gamesPlayed).toBe(record.before.gamesPlayed + 1);
    }
    const recorded = fixture.insertOne.mock.calls.map(([row]) => row);
    expect(recorded[0].before).toEqual({ mu: 40, sigma: 2, gamesPlayed: 16 });
    expect(recorded[1].before).toEqual(initial);
    expect(recorded[2].before).toEqual({
      mu: 40,
      sigma: (initial.sigma * 200) / 350,
      gamesPlayed: 0,
    });
    expect(recorded[3].before).toEqual({ mu: 18, sigma: 4, gamesPlayed: 8 });
    expect(recorded[2].before.mu).not.toBe(recorded[0].after.mu);
    expect(recorded[0].after.mu).toBeGreaterThan(recorded[0].before.mu);
    expect(recorded[1].after.mu).toBeLessThan(recorded[1].before.mu);
  });

  it("writes only global ratings for an ungrouped event, including the non-finisher outcome", async () => {
    const fixture = setup();
    await fixture.repo.applyTableResult({ ...event, groupId: null }, table, {
      ...results,
      entries: [...results.entries, { userId: "user_c", score: null, rank: null }],
    });
    expect(fixture.find).toHaveBeenCalledTimes(1);
    expect(fixture.insertOne).toHaveBeenCalledTimes(3);
    expect(fixture.insertOne.mock.calls[2]).toEqual([
      expect.objectContaining({
        userId: "user_c",
        scope: "GLOBAL",
        groupId: null,
        rank: 3,
        didNotFinish: true,
        before: initial,
        after: expect.objectContaining({ gamesPlayed: 1 }),
      }),
      {},
    ]);
  });

  it("does not count an outcome with fewer than two finishers", async () => {
    const fixture = setup();
    await fixture.repo.applyTableResult(event, table, {
      ...results,
      entries: [
        { userId: "user_a", score: "4", rank: 1 },
        { userId: "user_b", score: null, rank: null },
      ],
    });
    expect(fixture.find).toHaveBeenCalledTimes(2);
    expect(fixture.updateOne).not.toHaveBeenCalled();
    expect(fixture.insertOne).not.toHaveBeenCalled();
  });

  it("aborts on a rating-event failure before any subsequent player or group write", async () => {
    const fixture = setup();
    const failure = new Error("duplicate immutable outcome");
    fixture.insertOne.mockRejectedValueOnce(failure);
    await expect(fixture.repo.applyTableResult(event, table, results)).rejects.toBe(failure);
    expect(fixture.updateOne).toHaveBeenCalledTimes(1);
    expect(fixture.insertOne).toHaveBeenCalledTimes(1);
  });

  it("returns current group state in requested order, inheriting only missing players from global", async () => {
    const fixture = setup();
    fixture.reads.push(
      [{ userId: "user_b", mu: 29, sigma: 3.5, gamesPlayed: 5 }],
      [{ userId: "user_a", mu: 40, sigma: 2, gamesPlayed: 16 }],
    );
    const current = await fixture.repo.currentForPlayers(
      ["user_a", "user_b", "user_new"],
      42,
      groupId,
    );
    expect(fixture.find.mock.calls[1][0]).toEqual({
      userId: { $in: ["user_a", "user_new"] },
      gameId: 42,
      scope: "GLOBAL",
      groupId: null,
    });
    expect(current).toEqual([
      {
        userId: "user_a",
        score: expect.closeTo(500 + 40 - 3 * ((initial.sigma * 200) / 350), 10),
        provisional: true,
      },
      { userId: "user_b", score: 518.5, provisional: false },
      { userId: "user_new", score: 500, provisional: true },
    ]);
  });

  it("does not load global fallbacks for complete group results or make a group query for global results", async () => {
    const fixture = setup();
    fixture.reads.push([{ userId: "user_a", ...initial }], []);
    await expect(fixture.repo.currentForPlayers(["user_a"], 42, groupId)).resolves.toEqual([
      { userId: "user_a", score: 500, provisional: true },
    ]);
    await expect(fixture.repo.currentForPlayers(["user_new"], 42)).resolves.toEqual([
      { userId: "user_new", score: 500, provisional: true },
    ]);
    expect(fixture.find).toHaveBeenCalledTimes(2);
    expect(fixture.find.mock.calls[1][0]).toEqual({
      userId: { $in: ["user_new"] },
      gameId: 42,
      scope: "GLOBAL",
      groupId: null,
    });
  });

  it.each([null, groupId])(
    "reads immutable table rating deltas from the exact game and scope (%s)",
    async (scopeGroupId) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      fixture.eventReads.push([
        {
          userId: "user_a",
          before: { mu: 20, sigma: 3, gamesPlayed: 4 },
          after: { mu: 29, sigma: 3.5, gamesPlayed: 5 },
        },
      ]);
      await expect(fixture.repo.forTable(tableId, 42, scopeGroupId)).resolves.toEqual([
        { userId: "user_a", score: 518.5, delta: 7.5, provisional: false },
      ]);
      expect(fixture.eventFind).toHaveBeenCalledExactlyOnceWith(
        { tableId, gameId: 42, scope: scopeGroupId ? "GROUP" : "GLOBAL", groupId: scopeGroupId },
        { projection: { _id: 0, userId: 1, before: 1, after: 1 }, session },
      );
      await expect(fixture.repo.forMatch(id, 42)).resolves.toEqual([]);
      expect(fixture.eventFind.mock.calls[1][0]).toEqual({
        matchId: id,
        gameId: 42,
        scope: "GLOBAL",
        groupId: null,
      });
    },
  );

  it.each([
    [-2, 1],
    [1, 1],
    [25, 25],
    [101, 100],
  ])("bounds leaderboard requests %s to %s with stable tie-breaking", async (requested, limit) => {
    const fixture = setup();
    const row = { userId: "user_a", ...initial, gameId: 42, scope: "GLOBAL", groupId: null };
    fixture.reads.push([row]);
    await expect(fixture.repo.leaderboard(42, "GLOBAL", null, requested)).resolves.toEqual([
      { ...row, provisional: true },
    ]);
    expect(fixture.find).toHaveBeenCalledExactlyOnceWith(
      { gameId: 42, scope: "GLOBAL", groupId: null },
      { projection: { _id: 0 } },
    );
    expect(fixture.cursor.sort).toHaveBeenCalledExactlyOnceWith({
      conservativeScore: -1,
      userId: 1,
    });
    expect(fixture.cursor.limit).toHaveBeenCalledExactlyOnceWith(limit);
  });

  it("uses the default leaderboard bound and rejects mismatched group scopes without accessing Mongo", async () => {
    const fixture = setup();
    await expect(fixture.repo.leaderboard(42, "GLOBAL", groupId)).rejects.toThrow(
      "Invalid leaderboard scope",
    );
    await expect(fixture.repo.leaderboard(42, "GROUP", null)).rejects.toThrow(
      "Invalid leaderboard scope",
    );
    expect(fixture.find).not.toHaveBeenCalled();
    await expect(fixture.repo.leaderboard(42, "GROUP", groupId)).resolves.toEqual([]);
    expect(fixture.cursor.limit).toHaveBeenCalledWith(50);
  });

  it.each([null, groupId])(
    "queries only eligible completed physical table statistics, with group scope %s",
    async (scopeGroupId) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      fixture.statsRows.push([{ _id: "user_a", gamesPlayed: 3, gamesWon: 2, nd: 0 }]);
      await expect(fixture.repo.tableStats(["user_a"], 42, scopeGroupId)).resolves.toEqual(
        new Map([["user_a", { gamesPlayed: 3, gamesWon: 2, nd: 0 }]]),
      );
      const [pipeline, options] = fixture.aggregate.mock.calls[0];
      expect(options).toEqual({ session });
      expect(fixture.db.collection).toHaveBeenCalledWith(COLLECTIONS.EVENT_TABLES);
      expect(pipeline[0]).toEqual({
        $match: {
          "confirmed.gameId": 42,
          rankingEnabled: true,
          results: { $exists: true },
          removedAt: { $exists: false },
        },
      });
      expect(pipeline[1]).toEqual({
        $match: {
          $expr: {
            $gte: [
              {
                $size: {
                  $filter: {
                    input: "$results.entries",
                    as: "entry",
                    cond: { $ne: ["$$entry.score", null] },
                  },
                },
              },
              2,
            ],
          },
        },
      });
      expect(pipeline[2].$lookup).toMatchObject({
        from: COLLECTIONS.EVENTS,
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$id", "$$event"] },
              status: "TERMINATED",
              ...(scopeGroupId ? { groupId: scopeGroupId } : {}),
            },
          },
          { $project: { _id: 0, id: 1 } },
        ],
      });
      expect(pipeline).toContainEqual({
        $match: { "results.entries.userId": { $in: ["user_a"] } },
      });
    },
  );

  it("retains the compatibility statistics filter and returns empty cursor maps without inventing players", async () => {
    const fixture = setup();
    await expect(fixture.repo.matchStats(["user_a"], 42, groupId)).resolves.toEqual(new Map());
    expect(fixture.aggregate.mock.calls[0][0][0]).toEqual({
      $match: { status: "TERMINATED", selectedGameId: 42, groupId },
    });
    await fixture.repo.matchStats([], 42, null);
    expect(fixture.aggregate.mock.calls[1][0][0]).toEqual({
      $match: { status: "TERMINATED", selectedGameId: 42 },
    });
  });

  it("propagates a snapshot driver failure without writing a partial outcome", async () => {
    const fixture = setup();
    const failure = new Error("Mongo read failed");
    fixture.cursor.toArray.mockRejectedValueOnce(failure);
    await expect(fixture.repo.applyTableResult(event, table, results)).rejects.toBe(failure);
    expect(fixture.updateOne).not.toHaveBeenCalled();
    expect(fixture.insertOne).not.toHaveBeenCalled();
  });
});
