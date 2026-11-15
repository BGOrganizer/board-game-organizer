import type { ClientSession, Db } from "mongodb";
import { expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { GroupLeaderboardRepository } from "../group-leaderboard.repository";

function setup(rows: unknown[]) {
  const toArray = vi.fn().mockResolvedValue(rows);
  const aggregate = vi.fn(() => ({ toArray }));
  const collection = vi.fn(() => ({ aggregate }));
  const session = {} as ClientSession;
  return {
    repo: new GroupLeaderboardRepository({ collection } as unknown as Db, session),
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
    const [pipeline, options] = h.aggregate.mock.calls[0] as unknown as [
      Record<string, any>[],
      unknown,
    ];
    expect(options).toEqual({ session: h.session });
    expect(pipeline).toContainEqual({ $skip: 25 });
    expect(pipeline).toContainEqual({ $limit: 3 });
    expect(pipeline).toContainEqual({
      $match: { event: { $elemMatch: { groupId: "group", status: "TERMINATED" } } },
    });
    const search = pipeline.find((stage) => stage.$match?.name);
    if (query) expect(search?.$match.name).toEqual({ $regex: "A\\.\\*\\.", $options: "i" });
    else expect(search).toBeUndefined();
  },
);
it.each([false, true])(
  "source-pages players with accepted current membership and no inferred historical roles: %s",
  async (more) => {
    const rows = [{ _id: "creator" }, { _id: "member" }, { _id: "former" }];
    const h = setup(more ? rows : rows.slice(0, 2));
    expect(await h.repo.players("group", 42, 25, 2)).toEqual({
      rows: rows.slice(0, 2),
      nextCursor: more ? 27 : null,
    });
    const [pipeline, options] = h.aggregate.mock.calls[0] as unknown as [
      Record<string, any>[],
      unknown,
    ];
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
    expect(pipeline.at(-1)).toEqual({ $project: { ratings: 0, profile: 0, members: 0, group: 0 } });
  },
);
