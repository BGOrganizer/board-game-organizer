import { useQuery } from "@tanstack/react-query";
import { fetchProfile } from "../api";
import type { UserProfile } from "../types";

export interface UseProfileOptions {
  /** API base URL (injected by the calling app). */
  apiUrl: string;
  /** Clerk session token; the query stays disabled until it's available. */
  token: string | null | undefined;
  /** Extra gate for the query (e.g. only when the user is signed in). */
  enabled?: boolean;
  /** Vercel preview protection-bypass token (passed by the web app). */
  protectionBypass?: string | null;
}

/**
 * TanStack Query hook that loads the current user's profile from the REST
 * API. Mutations live in `queryClient.invalidateQueries(["profile"])`
 * callers — Zustand never stores this server data.
 */
export function useProfileQuery({
  apiUrl,
  token,
  enabled = true,
  protectionBypass,
}: UseProfileOptions) {
  return useQuery<UserProfile>({
    queryKey: ["profile", apiUrl, token],
    queryFn: () => fetchProfile(apiUrl, token as string, protectionBypass),
    enabled: enabled && Boolean(token) && Boolean(apiUrl),
    staleTime: 60_000,
    retry: 1,
  });
}
