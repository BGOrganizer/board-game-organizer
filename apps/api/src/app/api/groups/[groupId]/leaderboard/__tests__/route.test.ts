import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrichUserIds } from "@/app/lib/clerk";
import { GroupLeaderboardRepository } from "@/app/lib/group-leaderboard.repository";
import { GroupsRepository } from "@/app/lib/groups.repository";
import { GET } from "../route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("@/app/lib/clerk", () => ({ enrichUserIds: vi.fn() }));
const groupId = "1f454adb-43e3-47ad-8c29-57b97a55a211";
const request = (params = "") =>
  new Request(`http://localhost/api/groups/${groupId}/leaderboard${params}`);
const context = { params: Promise.resolve({ groupId }) };

describe("group leaderboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "admin" } as Awaited<ReturnType<typeof auth>>);
    vi.spyOn(GroupsRepository.prototype, "findById").mockResolvedValue({
      id: groupId,
      adminUserId: "admin",
      name: "Group",
      isPublic: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    vi.spyOn(GroupsRepository.prototype, "findMembership").mockResolvedValue(null);
    vi.spyOn(GroupsRepository.prototype, "listAcceptedMembers").mockResolvedValue([]);
    vi.spyOn(GroupLeaderboardRepository.prototype, "games").mockResolvedValue([
      { id: 12, name: "Azul", imageUrl: "https://example.com/azul.jpg" },
    ]);
    vi.spyOn(GroupLeaderboardRepository.prototype, "players").mockResolvedValue({
      rows: [
        {
          _id: "admin",
          gamesPlayed: 2,
          gamesWon: 1,
          nd: 1,
          rating: { conservativeScore: 55, gamesPlayed: 2 },
        },
        { _id: "former", gamesPlayed: 1, gamesWon: 1, nd: 0 },
      ],
      nextCursor: null,
    });
    vi.mocked(enrichUserIds).mockResolvedValue([
      {
        id: "admin",
        fullName: "Ada Lovelace",
        username: "ada",
        imageUrl: "avatar",
        emailAddress: "secret@example.com",
      },
      {
        id: "former",
        fullName: "Grace Hopper",
        username: "grace",
        imageUrl: "",
        emailAddress: "secret2@example.com",
      },
    ]);
  });

  it("requires accepted membership and rejects invalid queries", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as Awaited<ReturnType<typeof auth>>);
    expect((await GET(request(), context)).status).toBe(401);
    expect((await GET(request("?gameId=oops"), context)).status).toBe(400);
    vi.mocked(auth).mockResolvedValueOnce({ userId: "pending" } as Awaited<
      ReturnType<typeof auth>
    >);
    expect((await GET(request(), context)).status).toBe(403);
    expect((await GET(request("?gameId=99"), context)).status).toBe(400);
  });

  it("allows accepted members but hides archived groups and empty collections", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: "member" } as Awaited<ReturnType<typeof auth>>);
    vi.mocked(GroupsRepository.prototype.findMembership).mockResolvedValueOnce({
      status: "ACCEPTED",
    } as never);
    vi.mocked(GroupLeaderboardRepository.prototype.games).mockResolvedValueOnce([]);
    expect(await (await GET(request(), context)).json()).toEqual({
      games: [],
      players: [],
      nextCursor: null,
    });
    vi.mocked(GroupsRepository.prototype.findById).mockResolvedValueOnce({
      archivedAt: "2026-01-02T00:00:00.000Z",
    } as never);
    expect((await GET(request(), context)).status).toBe(404);
  });

  it("returns only terminated games without selecting any players", async () => {
    expect(await (await GET(request(), context)).json()).toEqual({
      games: [{ id: 12, name: "Azul", imageUrl: "https://example.com/azul.jpg" }],
      players: [],
      nextCursor: null,
    });
    expect(GroupLeaderboardRepository.prototype.players).not.toHaveBeenCalled();
  });

  it("shows group rating, ties and former players without exposing email", async () => {
    const response = await GET(request("?gameId=12"), context);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.players).toEqual([
      {
        userId: "admin",
        name: "Ada Lovelace",
        username: "ada",
        avatarUrl: "avatar",
        gamesPlayed: 2,
        gamesWon: 1,
        nd: 1,
        rating: 555,
        provisional: true,
        left: false,
      },
      {
        userId: "former",
        name: "Grace Hopper",
        username: "grace",
        avatarUrl: "",
        gamesPlayed: 1,
        gamesWon: 1,
        nd: 0,
        rating: null,
        provisional: false,
        left: true,
      },
    ]);
    expect(JSON.stringify(data)).not.toContain("secret@example.com");
    vi.mocked(GroupsRepository.prototype.listAcceptedMembers).mockResolvedValueOnce([
      { inviteeUserId: "former" } as never,
    ]);
    expect((await (await GET(request("?gameId=12"), context)).json()).players[1].left).toBe(false);
  });
});
