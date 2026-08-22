import type { User } from "@board-game-organizer/schemas";
import { presenceUpdateParamsSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";

/**
 * POST /api/users/presence
 *
 * Presence heartbeat: updates the viewer's `lastActiveAt` (and, for
 * explicit offline status, the online flag). The `online` flag is derived
 * server-side from recency elsewhere; this endpoint just records state.
 */
/** CORS preflight. */
export function OPTIONS() {
  return corsOptions();
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = presenceUpdateParamsSchema.safeParse(body ?? {});
  if (!parsed.success) return corsJson({ error: "Invalid body" }, { status: 400 });

  const { status } = parsed.data;
  const now = new Date();
  // offline is explicit; online/away both mean "active with lastActiveAt" —
  // the green-dot presence is derived from recency server-side.
  const isOnline = status !== "offline";

  await (await getDb()).collection<User>(COLLECTIONS.USERS).updateOne(
    { clerkId: userId },
    {
      $set: {
        "presence.lastActiveAt": now,
        "presence.online": isOnline,
      },
      $setOnInsert: {
        clerkId: userId,
        email: "",
        name: "",
        preferredLanguage: "en",
        plan: "free",
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  return corsJson({ success: true, lastActiveAt: now.toISOString() });
}
