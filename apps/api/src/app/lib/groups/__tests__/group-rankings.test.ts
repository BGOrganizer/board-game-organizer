import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { expect, it, vi } from "vitest";
import { GroupRecordsService } from "../group-records.service";

function setup(canViewRankings = true) {
  const games = vi
    .fn()
    .mockResolvedValue({ games: [{ id: 42, name: "Game", imageUrl: null }], nextCursor: 25 });
  const players = vi.fn().mockResolvedValue({ rows: [], nextCursor: null });
  const service = new GroupRecordsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    vi.fn(),
    { games, players } as never,
  );
  const detail = vi
    .spyOn(service, "detail")
    .mockResolvedValue({ canViewRankings } as GroupRecordResponse);
  return { service, detail, games, players };
}
it("preserves the source authorization guard before either ranking read", async () => {
  const h = setup(false);
  await expect(
    h.service.rankings("viewer", "group", { cursor: 0, limit: 25 }),
  ).rejects.toMatchObject({ status: 403, message: "GROUP_MEMBER_REQUIRED" });
  expect(h.detail).toHaveBeenCalledWith("viewer", "group");
  expect(h.games).not.toHaveBeenCalled();
  expect(h.players).not.toHaveBeenCalled();
});
it("retains bounded source game discovery without reading membership separately", async () => {
  const h = setup();
  expect(
    await h.service.rankings("viewer", "group", { cursor: 25, limit: 25, query: "chess" }),
  ).toEqual({ games: [{ id: 42, name: "Game", imageUrl: null }], players: [], nextCursor: 25 });
  expect(h.games).toHaveBeenCalledWith("group", 25, 25, "chess");
  expect(h.players).not.toHaveBeenCalled();
});
it.each(["ADMIN", "MODERATOR", "MEMBER", null, undefined] as const)(
  "projects only the repository's current %s role",
  async (groupRole) => {
    const h = setup();
    h.players.mockResolvedValue({
      rows: [
        {
          _id: "player",
          name: "Full Name",
          username: "handle",
          avatarUrl: null,
          gamesPlayed: 4,
          gamesWon: 2,
          nd: 1,
          left: groupRole == null,
          groupRole,
          rating: groupRole ? { conservativeScore: 12, gamesPlayed: 4 } : undefined,
        },
      ],
      nextCursor: 50,
    } as never);
    const page = await h.service.rankings("viewer", "group", { gameId: 42, cursor: 25, limit: 25 });
    expect(h.players).toHaveBeenCalledWith("group", 42, 25, 25);
    expect(page.players).toEqual([
      {
        userId: "player",
        name: "Full Name",
        username: "handle",
        avatarUrl: null,
        gamesPlayed: 4,
        gamesWon: 2,
        nd: 1,
        left: groupRole == null,
        groupRole: groupRole ?? null,
        rating: groupRole ? 512 : null,
        provisional: Boolean(groupRole),
      },
    ]);
    expect(page.nextCursor).toBe(50);
  },
);
