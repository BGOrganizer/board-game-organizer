import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { enrichUserIds } from "@/app/lib/clerk";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { GroupLeaderboardRepository } from "@/app/lib/group-leaderboard.repository";
import { GroupsRepository } from "@/app/lib/groups.repository";

export const OPTIONS = corsOptions;

type Context = { params: Promise<{ groupId: string }> };
const querySchema = z
  .object({
    gameId: z.coerce.number().int().positive().optional(),
    cursor: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    "x-vercel-protection-bypass": z.string().optional(),
  })
  .strict();

export async function GET(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const { groupId } = await context.params;
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!z.uuid().safeParse(groupId).success || !query.success)
    return corsJson({ error: "Invalid query" }, { status: 400 }, request);

  try {
    const db = await getDb();
    const groups = new GroupsRepository(db);
    const group = await groups.findById(groupId);
    if (!group || group.archivedAt)
      return corsJson({ error: "Group not found" }, { status: 404 }, request);
    if (group.adminUserId !== userId && !(await groups.findMembership(groupId, userId)))
      return corsJson({ error: "Forbidden" }, { status: 403 }, request);

    const leaderboard = new GroupLeaderboardRepository(db);
    const games = await leaderboard.games(groupId);
    if (query.data.gameId && !games.some((game) => game.id === query.data.gameId))
      return corsJson({ error: "Invalid game" }, { status: 400 }, request);
    if (!query.data.gameId)
      return corsJson(
        { games, players: [], nextCursor: null } satisfies GroupLeaderboardResponse,
        {},
        request,
      );

    const { rows, nextCursor } = await leaderboard.players(
      groupId,
      query.data.gameId,
      query.data.cursor,
      query.data.limit,
    );
    const ids = rows.map((row) => row._id);
    const [profiles, members] = await Promise.all([
      enrichUserIds(ids),
      groups.listAcceptedMembers(groupId, ids),
    ]);
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    const accepted = new Set(members.map((member) => member.inviteeUserId));
    return corsJson(
      {
        games,
        players: rows.map((row) => {
          const profile = byId.get(row._id);
          return {
            userId: row._id,
            name: profile?.fullName ?? profile?.username ?? row._id,
            username: profile?.username ?? null,
            avatarUrl: profile?.imageUrl ?? null,
            gamesPlayed: row.gamesPlayed,
            gamesWon: row.gamesWon,
            nd: row.nd,
            rating: row.rating ? 500 + row.rating.conservativeScore : null,
            provisional: row.rating ? row.rating.gamesPlayed < 5 : false,
            left: row._id !== group.adminUserId && !accepted.has(row._id),
          };
        }),
        nextCursor,
      } satisfies GroupLeaderboardResponse,
      {},
      request,
    );
  } catch {
    return corsJson({ error: "Could not load leaderboard" }, { status: 500 }, request);
  }
}
