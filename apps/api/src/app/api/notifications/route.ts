import { notificationListQuerySchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { NotificationsRepository } from "@/app/lib/notifications/notifications.repository";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const params = new URL(request.url).searchParams;
  const parsed = notificationListQuerySchema.safeParse(Object.fromEntries(params));
  if (
    !parsed.success ||
    ["limit", "cursor", "locale", "x-vercel-protection-bypass"].some(
      (key) => params.getAll(key).length > 1,
    )
  ) {
    return corsJson({ error: "Invalid query" }, { status: 400 }, request);
  }

  try {
    const result = await new NotificationsRepository(await getDb()).list(
      userId,
      parsed.data.limit,
      parsed.data.cursor,
      parsed.data.locale,
    );
    return corsJson(result, { headers: { "Cache-Control": "private, no-store" } }, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== "x-vercel-protection-bypass") ||
    params.getAll("x-vercel-protection-bypass").length > 1
  ) {
    return corsJson({ error: "Invalid query" }, { status: 400 }, request);
  }

  try {
    await withTransaction(async (session, db) => {
      await new NotificationsRepository(db, session).markAllRead(userId);
    });
    return corsJson({ success: true }, {}, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
