import {
  notificationChangesQuerySchema,
  notificationNavigationQuerySchema,
  readNotificationChangesSchema,
} from "@board-game-organizer/schemas";
import { communityBody } from "@/app/lib/community/record-http";
import { recordQuery } from "@/app/lib/community/record-query";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { bgoAuth } from "@/app/lib/mcp/actor";
import { NotificationChangesRepository } from "@/app/lib/notifications/notification-changes.repository";
import { notificationNavigationReply } from "@/app/lib/notifications/notification-navigation-transport";

export const OPTIONS = corsOptions;
function reply(request: Request, data: unknown, status = 200) {
  return corsJson(data, { status, headers: { "Cache-Control": "private, no-store" } }, request);
}
export async function GET(request: Request) {
  const { userId } = await bgoAuth();
  if (!userId) return reply(request, { error: "Unauthorized" }, 401);
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
      return reply(request, { error: "Invalid query" }, 400);
    const parsed = notificationChangesQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) return reply(request, { error: "Invalid query" }, 400);
    const result = await new NotificationChangesRepository(await getDb()).list(userId, parsed.data);
    // Installed clients without locale validate the original strict row contract.
    if (!parsed.data.locale)
      return reply(request, {
        ...result,
        changes: result.changes.map(({ title: _title, description: _description, ...row }) => row),
      });
    return reply(request, result);
  } catch {
    return reply(request, { error: "Internal server error" }, 500);
  }
}
export async function PATCH(request: Request) {
  const { userId } = await bgoAuth();
  if (!userId) return reply(request, { error: "Unauthorized" }, 401);
  try {
    const query = recordQuery(request, notificationNavigationQuerySchema);
    const input = await communityBody(request, readNotificationChangesSchema);
    const result = await withTransaction((session, db) =>
      new NotificationChangesRepository(db, session).read(userId, input),
    );
    return reply(request, notificationNavigationReply(result, query.navigation));
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
