import {
  notificationAttentionQuerySchema,
  readNotificationAttentionSchema,
} from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { communityBody } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { NotificationAttentionRepository } from "@/app/lib/notifications/notification-attention.repository";

export const OPTIONS = corsOptions;
function reply(request: Request, data: unknown, status = 200) {
  return corsJson(data, { status, headers: { "Cache-Control": "private, no-store" } }, request);
}
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return reply(request, { error: "Unauthorized" }, 401);
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
      return reply(request, { error: "Invalid query" }, 400);
    const parsed = notificationAttentionQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) return reply(request, { error: "Invalid query" }, 400);
    const result = await new NotificationAttentionRepository(await getDb()).snapshot(
      userId,
      parsed.data.targets,
    );
    return reply(request, result.snapshot);
  } catch {
    return reply(request, { error: "Internal server error" }, 500);
  }
}
export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return reply(request, { error: "Unauthorized" }, 401);
  try {
    recordQuery(request, emptyRecordQuery);
    const input = await communityBody(request, readNotificationAttentionSchema);
    const result = await withTransaction((session, db) =>
      new NotificationAttentionRepository(db, session).read(userId, input),
    );
    return reply(request, result);
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error && error.status === 400 ? 400 : 500;
    return reply(
      request,
      { error: status === 400 ? "Invalid request" : "Internal server error" },
      status,
    );
  }
}
