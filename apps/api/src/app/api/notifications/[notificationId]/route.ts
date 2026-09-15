import { notificationIdSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { NotificationsRepository } from "@/app/lib/notifications.repository";

export const OPTIONS = corsOptions;

type NotificationRouteContext = { params: Promise<{ notificationId: string }> };

export async function PATCH(request: Request, context: NotificationRouteContext) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const id = notificationIdSchema.safeParse((await context.params).notificationId);
  const params = new URL(request.url).searchParams;
  if (
    !id.success ||
    [...params.keys()].some((key) => key !== "x-vercel-protection-bypass") ||
    params.getAll("x-vercel-protection-bypass").length > 1
  ) {
    return corsJson({ error: "Invalid request" }, { status: 400 }, request);
  }

  try {
    await new NotificationsRepository(await getDb()).markRead(userId, id.data);
    return corsJson({ success: true }, {}, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
