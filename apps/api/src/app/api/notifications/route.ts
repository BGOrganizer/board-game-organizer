import { notificationListQuerySchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { NotificationAttentionRepository } from "@/app/lib/notifications/notification-attention.repository";
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
    const db = await getDb();
    const result = await new NotificationsRepository(db).list(
      userId,
      parsed.data.limit,
      parsed.data.cursor,
      parsed.data.locale,
    );
    const attention = await new NotificationAttentionRepository(db).snapshot(
      userId,
      [],
      result.notifications.filter((row) => !row.readAt).map((row) => row.id),
    );
    return corsJson(
      {
        ...result,
        unreadCount: attention.snapshot.unreadCount,
        attention: attention.snapshot.summary,
        notifications: result.notifications.map((row) => ({
          ...row,
          attention: attention.references.get(row.id) ?? null,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
      request,
    );
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}

async function updateAll(request: Request, action: "read" | "delete") {
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
      const repository = new NotificationsRepository(db, session);
      if (action === "delete") await repository.deleteAll(userId);
      else await repository.markAllRead(userId);
    });
    return corsJson(
      { success: true },
      { headers: { "Cache-Control": "private, no-store" } },
      request,
    );
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}

export const PATCH = (request: Request) => updateAll(request, "read");
export const DELETE = (request: Request) => updateAll(request, "delete");
