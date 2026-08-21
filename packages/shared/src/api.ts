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
 */
function vercelProtectionBypass(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS ||
    process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS ||
    undefined
  );
}

/** Base headers for authenticated API calls (auth + preview bypass). */
export function apiHeaders(token: string): Record<string, string> {
  const bypass = vercelProtectionBypass();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
  };
}

/** Fetches the authenticated user's profile from the API. */
export async function fetchProfile(apiUrl: string, token: string): Promise<UserProfile> {
  const res = await fetch(`${apiUrl}${API_PATHS.profiles}`, {
    headers: apiHeaders(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as UserProfile;
}
