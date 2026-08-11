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

/** Fetches the authenticated user's profile from the API. */
export async function fetchProfile(apiUrl: string, token: string): Promise<UserProfile> {
  const res = await fetch(`${apiUrl}${API_PATHS.profiles}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as UserProfile;
}
