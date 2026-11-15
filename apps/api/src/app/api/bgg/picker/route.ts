import { bggPickerQuerySchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { CommunityError } from "@/app/lib/community.error";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { bggPickerPage } from "@/app/lib/games/bgg-picker";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const parsed = bggPickerQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return corsJson({ error: "Invalid search" }, { status: 400 }, request);
  try {
    return corsJson(await bggPickerPage(await getDb(), userId, parsed.data), request);
  } catch (error) {
    return corsJson(
      { error: error instanceof CommunityError ? error.code : "Internal server error" },
      { status: error instanceof CommunityError ? error.status : 500 },
      request,
    );
  }
}
