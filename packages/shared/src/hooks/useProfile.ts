import { useQuery } from "@tanstack/react-query";
import { fetchProfile } from "../api";
import type { UserProfile } from "../types";

export interface UseProfileOptions {
  /** API base URL (injected by the calling app). */
  apiUrl: string;
  /** Resolve the current Clerk session JWT before every request. */
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
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
export function profileQueryOptions({
  apiUrl,
  getToken,
  userId,
  protectionBypass,
}: UseProfileOptions) {
  return {
    queryKey: ["profile", apiUrl, userId] as const,
    queryFn: async (): Promise<UserProfile> => {
      const token = await getToken();
      if (!token) throw new Error("Missing session token");
      return fetchProfile(apiUrl, token, protectionBypass);
    },
    staleTime: 60_000,
    retry: 1,
  };
}

export function useProfileQuery(options: UseProfileOptions) {
  return useQuery<UserProfile>({
    ...profileQueryOptions(options),
    enabled: (options.enabled ?? true) && Boolean(options.userId) && Boolean(options.apiUrl),
  });
}
