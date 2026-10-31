import { updatePreferredLanguageSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { enrichSingleUser } from "@/app/lib/clerk";
import { RelationshipRepository } from "@/app/lib/contacts/relationship.repository";
import { RelationshipService } from "@/app/lib/contacts/relationship.service";
import { corsJson, corsOptions, getCorsHeaders } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { ensureCurrentUser } from "@/app/lib/ensureCurrentUser";
import { GroupsRepository } from "@/app/lib/groups/groups.repository";
import { MatchesRepository } from "@/app/lib/matches/matches.repository";
import { UsersRepository } from "@/app/lib/users/users.repository";

export async function GET(request: NextRequest) {
  const { isAuthenticated, userId } = await auth();
  const corsHeaders = { ...getCorsHeaders(request), "Cache-Control": "private, no-store" };

  if (!isAuthenticated || !userId) {
    return Response.json(
      { error: "Unauthorized — authentication required" },
      { status: 401, headers: corsHeaders },
    );
  }

  // Reuse the shared Clerk enrichment helper instead of duplicating the
  // direct Clerk API call (see apps/api/src/app/lib/clerk.ts).
  const clerkProfile = await enrichSingleUser(userId);

  if (!clerkProfile) {
    return Response.json(
      { error: "Failed to fetch user data" },
      { status: 500, headers: corsHeaders },
    );
  }

  const db = await getDb();
  const relationships = new RelationshipService(new RelationshipRepository(db));
  const groupsRepository = new GroupsRepository(db);
  const [friends, followers, following, playedMatches, groups] = await Promise.all([
    relationships.list(userId, "friends"),
    relationships.list(userId, "followers"),
    relationships.list(userId, "following"),
    new MatchesRepository(db).countPlayedByUser(userId),
    groupsRepository.listInvitationsForUser(userId).then((invitations) =>
      groupsRepository.listForUser(
        userId,
        invitations
          .filter((invitation) => invitation.status === "ACCEPTED")
          .map((invitation) => invitation.groupId),
      ),
    ),
  ]);

  const profile = {
    id: clerkProfile.id,
    name: clerkProfile.fullName ?? clerkProfile.emailAddress ?? "Unknown",
    username: clerkProfile.username ?? null,
    ...(clerkProfile.bgoRole ? { bgoRole: clerkProfile.bgoRole } : {}),
    email: clerkProfile.emailAddress ?? "",
    avatarUrl: clerkProfile.imageUrl ?? "",
    preferredLanguage: (await new UsersRepository(db).findById(userId))?.preferredLanguage ?? "en",
    plan: "free",
    stats: {
      friends: friends.length,
      followers: followers.length,
      following: following.length,
      playedMatches,
      adminGroups: groups.filter((group) => group.adminUserId === userId).length,
      joinedGroups: groups.filter((group) => group.adminUserId !== userId).length,
    },
  };

  return Response.json(profile, { headers: corsHeaders });
}

export const OPTIONS = corsOptions;

/** Sync only the authenticated caller's app preference, even when push is denied. */
export async function PATCH(request: Request) {
  const { isAuthenticated, userId } = await auth();
  const init = { headers: { "Cache-Control": "private, no-store" } };
  if (!isAuthenticated || !userId)
    return corsJson({ error: "Unauthorized" }, { ...init, status: 401 }, request);
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== "x-vercel-protection-bypass") ||
    params.getAll("x-vercel-protection-bypass").length > 1 ||
    request.headers.get("content-type")?.split(";", 1)[0] !== "application/json"
  )
    return corsJson({ error: "Invalid request" }, { ...init, status: 400 }, request);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8192)
    return corsJson({ error: "Invalid request" }, { ...init, status: 400 }, request);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return corsJson({ error: "Invalid request" }, { ...init, status: 400 }, request);
  }
  const parsed = updatePreferredLanguageSchema.safeParse(body);
  if (!parsed.success)
    return corsJson({ error: "Invalid request" }, { ...init, status: 400 }, request);
  try {
    const db = await getDb();
    await ensureCurrentUser(userId, db);
    const result = await new UsersRepository(db).setPreferredLanguage(
      userId,
      parsed.data.preferredLanguage,
    );
    if (!result.matchedCount)
      return corsJson({ error: "User not found" }, { ...init, status: 404 }, request);
    return corsJson(parsed.data, init, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { ...init, status: 500 }, request);
  }
}
