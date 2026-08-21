import type { UserProfile } from "./types";

/** API route paths (relative to the API base URL). */
export const API_PATHS = {
  profiles: "/api/profiles",
} as const;

/**
 * Resolve the API base URL. Each app injects its configured URL
 * (Expo: Constants.expoConfig.extra.apiUrl; Next.js: NEXT_PUBLIC_API_URL).
 */
export function resolveApiUrl(configuredUrl?: string | null): string {
  return configuredUrl?.trim() || "http://localhost:4000";
}

/**
 * Vercel preview deployments can be protected. The bypass token is injected
 * at build time by each app (EXPO_PUBLIC_* / NEXT_PUBLIC_*) and must be sent
 * as the `x-vercel-protection-bypass` QUERY PARAMETER — not a header: CORS
 * preflights (OPTIONS) never carry custom headers, so a header-based bypass
 * fails with "Redirect is not allowed for a preflight request" on protected
 * preview APIs. Vercel accepts the token in the query string and the URL is
 * part of the preflight request.
 *
 * NOTE: NEXT_PUBLIC_* env reads are only inlined by Next.js in project files
 * (not in node_modules / workspace packages), so apps pass the value
 * explicitly; Expo inlines EXPO_PUBLIC_* everywhere, so the process.env
 * fallback below covers the mobile app.
 */
function vercelProtectionBypass(): string | undefined {
  return process.env.EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS || undefined;
}

/** Append the protection-bypass token as a query parameter (if set). */
export function withProtectionBypass(
  pathOrUrl: string,
  protectionBypass?: string | null,
): string {
  const bypass = protectionBypass || vercelProtectionBypass();
  if (!bypass) return pathOrUrl;
  const sep = pathOrUrl.includes("?") ? "&" : "?";
  return `${pathOrUrl}${sep}x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;
}

/** Base headers for authenticated API calls (auth; bypass travels in the URL). */
export function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** Fetches the authenticated user's profile from the API. */
export async function fetchProfile(
  apiUrl: string,
  token: string,
  protectionBypass?: string | null,
): Promise<UserProfile> {
  const res = await fetch(withProtectionBypass(`${apiUrl}${API_PATHS.profiles}`, protectionBypass), {
    headers: apiHeaders(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as UserProfile;
}
