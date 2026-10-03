import { notificationListQuerySchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { NotificationsRepository } from "@/app/lib/notifications.repository";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const params = new URL(request.url).searchParams;
  const parsed = notificationListQuerySchema.safeParse(Object.fromEntries(params));
  if (
    !parsed.success ||
    ["limit", "cursor", "x-vercel-protection-bypass"].some((key) => params.getAll(key).length > 1)
  ) {
    return corsJson({ error: "Invalid query" }, { status: 400 }, request);
  }

  try {
    const result = await new NotificationsRepository(await getDb()).list(
      userId,
      parsed.data.limit,
      parsed.data.cursor,
    );
    return corsJson(result, {}, request);
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
    await new NotificationsRepository(await getDb()).markAllRead(userId);
    return corsJson({ success: true }, {}, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
