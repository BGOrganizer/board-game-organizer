import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { enrichSingleUser } from "@/app/lib/clerk";

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

  const profile = {
    id: clerkProfile.id,
    name: clerkProfile.fullName ?? clerkProfile.emailAddress ?? "Unknown",
    email: clerkProfile.emailAddress ?? "",
    avatarUrl: clerkProfile.imageUrl ?? "",
    preferredLanguage: "it",
    plan: "free",
    stats: {
      gamesOwned: 0,
      gamesPlayed: 0,
      friends: 0,
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
