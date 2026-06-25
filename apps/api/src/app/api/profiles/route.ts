import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [];

  // In development, allow all origins
  const isDev = process.env.NODE_ENV === "development";
  const allowOrigin = isDev || allowedOrigins.includes(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
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

  // Recupera i dati utente reali da Clerk
  const userRes = await fetch(
    `https://api.clerk.com/v1/users/${userId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!userRes.ok) {
    return Response.json(
      { error: "Failed to fetch user data" },
      { status: 500, headers: corsHeaders },
    );
  }

  const clerkUser = await userRes.json();

  const profile = {
    id: clerkUser.id,
    name:
      (`${clerkUser.first_name ?? ""} ${clerkUser.last_name ?? ""}`.trim() ||
      clerkUser.email_addresses?.[0]?.email_address) ?? "Unknown",
    email: clerkUser.email_addresses?.[0]?.email_address ?? "",
    avatarUrl: clerkUser.image_url ?? "",
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