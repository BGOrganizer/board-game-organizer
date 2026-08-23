import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";

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
  /** Block state: true if the viewer blocked this user (hidden everywhere). */
  blockedByMe?: boolean;
  /** Block state: true if this user blocked the viewer (no presence, no interaction). */
  blockedMe?: boolean;
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
  | "sent"
  | "blocked";

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
  /**
   * Vercel preview protection-bypass token. Passed explicitly by the web app
   * because NEXT_PUBLIC_* env reads are only inlined by Next.js in project
   * files, not in workspace packages (mobile keeps the process.env fallback).
   */
  protectionBypass?: string | null;
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
  protectionBypass?: string | null,
): Promise<RelationshipRow[]> {
  return fetch(withProtectionBypass(`${apiUrl}/api/relationships?type=${type}`, protectionBypass), {
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
  protectionBypass?: string | null,
): Promise<RelationshipRow[]> {
  return fetchRelationships(apiUrl, await resolveToken(token, getToken), type, protectionBypass);
}

export function fetchSuggestions(
  apiUrl: string,
  token: string,
  protectionBypass?: string | null,
): Promise<{ users: ContactUser[] }> {
  return fetch(withProtectionBypass(`${apiUrl}/api/users/suggestions`, protectionBypass), {
    headers: apiHeaders(token),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { users: ContactUser[] };
  });
}

export async function fetchSuggestionsWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  protectionBypass?: string | null,
): Promise<{ users: ContactUser[] }> {
  return fetchSuggestions(apiUrl, await resolveToken(token, getToken), protectionBypass);
}

export function searchUsers(
  apiUrl: string,
  token: string,
  query: string,
  protectionBypass?: string | null,
): Promise<{ users: ContactUser[] }> {
  return fetch(
    withProtectionBypass(
      `${apiUrl}/api/users/search?query=${encodeURIComponent(query)}`,
      protectionBypass,
    ),
    { headers: apiHeaders(token) },
  ).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { users: ContactUser[] };
  });
}

async function searchUsersWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  query: string,
  protectionBypass?: string | null,
): Promise<{ users: ContactUser[] }> {
  return searchUsers(apiUrl, await resolveToken(token, getToken), query, protectionBypass);
}

/**
 * Presence heartbeat: `online`/`away`/`offline`. Call on an interval (and
 * on foreground) to keep the green-dot presence fresh.
 */
export function reportPresence(
  apiUrl: string,
  token: string,
  status: "online" | "away" | "offline" = "online",
  protectionBypass?: string | null,
): Promise<{ success: boolean; lastActiveAt: string }> {
  return fetch(withProtectionBypass(`${apiUrl}/api/users/presence`, protectionBypass), {
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
  protectionBypass?: string | null,
) {
  return fetch(withProtectionBypass(`${apiUrl}/api/relationships?type=${type}`, protectionBypass), {
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
  protectionBypass?: string | null,
) {
  return relationshipMutation(
    apiUrl,
    await resolveToken(token, getToken),
    method,
    type,
    targetUserId,
    protectionBypass,
  );
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
export function useContacts(
  apiUrl: string,
  token: string | null | undefined,
  getToken?: () => Promise<string | null>,
  protectionBypass?: string | null,
) {
  const queryClient = useQueryClient();
  const enabled = Boolean(apiUrl) && Boolean(token);

  const following = useQuery({
    queryKey: ["contacts", "following", apiUrl, token],
    queryFn: () =>
      fetchRelationshipsWithToken(apiUrl, token, getToken, "following", protectionBypass),
    enabled,
    staleTime: 30_000,
  });

  const followers = useQuery({
    queryKey: ["contacts", "followers", apiUrl, token],
    queryFn: () =>
      fetchRelationshipsWithToken(apiUrl, token, getToken, "followers", protectionBypass),
    enabled,
    staleTime: 30_000,
  });

  const friends = useQuery({
    queryKey: ["contacts", "friends", apiUrl, token],
    queryFn: () =>
      fetchRelationshipsWithToken(apiUrl, token, getToken, "friends", protectionBypass),
    enabled,
    staleTime: 30_000,
  });

  const blocked = useQuery({
    queryKey: ["contacts", "blocked", apiUrl, token],
    queryFn: () =>
      fetchRelationshipsWithToken(apiUrl, token, getToken, "blocked", protectionBypass),
    enabled,
    staleTime: 30_000,
  });

  const suggestions = useQuery({
    queryKey: ["contacts", "suggestions", apiUrl, token],
    queryFn: () => fetchSuggestionsWithToken(apiUrl, token, getToken, protectionBypass),
    enabled,
    staleTime: 60_000,
  });

  const search = useMutation({
    mutationFn: ({ query }: { query: string }) =>
      searchUsersWithToken(apiUrl, token, getToken, query, protectionBypass),
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
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "POST",
        "follow",
        targetUserId,
        protectionBypass,
      ),
    onSuccess: () => refreshContacts(),
  });

  const unfollow = useMutation({
    mutationFn: ({ targetUserId }: { targetUserId: string }) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "DELETE",
        "follow",
        targetUserId,
        protectionBypass,
      ),
    onSuccess: () => refreshContacts(),
  });

  const block = useMutation({
    mutationFn: ({ targetUserId }: { targetUserId: string }) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "POST",
        "block",
        targetUserId,
        protectionBypass,
      ),
    onSuccess: () => refreshContacts(),
  });

  const unblock = useMutation({
    mutationFn: ({ targetUserId }: { targetUserId: string }) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "DELETE",
        "block",
        targetUserId,
        protectionBypass,
      ),
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
    () => ({
      following,
      followers,
      friends,
      blocked,
      suggestions,
      follow,
      unfollow,
      block,
      unblock,
      search,
      runSearch,
      refreshContacts,
    }),
    [
      following,
      followers,
      friends,
      blocked,
      suggestions,
      follow,
      unfollow,
      block,
      unblock,
      search,
      runSearch,
      refreshContacts,
    ],
  );
}
