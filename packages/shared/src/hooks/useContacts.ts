import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiHeaders } from "@board-game-organizer/shared";

/** Presence snapshot attached to a contact (Phase 2). */
export interface ContactPresence {
  online: boolean;
  lastActiveAt: string;
}

/** A user surfaced in contacts/search/suggestions. */
export interface ContactUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  presence: ContactPresence;
}

/** A relationship row enriched with the other user's profile. */
export interface RelationshipRow {
  fromUserId: string;
  toUserId: string;
  profile: ContactUser | null;
}

/** Relationship list types accepted by `GET /api/relationships`. */
export type RelationshipListType =
  | "followers"
  | "following"
  | "friends"
  | "pending"
  | "sent";

export interface ContactsApiOptions {
  apiUrl: string;
  token: string | null | undefined;
}

export function fetchRelationships(
  apiUrl: string,
  token: string,
  type: RelationshipListType,
): Promise<RelationshipRow[]> {
  return fetch(`${apiUrl}/api/relationships?type=${type}`, {
    headers: apiHeaders(token),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as RelationshipRow[];
  });
}

export function fetchSuggestions(apiUrl: string, token: string): Promise<{ users: ContactUser[] }> {
  return fetch(`${apiUrl}/api/users/suggestions`, { headers: apiHeaders(token) }).then(
    async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { users: ContactUser[] };
    },
  );
}

export function searchUsers(
  apiUrl: string,
  token: string,
  query: string,
): Promise<{ users: ContactUser[] }> {
  return fetch(`${apiUrl}/api/users/search?query=${encodeURIComponent(query)}`, {
    headers: apiHeaders(token),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { users: ContactUser[] };
  });
}

/**
 * Presence heartbeat: `online`/`away`/`offline`. Call on an interval (and
 * on foreground) to keep the green-dot presence fresh.
 */
export function reportPresence(
  apiUrl: string,
  token: string,
  status: "online" | "away" | "offline" = "online",
): Promise<{ success: boolean; lastActiveAt: string }> {
  return fetch(`${apiUrl}/api/users/presence`, {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify({ status }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { success: boolean; lastActiveAt: string };
  });
}

function relationshipMutation(
  apiUrl: string,
  token: string,
  method: "POST" | "PATCH" | "DELETE",
  type: string,
  targetUserId: string,
) {
  return fetch(`${apiUrl}/api/relationships?type=${type}`, {
    method,
    headers: apiHeaders(token),
    body: method === "DELETE" ? undefined : JSON.stringify({ targetUserId }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { success: boolean };
  });
}

/**
 * All contact queries + mutations in one hook. The web Contacts tab and the
 * mobile Contacts screen share this surface.
 */
export function useContacts(apiUrl: string, token: string | null | undefined) {
  const queryClient = useQueryClient();
  const enabled = Boolean(apiUrl) && Boolean(token);

  const following = useQuery({
    queryKey: ["contacts", "following", apiUrl, token],
    queryFn: () => fetchRelationships(apiUrl, token as string, "following"),
    enabled,
    staleTime: 30_000,
  });

  const followers = useQuery({
    queryKey: ["contacts", "followers", apiUrl, token],
    queryFn: () => fetchRelationships(apiUrl, token as string, "followers"),
    enabled,
    staleTime: 30_000,
  });

  const friends = useQuery({
    queryKey: ["contacts", "friends", apiUrl, token],
    queryFn: () => fetchRelationships(apiUrl, token as string, "friends"),
    enabled,
    staleTime: 30_000,
  });

  const suggestions = useQuery({
    queryKey: ["contacts", "suggestions", apiUrl, token],
    queryFn: () => fetchSuggestions(apiUrl, token as string),
    enabled,
    staleTime: 60_000,
  });

  const follow = useMutation({
    mutationFn: ({ targetUserId }: { targetUserId: string }) =>
      relationshipMutation(apiUrl, token as string, "POST", "follow", targetUserId),
    onSuccess: () => invalidateContacts(queryClient, apiUrl, token),
  });

  const unfollow = useMutation({
    mutationFn: ({ targetUserId }: { targetUserId: string }) =>
      relationshipMutation(apiUrl, token as string, "DELETE", "follow", targetUserId),
    onSuccess: () => invalidateContacts(queryClient, apiUrl, token),
  });

  const search = useMutation({
    mutationFn: ({ query }: { query: string }) => searchUsers(apiUrl, token as string, query),
  });

  return useMemo(
    () => ({ following, followers, friends, suggestions, follow, unfollow, search }),
    [following, followers, friends, suggestions, follow, unfollow, search],
  );
}

function invalidateContacts(
  queryClient: ReturnType<typeof useQueryClient>,
  apiUrl: string,
  token: string | null | undefined,
) {
  return queryClient.invalidateQueries({ queryKey: ["contacts", undefined, apiUrl, token] });
}
