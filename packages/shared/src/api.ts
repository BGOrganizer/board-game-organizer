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
 * Vercel preview deployments can be protected; the bypass token is injected
 * at build time by each app (EXPO_PUBLIC_* / NEXT_PUBLIC_*) and sent as the
 * `x-vercel-protection-bypass` header so preview clients can call the API.
 *
 * NOTE: NEXT_PUBLIC_* env reads are only inlined by Next.js in project files
 * (not in node_modules / workspace packages), so apps pass the value
 * explicitly via `extraHeaders`; Expo inlines EXPO_PUBLIC_* everywhere, so
 * the process.env fallback below covers the mobile app.
 */
function vercelProtectionBypass(): string | undefined {
  return process.env.EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS || undefined;
}

/** Base headers for authenticated API calls (auth + preview bypass). */
export function apiHeaders(
  token: string,
  protectionBypass?: string | null,
): Record<string, string> {
  const bypass = protectionBypass || vercelProtectionBypass();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
  };
}

/** Fetches the authenticated user's profile from the API. */
export async function fetchProfile(
  apiUrl: string,
  token: string,
  protectionBypass?: string | null,
): Promise<UserProfile> {
  const res = await fetch(`${apiUrl}${API_PATHS.profiles}`, {
    headers: apiHeaders(token, protectionBypass),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as UserProfile;
}
