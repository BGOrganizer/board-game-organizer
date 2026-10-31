"use client";

import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import type { MutationFeedback } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  optimisticFailureAction,
  optimisticOperationSignal,
} from "../../common/optimisticOperation";
import { CommunityApiError } from "../../community/communityApi";
import {
  type ContactAction,
  type ContactMutationVariables,
  contactSnapshotPresence,
  optimisticContactData,
  optimisticPeopleSocialData,
} from "./contactOptimistic";

/** Presence snapshot attached to a contact (Phase 2). */
export interface ContactPresence {
  online: boolean;
  lastActiveAt: string;
}

/** A user surfaced in contacts/search/suggestions. */
export interface ContactUser {
  id: string;
  username?: string | null;
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
  if (!token) throw new CommunityApiError(401, "No session token");
  return token;
}

export async function fetchRelationshipPageWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  type: RelationshipListType,
  cursor = "",
  protectionBypass?: string | null,
  signal?: AbortSignal,
): Promise<{ rows: RelationshipRow[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ type, limit: "20", ...(cursor ? { cursor } : {}) });
  const res = await fetch(
    withProtectionBypass(`${apiUrl}/api/relationships?${params}`, protectionBypass),
    {
      headers: apiHeaders(await resolveToken(token, getToken)),
      signal,
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const page = (await res.json()) as
    | { rows: RelationshipRow[]; nextCursor: string | null }
    | RelationshipRow[];
  return Array.isArray(page) ? { rows: page, nextCursor: null } : page;
}

export function fetchSuggestions(
  apiUrl: string,
  token: string,
  protectionBypass?: string | null,
): Promise<{ users: ContactUser[]; hasContacts: boolean }> {
  return fetch(withProtectionBypass(`${apiUrl}/api/users/suggestions`, protectionBypass), {
    headers: apiHeaders(token),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { users: ContactUser[]; hasContacts?: boolean };
    return { users: body.users, hasContacts: body.hasContacts ?? false };
  });
}

export async function fetchSuggestionsWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  protectionBypass?: string | null,
): Promise<{ users: ContactUser[]; hasContacts: boolean }> {
  return fetchSuggestions(apiUrl, await resolveToken(token, getToken), protectionBypass);
}

