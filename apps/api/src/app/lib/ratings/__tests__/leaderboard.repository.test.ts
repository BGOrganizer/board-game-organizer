import type { AggregateOptions, ClientSession, Db, Document } from "mongodb";
import { expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { LeaderboardRepository } from "../leaderboard.repository";

function setup(rows: unknown[]) {
  const toArray = vi.fn().mockResolvedValue(rows);
  const aggregate = vi.fn((_pipeline: Document[], _options: AggregateOptions) => ({ toArray }));
  const collection = vi.fn(() => ({ aggregate }));
  const session = {} as ClientSession;
  return {
    repo: new LeaderboardRepository({ collection } as unknown as Db, session),
    aggregate,
    collection,
    session,
  };
}
it.each([undefined, "A.*."])(
  "source-pages rated games and escapes optional discovery text: %s",
  async (query) => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const h = setup(query ? rows : rows.slice(0, 2));
    expect(await h.repo.games("group", 25, 2, query)).toEqual({
      games: rows.slice(0, 2),
      nextCursor: query ? 27 : null,
    });
    expect(h.collection).toHaveBeenCalledWith(COLLECTIONS.EVENT_TABLES);
    const [pipeline, options] = h.aggregate.mock.calls[0];
    expect(options).toEqual({ session: h.session });
    expect(pipeline).toContainEqual({ $skip: 25 });
    expect(pipeline).toContainEqual({ $limit: 3 });
    const event = pipeline.find((stage) => stage.$lookup?.from === COLLECTIONS.EVENTS);
    expect(event?.$lookup.pipeline[0]).toEqual({
      $match: { $expr: { $eq: ["$id", "$$event"] }, groupId: "group", status: "TERMINATED" },
    });
    expect(pipeline).toContainEqual({ $match: { "completedEvent.0": { $exists: true } } });
    const search = pipeline.find((stage) => stage.$match?.name);
    if (query) expect(search?.$match.name).toEqual({ $regex: "A\\.\\*\\.", $options: "i" });
    else expect(search).toBeUndefined();
  },
);
it("starts the group game picker with a bounded default page", async () => {
  const h = setup([]);
  await expect(h.repo.games("group")).resolves.toEqual({ games: [], nextCursor: null });
  const [pipeline] = h.aggregate.mock.calls[0];
  expect(pipeline).toContainEqual({ $skip: 0 });
  expect(pipeline).toContainEqual({ $limit: 26 });
});
it.each([false, true])(
  "source-pages players with accepted current membership and no inferred historical roles: %s",
  async (more) => {
    const rows = [{ _id: "creator" }, { _id: "member" }, { _id: "former" }];
    const h = setup(more ? rows : rows.slice(0, 2));
    expect(await h.repo.players("group", 42, 25, 2)).toEqual({
      rows: rows.slice(0, 2),
      nextCursor: more ? 27 : null,
    });
    const [pipeline, options] = h.aggregate.mock.calls[0];
    expect(options).toEqual({ session: h.session });
    expect(pipeline).toContainEqual({ $skip: 25 });
    expect(pipeline).toContainEqual({ $limit: 3 });
    const memberships = pipeline.find(
      (stage) => stage.$lookup?.from === COLLECTIONS.GROUP_MEMBERSHIPS,
    );
    expect(memberships?.$lookup.pipeline).toEqual([
      { $match: { groupId: "group", status: "ACCEPTED" } },
    ]);
    const role = pipeline.find((stage) => stage.$set?.groupRole)?.$set.groupRole.$cond;
    expect(role[0]).toEqual({ $eq: ["$_id", { $arrayElemAt: ["$group.adminUserId", 0] }] });
    expect(role[1]).toBe("ADMIN");
    expect(role[2].$cond[0]).toEqual({ $gt: [{ $size: "$members" }, 0] });
    expect(role[2].$cond[2]).toBeNull();
    expect(role[2].$cond[1].$cond).toEqual([
      { $eq: [{ $arrayElemAt: ["$members.role", 0] }, "MODERATOR"] },
      "MODERATOR",
      "MEMBER",
    ]);
    expect(pipeline.at(-1)).toEqual({
      $project: {
        ratings: 0,
        profile: 0,
        members: 0,
        group: 0,
        finishedGames: 0,
        hasRating: 0,
        canonicalPosition: 0,
      },
    });
  },
);

