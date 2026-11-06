import { bggCollectionQuerySchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { CommunityError } from "@/app/lib/community.error";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { BggAccountRepository } from "@/app/lib/games/bgg-account.repository";
import { ProfileService } from "@/app/lib/profile/profile.service";

export const OPTIONS = corsOptions;
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const parsed = bggCollectionQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return corsJson({ error: "INVALID_QUERY" }, { status: 400 }, request);
  try {
    const db = await getDb(),
      subject = parsed.data.subjectId ?? userId;
    const profiles = new ProfileService(db);
    if (subject !== userId) await profiles.requireVisible(userId, subject);
    const page = await new BggAccountRepository(db).page(subject, parsed.data, userId);
    if (subject !== userId) await profiles.requireVisible(userId, subject);
    return corsJson(page, request);
  } catch (error) {
    return corsJson(
      { error: error instanceof CommunityError ? error.code : "BGG_COLLECTION_UNAVAILABLE" },
      { status: error instanceof CommunityError ? error.status : 500 },
      request,
    );
  }
}