export async function fetchSuggestionPageWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  cursor = "",
  protectionBypass?: string | null,
  signal?: AbortSignal,
): Promise<{ users: ContactUser[]; hasContacts: boolean; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) });
  const res = await fetch(
    withProtectionBypass(`${apiUrl}/api/users/suggestions?${params}`, protectionBypass),
    {
      headers: apiHeaders(await resolveToken(token, getToken)),
      signal,
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const page = (await res.json()) as {
    users: ContactUser[];
    hasContacts?: boolean;
    nextCursor?: string | null;
  };
  return {
    users: page.users,
    hasContacts: page.hasContacts ?? false,
    nextCursor: page.nextCursor ?? null,
  };
}

export interface SyncedContactIdentifiers {
  emails: string[];
  phoneNumbers: string[];
}

export async function syncContactsWithToken(
  apiUrl: string,
  emails: string[],
  phoneNumbers: string[],
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  protectionBypass?: string | null,
  signal?: AbortSignal,
): Promise<{
  stored: number;
  users: Array<{ contactClerkId: string; email: string }>;
  registeredIdentifiers: SyncedContactIdentifiers;
}> {
  const freshToken = await resolveToken(token, getToken);
  const res = await fetch(withProtectionBypass(`${apiUrl}/api/contacts/sync`, protectionBypass), {
    method: "POST",
    headers: { ...apiHeaders(freshToken), "Content-Type": "application/json" },
    body: JSON.stringify({ emails, phoneNumbers }),
    signal,
  });
  if (!res.ok) throw new CommunityApiError(res.status, `HTTP ${res.status}`);
  return (await res.json()) as {
    stored: number;
    users: Array<{ contactClerkId: string; email: string }>;
    registeredIdentifiers: SyncedContactIdentifiers;
  };
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
    // GET: Authorization only — no Content-Type, so the request stays a
    // simple CORS request (no preflight). A Content-Type header on a GET
    // forces an OPTIONS preflight; browsers then reject the response if
    // the allow-origin is "*" with allow-credentials, surfacing as
    // "Failed to fetch" with no response event at all.
    { headers: { Authorization: `Bearer ${token}` } },
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
  signal?: AbortSignal,
) {
  return fetch(withProtectionBypass(`${apiUrl}/api/relationships?type=${type}`, protectionBypass), {
    method,
    headers: apiHeaders(token),
    // DELETE sends the body too: the handler requires targetUserId for all
    // methods (DELETE with no body previously crashed req.json() → 500).
    body: JSON.stringify({ targetUserId }),
    signal,
  }).then(async (res) => {
    if (!res.ok) throw new CommunityApiError(res.status, `HTTP ${res.status}`);
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
  signal?: AbortSignal,
) {
  return relationshipMutation(
    apiUrl,
    await resolveToken(token, getToken),
    method,
    type,
    targetUserId,
    protectionBypass,
    signal,
  );
}

async function respondToFriendRequestWithToken(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  targetUserId: string,
  decision: "accept" | "reject",
  protectionBypass?: string | null,
  signal?: AbortSignal,
) {
  const res = await fetch(
    withProtectionBypass(
      `${apiUrl}/api/friend-requests/${encodeURIComponent(targetUserId)}`,
      protectionBypass,
    ),
    {
      method: "PATCH",
      headers: apiHeaders(await resolveToken(token, getToken)),
      body: JSON.stringify({ decision }),
      signal,
    },
  );
  if (!res.ok) throw new CommunityApiError(res.status, `HTTP ${res.status}`);
  return (await res.json()) as { success: boolean };
}

export function useRelationshipList(
  apiUrl: string,
  token: string | null | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  protectionBypass: string | null | undefined,
  currentUserId: string | null | undefined,
  type: RelationshipListType,
  enabled = true,
) {
  const query = useInfiniteQuery({
    queryKey: ["contacts", type, apiUrl, currentUserId ?? token],
    queryFn: ({ pageParam }) =>
      fetchRelationshipPageWithToken(apiUrl, token, getToken, type, pageParam, protectionBypass),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: enabled && Boolean(apiUrl && (token || (getToken && currentUserId))),
    staleTime: 5 * 60_000,
  });
  return {
    ...query,
    data: Array.isArray(query.data)
      ? (query.data as RelationshipRow[])
      : query.data?.pages.flatMap((page) => page.rows),
  };
}

/**
 * All contact queries + mutations in one hook. The web Contacts tab and the
 * mobile Contacts screen share this surface.
 *
 * When `getToken` is provided (Clerk), every query/mutation resolves a
 * FRESH token right before the call, so a rotating Clerk JWT never turns
 * into stale-session 401s. After every successful relationship mutation the
 * contact lists and suggestions are invalidated (refetched) and an active search is
 * re-run, so buttons reflect the new state without manual refresh.
 */
export function useContacts(
  apiUrl: string,
  token: string | null | undefined,
  getToken?: () => Promise<string | null>,
  protectionBypass?: string | null,
  currentUserId?: string | null,
  feedback?: MutationFeedback,
) {
  const queryClient = useQueryClient();
  const resource = ["contacts", apiUrl, currentUserId ?? token] as const;
  const resourceBusy = useOptimisticBusy(resource);
  const isBusy = useCallback(
    (targetUserId: string) =>
      resourceBusy(["contacts", apiUrl, currentUserId ?? token, targetUserId]),
    [resourceBusy, apiUrl, currentUserId, token],
  );
  const owned = {
    predicate: ({ queryKey: key }: { queryKey: readonly unknown[] }) =>
      (key[0] === "contacts" && key[2] === apiUrl && key[3] === (currentUserId ?? token)) ||
      (key[0] === "groups" && key[1] === apiUrl && key[2] === currentUserId && key[3] === "people"),
  };
  const enabled = Boolean(apiUrl) && Boolean(token);

  const following = useRelationshipList(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    currentUserId,
    "following",
  );

  const followers = useRelationshipList(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    currentUserId,
    "followers",
  );

  const friends = useRelationshipList(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    currentUserId,
    "friends",
  );

  const pending = useRelationshipList(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    currentUserId,
    "pending",
  );

  const sent = useRelationshipList(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    currentUserId,
    "sent",
  );

  const blocked = useRelationshipList(
    apiUrl,
    token,
    getToken,
    protectionBypass,
    currentUserId,
    "blocked",
  );

  const suggestionsQuery = useInfiniteQuery({
    queryKey: ["contacts", "suggestions", apiUrl, currentUserId ?? token],
    queryFn: ({ pageParam }) =>
      fetchSuggestionPageWithToken(apiUrl, token, getToken, pageParam, protectionBypass),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
    staleTime: 5 * 60_000,
  });
  const suggestions = useMemo(
    () => ({
      ...suggestionsQuery,
      data:
        suggestionsQuery.data && "pages" in suggestionsQuery.data
          ? {
              users: suggestionsQuery.data.pages.flatMap((page) => page.users),
              hasContacts: suggestionsQuery.data.pages[0]?.hasContacts ?? false,
            }
          : (suggestionsQuery.data as unknown as
              | { users: ContactUser[]; hasContacts: boolean }
              | undefined),
    }),
    [suggestionsQuery],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const searchResult = useQuery({
    queryKey: ["contacts", `search:${searchQuery}`, apiUrl, currentUserId ?? token],
    queryFn: () => searchUsersWithToken(apiUrl, token, getToken, searchQuery, protectionBypass),
    enabled: enabled && searchQuery.length >= 4,
    staleTime: 30_000,
  });
  const search = searchResult;

  const refreshContacts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
    [queryClient],
  );

  const optimisticOptions = (action: ContactAction) => ({
    mutationKey: [...resource, "mutation", action],
    onMutate: async (variables: ContactMutationVariables) => {
      const operation = await beginOptimisticOperation(
        queryClient,
        [...resource, variables.targetUserId],
        owned,
        (data, key) =>
          key[0] === "contacts"
            ? optimisticContactData(key, data, action, variables, currentUserId)
            : optimisticPeopleSocialData(data, action, variables.targetUserId),
      );
      feedback?.onOptimisticUpdate?.(action);
      return operation;
    },
    onSuccess: (
      _data: unknown,
      _variables: ContactMutationVariables,
      operation: Awaited<ReturnType<typeof beginOptimisticOperation>> | undefined,
    ) => {
      if (!operation?.active) return;
      operation.commit();
    },
    onError: async (
      error: Error,
      _variables: ContactMutationVariables,
      operation: Awaited<ReturnType<typeof beginOptimisticOperation>> | undefined,
    ) => {
      if (operation && !operation.active) return;
      feedback?.onError?.(error, optimisticFailureAction(error, action));
      await operation?.reject(error);
    },
    onSettled: (
      _data: unknown,
      _error: Error | null,
      _variables: ContactMutationVariables,
      operation: Awaited<ReturnType<typeof beginOptimisticOperation>> | undefined,
    ) => {
      if (operation?.signal.aborted) return;
      void queryClient.invalidateQueries({ queryKey: ["contacts"], refetchType: "none" });
      // A cancelled first page has no data to update optimistically. Resume it,
      // without refetching loaded lists or another API/user's private cache.
      void queryClient.refetchQueries({
        queryKey: ["contacts"],
        type: "active",
        predicate: ({ queryKey, state }) =>
          state.data === undefined &&
          queryKey[2] === apiUrl &&
          queryKey[3] === (currentUserId ?? token) &&
          !String(queryKey[1]).startsWith("search:"),
      });
      void queryClient.invalidateQueries({
        queryKey: ["groups", apiUrl, currentUserId],
        predicate: ({ queryKey }) => queryKey[3] === "people" || queryKey[3] === "invitees",
      });
      // Search/suggestions may be observed by another hook instance or a retained tab.
      // Refetch eligibility from the source; a former connection is not automatically a device contact.
      void queryClient.invalidateQueries({
        queryKey: ["contacts"],
        refetchType: "active",
        predicate: ({ queryKey }) =>
          queryKey[2] === apiUrl &&
          queryKey[3] === (currentUserId ?? token) &&
          (queryKey[1] === "suggestions" || String(queryKey[1]).startsWith("search:")),
      });
    },
  });

  const follow = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "POST",
        "follow",
        targetUserId,
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("follow"),
  });

  const unfollow = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "DELETE",
        "follow",
        targetUserId,
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("unfollow"),
  });

  const unfriend = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "DELETE",
        "friend",
        targetUserId,
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("unfriend"),
  });

  const friendRequest = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "POST",
        "friend_request",
        targetUserId,
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("friend_request"),
  });

  const cancelFriendRequest = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "DELETE",
        "friend_request",
        targetUserId,
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("cancel_friend_request"),
  });

  const acceptFriendRequest = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      respondToFriendRequestWithToken(
        apiUrl,
        token,
        getToken,
        targetUserId,
        "accept",
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("accept_friend_request"),
  });

  const rejectFriendRequest = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      respondToFriendRequestWithToken(
        apiUrl,
        token,
        getToken,
        targetUserId,
        "reject",
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("reject_friend_request"),
  });

  const block = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "POST",
        "block",
        targetUserId,
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("block"),
  });

  const unblock = useMutation({
    mutationFn: ({ targetUserId }: ContactMutationVariables) =>
      relationshipMutationWithToken(
        apiUrl,
        token,
        getToken,
        "DELETE",
        "block",
        targetUserId,
        protectionBypass,
        optimisticOperationSignal(queryClient, [...resource, targetUserId]),
      ),
    ...optimisticOptions("unblock"),
  });

  const syncContacts = useMutation({
    mutationKey: [...resource, "sync"],
    mutationFn: ({
      emails,
      phoneNumbers,
    }: {
      emails: string[];
      phoneNumbers: string[];
      silent?: boolean;
    }) =>
      syncContactsWithToken(
        apiUrl,
        emails,
        phoneNumbers,
        token,
        getToken,
        protectionBypass,
        optimisticOperationSignal(queryClient, ["contacts-sync", apiUrl, currentUserId ?? token]),
      ),
    // New contacts → refresh suggestions (which read contactLinks from the DB).
    onMutate: async () => {
      const operation = await beginOptimisticOperation(
        queryClient,
        ["contacts-sync", apiUrl, currentUserId ?? token],
        { queryKey: ["contacts", "suggestions", apiUrl, currentUserId ?? token] },
        (data) => contactSnapshotPresence(data, true),
      );
      return operation;
    },
    onSuccess: (data, { silent }, operation) => {
      if (!operation?.active) return;
      operation.commit((current) => contactSnapshotPresence(current, data.stored > 0));
      if (!silent) feedback?.onSuccess?.("sync_contacts");
    },
    onError: async (error, { silent }, operation) => {
      if (operation && !operation.active) return;
      if (!silent) feedback?.onError?.(error, optimisticFailureAction(error, "sync_contacts"));
      await operation?.reject(error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["contacts", "suggestions", apiUrl, currentUserId ?? token],
      });
    },
  });

  const runSearch = useCallback((query: string) => setSearchQuery(query.trim()), []);

  return useMemo(
    () => ({
      following,
      followers,
      friends,
      pending,
      sent,
      blocked,
      suggestions,
      follow,
      unfollow,
      unfriend,
      friendRequest,
      cancelFriendRequest,
      acceptFriendRequest,
      rejectFriendRequest,
      block,
      unblock,
      syncContacts,
      search,
      runSearch,
      refreshContacts,
      isBusy,
    }),
    [
      following,
      followers,
      friends,
      pending,
      sent,
      blocked,
      suggestions,
      follow,
      unfollow,
      unfriend,
      friendRequest,
      cancelFriendRequest,
      acceptFriendRequest,
      rejectFriendRequest,
      block,
      unblock,
      syncContacts,
      search,
      runSearch,
      refreshContacts,
      isBusy,
    ],
  );
}
