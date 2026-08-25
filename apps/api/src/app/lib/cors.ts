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

/** JSON response with CORS headers attached. Pass the incoming request so the
 * real Origin header is echoed (a synthesized request has no origin and would
 * answer `*`, which browsers reject for credentialed/authorized requests). */
export function corsJson(body: unknown, init: ResponseInit = {}, request?: Request) {
  return Response.json(body, {
    ...init,
    headers: {
      ...getCorsHeaders(request ?? new Request("http://cors")),
      ...init.headers,
    },
  });
}

/** OPTIONS preflight response for CORS. Accepts the request so the real
 * Origin header reaches getCorsHeaders (a synthesized request has no origin
 * and would answer `*`, which browsers reject for credentialed requests). */
export function corsOptions(request?: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request ?? new Request("http://cors")),
  });
}
