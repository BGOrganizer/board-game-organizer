import type { NextRequest } from "next/server";

/**
 * Shared CORS handling for API route handlers (extracted from the profiles
 * route). Web clients call the API from a different origin (Vercel preview
 * / localhost:3000 → localhost:4000), so every route needs these headers.
 */
export function getCorsHeaders(request: NextRequest | Request) {
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

/** JSON response with CORS headers attached. */
export function corsJson(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...getCorsHeaders(new Request("http://cors", { method: "GET" })),
      ...init.headers,
    },
  });
}

/** OPTIONS preflight response for CORS. */
export function corsOptions() {
  return new Response(null, { status: 204, headers: getCorsHeaders(new Request("http://cors")) });
}
