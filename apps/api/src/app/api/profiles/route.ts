import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { enrichSingleUser } from "@/app/lib/clerk";
import { getDb } from "@/app/lib/db";
import { GroupsRepository } from "@/app/lib/groups.repository";
import { MatchesRepository } from "@/app/lib/matches.repository";
import { RelationshipRepository } from "@/app/lib/relationship.repository";
import { RelationshipService } from "@/app/lib/relationship.service";

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [];

  // In development, allow all origins
  const isDev = process.env.NODE_ENV === "development";
  // Vercel preview deployments use unpredictable *.vercel.app subdomains:
  // allow them so preview E2E (Playwright) can call the API.
  const isVercelPreview = origin.endsWith(".vercel.app");
  const allowOrigin = isDev || allowedOrigins.includes(origin) || isVercelPreview ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function GET(request: NextRequest) {
  const { isAuthenticated, userId } = await auth();
  const corsHeaders = getCorsHeaders(request);

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
    preferredLanguage: "it",
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

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
