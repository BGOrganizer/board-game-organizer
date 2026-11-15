import type { Db, Document } from "mongodb";
import { expect, it, vi } from "vitest";
import { COLLECTIONS as C } from "../../db";
import { ProfileRepository } from "../profile.repository";
import { profileOutcomeStages } from "../profile-statistics";

function setup() {
  const collections = new Map<string, ReturnType<typeof make>>();
  function make() {
    const value = {
      rows: [] as Array<Record<string, unknown>>,
      one: null as Record<string, unknown> | null,
      count: 0,
    };
    const cursor = { toArray: vi.fn(async () => value.rows) };
    return {
      value,
      aggregate: vi.fn((_pipeline: Document[], _options?: unknown) => cursor),
      find: vi.fn((_filter: Document, _options?: unknown) => cursor),
      findOne: vi.fn(async (_filter: Document, _options?: Document) => value.one),
      countDocuments: vi.fn(async (_filter: Document, _options?: unknown) => value.count),
    };
  }
  const col = (name: string) => {
    let collection = collections.get(name);
    if (!collection) {
      collection = make();
      collections.set(name, collection);
    }
    return collection;
  };
  return { col, db: { collection: col } as unknown as Db };
}
it("uses physical terminated outcomes, roster membership, signed scores and rank-one ties, never rankingEnabled or retired Match counters", async () => {
  const fake = setup(),
    session = {} as never,
    repo = new ProfileRepository(fake.db, session);
  expect(await repo.player("owner")).toEqual({ gamesPlayed: 0, gamesWon: 0, winRate: null });
  fake.col(C.EVENT_TABLES).value.rows = [{ gamesPlayed: 4, gamesWon: 2 }];
  expect(await repo.player("owner", 7)).toEqual({ gamesPlayed: 4, gamesWon: 2, winRate: 50 });
  expect(fake.col(C.EVENT_TABLES).aggregate).toHaveBeenLastCalledWith(
    profileOutcomeStages("owner", 7),
    { session },
  );
  const stages = profileOutcomeStages("owner", 7);
  expect(stages[0]).toEqual({
    $match: {
      removedAt: { $exists: false },
      "confirmed.playerIds": { $type: "array" },
      "results.entries.userId": "owner",
      "confirmed.gameId": 7,
    },
  });
  expect(stages[1].$lookup.pipeline[0]).toEqual({ $match: { status: "TERMINATED" } });
  expect(stages[2].$match.$expr.$gte[1]).toBe(2);
  expect(stages[4]).toEqual({
    $match: {
      "results.entries.userId": "owner",
      "results.entries.score": { $ne: null },
      $expr: {
        $in: [
          "$results.entries.userId",
          { $cond: [{ $isArray: "$confirmed.playerIds" }, "$confirmed.playerIds", []] },
        ],
      },
    },
  });
  expect(JSON.stringify(stages)).not.toContain("rankingEnabled");
});
it("source-counts both block directions and mutual accepted friendships without loading every social row", async () => {
  const fake = setup(),
    repo = new ProfileRepository(fake.db);
  fake.col(C.BLOCKS).value.rows = [
    { fromUserId: "owner", toUserId: "blocked" },
    { fromUserId: "reverse", toUserId: "owner" },
  ];
  fake.col(C.FOLLOWS).value.count = 2;
  fake.col(C.FRIEND_REQUESTS).value.rows = [{ total: 1 }];
  expect(await repo.social("owner")).toEqual({ friends: 1, followers: 2, following: 2 });
  expect(fake.col(C.FOLLOWS).countDocuments).toHaveBeenNthCalledWith(
    1,
    { toUserId: "owner", fromUserId: { $nin: ["blocked", "reverse"] } },
    {},
  );
  expect(fake.col(C.FOLLOWS).countDocuments).toHaveBeenNthCalledWith(
    2,
    { fromUserId: "owner", toUserId: { $nin: ["blocked", "reverse"] } },
    {},
  );
  fake.col(C.FRIEND_REQUESTS).value.rows = [];
  expect((await repo.social("owner")).friends).toBe(0);
});
it("reads only the requested mirror and current immutable-type group memberships with active-ban exclusion", async () => {
  const fake = setup(),
    repo = new ProfileRepository(fake.db);
  fake.col(C.USERS).value.one = { clerkId: "owner", name: "Owner" };
  expect(await repo.user("owner")).toEqual({ clerkId: "owner", name: "Owner" });
  expect(fake.col(C.USERS).findOne).toHaveBeenCalledWith({ clerkId: "owner" }, {});
  expect(await repo.groupCounts("owner")).toEqual({ adminGroups: 0, joinedGroups: 0 });
  fake.col(C.GROUPS).value.rows = [{ adminGroups: 2, joinedGroups: 3 }];
  expect(await repo.groupCounts("owner")).toEqual({ adminGroups: 2, joinedGroups: 3 });
});
it("source-pages selectable GLOBAL games by 20 and escapes literal search before limiting", async () => {
  const fake = setup(),
    repo = new ProfileRepository(fake.db);
  fake.col(C.PLAYER_RATINGS).value.rows = Array.from({ length: 21 }, (_, i) => ({
    id: i + 1,
    name: "Game",
    imageUrl: null,
  }));
  const value = await repo.games("owner", 0, "[a].*");
  expect(value.items).toHaveLength(20);
  expect(value.nextCursor).toBe(20);
  const pipeline = fake.col(C.PLAYER_RATINGS).aggregate.mock.calls[0][0] as Document[];
  expect(pipeline[0].$match).toMatchObject({
    userId: "owner",
    scope: "GLOBAL",
    groupId: null,
    gameId: { $gt: 0 },
  });
  expect(pipeline.find((stage) => stage.$match?.["game.name"])?.$match).toEqual({
    "game.name": { $regex: "\\[a\\]\\.\\*", $options: "i" },
  });
  expect(pipeline.find((stage) => stage.$limit)).toEqual({ $limit: 21 });
  fake.col(C.PLAYER_RATINGS).value.rows = [];
  expect(await repo.games("owner", 20, "")).toEqual({ items: [], nextCursor: null });
});
it("keeps current GLOBAL OpenSkill and last-game delta on every bounded ordinal page, strips private source context and dates", async () => {
  const fake = setup(),
    repo = new ProfileRepository(fake.db);
  fake.col(C.RATING_EVENTS).value.rows = Array.from({ length: 101 }, (_, i) => ({
    ordinal: 101 - i,
    before: { mu: 28, sigma: 8, gamesPlayed: i },
    after: { mu: 30, sigma: 8, gamesPlayed: i + 1 },
  }));
  fake.col(C.RATING_EVENTS).value.one = {
    before: { mu: 28, sigma: 8 },
    after: { mu: 30, sigma: 8, gamesPlayed: 101 },
  };
  fake.col(C.PLAYER_RATINGS).value.one = { mu: 30, sigma: 8, gamesPlayed: 101 };
  fake.col(C.BOARD_GAMES).value.one = {
    id: 7,
    name: "Chess",
    image: "https://example.test/chess.png",
  };
  fake.col(C.EVENT_TABLES).value.rows = [{ gamesPlayed: 5, gamesWon: 1 }];
  const value = await repo.history("owner", 7, 201);
  expect(value).toMatchObject({
    rating: 506,
    delta: 2,
    game: { id: 7, name: "Chess", imageUrl: "https://example.test/chess.png" },
    stats: { gamesPlayed: 5, gamesWon: 1, winRate: 20 },
    nextCursor: 2,
  });
  expect(value.points).toHaveLength(100);
  const historyPipeline = fake.col(C.RATING_EVENTS).aggregate.mock.calls[0][0] as Document[];
  expect(historyPipeline.find((stage) => stage.$setWindowFields)?.$setWindowFields.sortBy).toEqual({
    "after.gamesPlayed": 1,
  });
  expect(value.points[0]).toEqual({ ordinal: 2, rating: 506, delta: 2 });
  expect(Object.keys(value.points[0]).sort()).toEqual(["delta", "ordinal", "rating"]);
  const options = fake.col(C.RATING_EVENTS).findOne.mock.calls[0][1];
  expect(options).toMatchObject({ sort: { "after.gamesPlayed": -1, _id: -1 } });
  fake.col(C.RATING_EVENTS).value.one = {
    before: { mu: 28, sigma: 8 },
    after: { mu: 30, sigma: 8, gamesPlayed: 100 },
  };
  expect((await repo.history("owner", 7)).delta).toBeNull();
  fake.col(C.PLAYER_RATINGS).value.one = null;
  expect((await repo.history("owner", 7)).delta).toBeNull();
  fake.col(C.RATING_EVENTS).value.rows = [];
  fake.col(C.RATING_EVENTS).value.one = null;
  fake.col(C.PLAYER_RATINGS).value.one = null;
  fake.col(C.BOARD_GAMES).value.one = null;
  fake.col(C.EVENT_TABLES).value.rows = [];
  expect(await repo.history("owner", 7)).toEqual({
    game: null,
    rating: null,
    delta: null,
    stats: { gamesPlayed: 0, gamesWon: 0, winRate: null },
    points: [],
    nextCursor: null,
  });
  fake.col(C.BOARD_GAMES).value.one = { id: 7, name: "Chess" };
  expect((await repo.history("owner", 7)).game?.imageUrl).toBeNull();
});