it.each([
  ["rating", { hasRating: -1, "rating.conservativeScore": 1, _id: 1 }],
  ["gamesPlayed", { finishedGames: 1, canonicalPosition: 1 }],
  ["gamesWon", { gamesWon: 1, canonicalPosition: 1 }],
  ["nd", { nd: 1, canonicalPosition: 1 }],
] as const)(
  "sorts by %s before paging and retains descending rating positions",
  async (sort, order) => {
    const h = setup([]);
    await h.repo.players("group", 42, 25, 2, { sort, direction: "asc" });
    const [pipeline] = h.aggregate.mock.calls[0];
    const position = pipeline.findIndex((stage) => stage.$setWindowFields);
    const offset = pipeline.findIndex((stage) => stage.$skip !== undefined);
    expect(pipeline[position].$setWindowFields).toMatchObject({
      sortBy: { hasRating: -1, "rating.conservativeScore": -1, _id: 1 },
    });
    expect(pipeline[offset - 1]).toEqual({ $sort: order });
    expect(position).toBeLessThan(offset - 1);
  },
);

it.each([false, true])(
  "filters the global game catalog before searching and paging: %s",
  async (more) => {
    const games = [{ id: 42, name: "Ch[ess]", imageUrl: null }];
    const h = setup(more ? [...games, { id: 74 }] : games);
    await expect(
      h.repo.global({ cursor: 0, limit: 1, query: "Ch[ess]" }, ["blocked", "reverse"]),
    ).resolves.toEqual({ games, players: [], nextCursor: more ? 1 : null });
    const [pipeline] = h.aggregate.mock.calls[0];
    const skip = pipeline.findIndex((stage) => stage.$skip !== undefined);
    expect(pipeline.slice(0, skip)).toContainEqual({
      $match: { "_id.userId": { $nin: ["blocked", "reverse"] } },
    });
    expect(pipeline.slice(0, skip)).toContainEqual({ $unwind: "$profile" });
    expect(pipeline.slice(0, skip)).toContainEqual({
      $match: { name: { $regex: "Ch\\[ess\\]", $options: "i" } },
    });
  },
);

it.each([false, true])(
  "projects safe global identity and only aggregate fields: %s",
  async (more) => {
    const email = "secret@test.invalid";
    const avatarUrl = more ? "https://images.test/visible.png" : null;
    const row = {
      _id: "viewer",
      profile: more
        ? { email, name: "Public name", avatarUrl }
        : { email, name: email, username: "handle" },
      gamesPlayed: 5,
      gamesWon: 2,
      nd: 1,
      rating: { conservativeScore: 9, gamesPlayed: 5 },
      position: 4,
      groupId: "hidden",
      eventId: "hidden-event",
    };
    const h = setup(more ? [row, { ...row, _id: "other" }] : [row]);
    await expect(
      h.repo.global({ gameId: 42, cursor: 3, limit: 1, sort: "gamesWon" }, ["blocked"]),
    ).resolves.toEqual({
      games: [],
      players: [
        {
          userId: "viewer",
          name: more ? "Public name" : "handle",
          username: more ? null : "handle",
          avatarUrl,
          gamesPlayed: 5,
          gamesWon: 2,
          nd: 1,
          rating: 509,
          position: 4,
          provisional: false,
          left: false,
          groupRole: null,
        },
      ],
      nextCursor: more ? 4 : null,
    });
    const [pipeline] = h.aggregate.mock.calls[0];
    const position = pipeline.findIndex((stage) => stage.$setWindowFields);
    expect(pipeline.slice(0, position)).toContainEqual({
      $match: { _id: { $nin: ["blocked"] } },
    });
    expect(pipeline.slice(0, position)).toContainEqual({ $unwind: "$profile" });
    expect(
      pipeline.find((stage) => stage.$lookup?.from === COLLECTIONS.PLAYER_RATINGS),
    ).toMatchObject({
      $lookup: { pipeline: [{ $match: { scope: "GLOBAL", groupId: null, gameId: 42 } }] },
    });
  },
);

it("returns an empty page for a global game without visible standings", async () => {
  await expect(setup([]).repo.global({ gameId: 1, cursor: 0, limit: 25 }, [])).resolves.toEqual({
    games: [],
    players: [],
    nextCursor: null,
  });
});
