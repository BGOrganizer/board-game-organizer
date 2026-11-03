import { targetUserIdSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { ZodError } from "zod";
import { CommunityError } from "../community.error";
import { corsJson } from "../cors";
import { getDb } from "../db";
import { ensureCurrentUser } from "../ensureCurrentUser";
import { ProfileService } from "./profile.service";

export async function profileRead(
  request: Request,
  subject: string,
  read: (viewer: string, userId: string, service: ProfileService) => Promise<unknown>,
) {
  const { userId, isAuthenticated } = await auth();
  const headers = { "Cache-Control": "private, no-store" };
  if (!isAuthenticated || !userId)
    return corsJson({ error: "Unauthorized" }, { status: 401, headers }, request);
  try {
    const target = targetUserIdSchema.parse(subject);
    const db = await getDb();
    await ensureCurrentUser(userId, db);
    return corsJson(await read(userId, target, new ProfileService(db)), { headers }, request);
  } catch (error) {
    const status =
      error instanceof ZodError ? 400 : error instanceof CommunityError ? error.status : 500;
    return corsJson(
      {
        error:
          error instanceof ZodError
            ? "INVALID_QUERY"
            : error instanceof CommunityError
              ? error.message
              : "Could not load profile",
      },
      { status, headers },
      request,
    );
  }
}
