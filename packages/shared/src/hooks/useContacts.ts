import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
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
  /** Relationship state relative to the signed-in viewer (coherent across tabs). */
  isFollowing?: boolean;
  isFollower?: boolean;
  isFriend?: boolean;
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
  /**
   * Fresh-session-token provider (Clerk getToken). When provided, every
   * query/mutation fetches a fresh token right before the call instead of
   * relying on the (stale) `token` snapshot — the Clerk JWT rotates, and a
   * cached snapshot eventually yields HTTP 401.
   */
  getToken?: () => Promise<string | null>;
}

/** Resolve the token to use for one API call: fresh when available, else the snapshot. */
async function resolveToken(
  token: string | null | undefined,
  getToken?: () => Promise<string | null>,
): Promise<string> {
  if (getToken) {
    const fresh = await getToken().catch(() => null);
    if (fresh) return fresh;
  }
  if (!token) throw new Error("No session token");
  return token;
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

export async function fetchRelationshipsWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  type: RelationshipListType,
): Promise<RelationshipRow[]> {
  return fetchRelationships(apiUrl, await resolveToken(token, getToken), type);
}

export function fetchSuggestions(apiUrl: string, token: string): Promise<{ users: ContactUser[] }> {
  return fetch(`${apiUrl}/api/users/suggestions`, { headers: apiHeaders(token) }).then(
    async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { users: ContactUser[] };
    },
  );
}

export async function fetchSuggestionsWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
): Promise<{ users: ContactUser[] }> {
  return fetchSuggestions(apiUrl, await resolveToken(token, getToken));
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

async function searchUsersWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  query: string,
): Promise<{ users: ContactUser[] }> {
  return searchUsers(apiUrl, await resolveToken(token, getToken), query);
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
    // DELETE sends the body too: the handler requires targetUserId for all
    // methods (DELETE with no body previously crashed req.json() → 500).
    body: JSON.stringify({ targetUserId }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { success: boolean };
  });
}

async function relationshipMutationWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  method: "POST" | "PATCH" | "DELETE",
  type: string,
  targetUserId: string,
) {
  return relationshipMutation(apiUrl, await resolveToken(token, getToken), method, type, targetUserId);
}

/**
 * All contact queries + mutations in one hook. The web Contacts tab and the
 * mobile Contacts screen share this surface.
 *
 * When `getToken` is provided (Clerk), every query/mutation resolves a
 * FRESH token right before the call, so a rotating Clerk JWT never turns
 * into stale-session 401s. After a successful follow/unfollow the contacts
 * lists and suggestions are invalidated (refetched) and an active search is
 * re-run, so buttons reflect the new state without manual refresh.
 */
export function useContacts(apiUrl: string, token: string | null | undefined, getToken?: () => Promise<string | null>) {
  const queryClient = useQueryClient();
  const enabled = Boolean(apiUrl) && Boolean(token);

  const following = useQuery({
    queryKey: ["contacts", "following", apiUrl, token],
    queryFn: () => fetchRelationshipsWithToken(apiUrl, token, getToken, "following"),
    enabled,
    staleTime: 30_000,
  });

  const followers = useQuery({
    queryKey: ["contacts", "followers", apiUrl, token],
    queryFn: () => fetchRelationshipsWithToken(apiUrl, token, getToken, "followers"),
    enabled,
    staleTime: 30_000,
  });

  const friends = useQuery({
    queryKey: ["contacts", "friends", apiUrl, token],
    queryFn: () => fetchRelationshipsWithToken(apiUrl, token, getToken, "friends"),
    enabled,
    staleTime: 30_000,
  });

  const suggestions = useQuery({
    queryKey: ["contacts", "suggestions", apiUrl, token],
    queryFn: () => fetchSuggestionsWithToken(apiUrl, token, getToken),
    enabled,
    staleTime: 60_000,
  });

  const search = useMutation({
    mutationFn: ({ query }: { query: string }) =>
      searchUsersWithToken(apiUrl, token, getToken, query),
  });
  // Keep the last executed search so follow/unfollow can re-run it and the
  // buttons (follow → unfollow) update without a manual re-search.
  const lastSearchQuery = useRef<string | null>(null);

  const refreshContacts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    if (lastSearchQuery.current) {
      search.mutate({ query: lastSearchQuery.current });
    }
  }, [queryClient, search]);

  const follow = useMutation({
    mutationFn: ({ targetUserId }: { targetUserId: string }) =>
      relationshipMutationWithToken(apiUrl, token, getToken, "POST", "follow", targetUserId),
    onSuccess: () => refreshContacts(),
  });

  const unfollow = useMutation({
    mutationFn: ({ targetUserId }: { targetUserId: string }) =>
      relationshipMutationWithToken(apiUrl, token, getToken, "DELETE", "follow", targetUserId),
    onSuccess: () => refreshContacts(),
  });

  // Keep the search mutation wired so the component can re-run it via refreshContacts.
  const runSearch = useCallback(
    (query: string) => {
      lastSearchQuery.current = query.trim() || null;
      search.mutate({ query: query.trim() });
    },
    [search],
  );

  return useMemo(
    () => ({ following, followers, friends, suggestions, follow, unfollow, search, runSearch, refreshContacts }),
    [following, followers, friends, suggestions, follow, unfollow, search, runSearch, refreshContacts],
  );
}
