import { createMatchSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { MatchesRepository } from "@/app/lib/matches.repository";

/**
 * /api/matches — create (POST) and list (GET) matches.
 *
 * POST validation mirrors the wizard rules:
 * - name >= 5 chars
 * - at least one date slot
 * - 1 <= minPlayers <= maxPlayers
 * - invited users must be FRIENDS of the creator (mutual follow) — enforced
 *   against the relationship edges, never trusted from the payload alone.
 * - at least one game selected
 */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const body = await request.json().catch(() => null);
  const parsed = createMatchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return corsJson({ error: "Invalid body" }, { status: 400 }, request);
  }
  const { name, dates, minPlayers, maxPlayers, invitedUserIds, gameIds } = parsed.data;

  if (maxPlayers < minPlayers) {
    return corsJson({ error: "maxPlayers must be >= minPlayers" }, { status: 400 }, request);
  }

  const db = await getDb();

  // Enforce "invited must be friends": a user is a friend of the creator when
  // BOTH follow edges exist (creator -> user and user -> creator).
  const follows = db.collection("follows");
  const validInvites: string[] = [];
  for (const friendId of new Set(invitedUserIds)) {
    const [a, b] = await Promise.all([
      follows.findOne({ fromUserId: userId, toUserId: friendId, status: "accepted" }),
      follows.findOne({ fromUserId: friendId, toUserId: userId, status: "accepted" }),
    ]);
    if (a && b) validInvites.push(friendId);
  }

  const match = await new MatchesRepository(db).create({
    clerkId: userId,
    name,
    dates,
    minPlayers,
    maxPlayers,
    invitedUserIds: validInvites,
    gameIds,
  });

  return corsJson(
    {
      match: {
        id: match.id,
        name: match.name,
        dates: match.dates,
        minPlayers: match.minPlayers,
        maxPlayers: match.maxPlayers,
        invitedUserIds: match.invitedUserIds,
        gameIds: match.gameIds,
        createdAt: match.createdAt,
      },
    },
    { status: 201 },
    request,
  );
}

/** GET /api/matches — the caller's matches, newest first. */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const db = await getDb();
  const matches = await new MatchesRepository(db).listByOwner(userId);
  return corsJson(
    {
      matches: matches.map((m) => ({
        id: m.id,
        name: m.name,
        dates: m.dates,
        minPlayers: m.minPlayers,
        maxPlayers: m.maxPlayers,
        invitedUserIds: m.invitedUserIds,
        gameIds: m.gameIds,
        createdAt: m.createdAt,
      })),
    },
    request,
  );
}
