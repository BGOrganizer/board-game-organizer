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
export function useProfileQuery({
  apiUrl,
  getToken,
  userId,
  enabled = true,
  protectionBypass,
}: UseProfileOptions) {
  return useQuery<UserProfile>({
    queryKey: ["profile", apiUrl, userId],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Missing session token");
      return fetchProfile(apiUrl, token, protectionBypass);
    },
    enabled: enabled && Boolean(userId) && Boolean(apiUrl),
    staleTime: 60_000,
    refetchOnMount: "always",
    retry: 1,
  });
}
