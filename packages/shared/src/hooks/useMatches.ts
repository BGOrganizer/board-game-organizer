import type {
  BggSearchItem,
  BggThingResponse,
  CreateMatchInput,
  MatchDetailResponse,
  MatchInvitationResponse,
  MatchResponse,
  MatchStatus,
  SetMatchChoiceInput,
  UpdateMatchInput,
} from "@board-game-organizer/schemas";
import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { MutationFeedback } from "../mutationFeedback";

/**
 * Matches API surface shared by web + mobile.
 *
 * Every request resolves a fresh Clerk JWT immediately before fetch so token
 * rotation cannot leave a stale snapshot in a later network call.
 */
export type MatchSummary = MatchResponse & { optimistic?: boolean };

export interface MatchesApiOptions {
  apiUrl: string;
  token: string | null | undefined;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
  userId?: string | null;
  feedback?: MutationFeedback;
}

export interface MatchDetailApiOptions extends MatchesApiOptions {
  matchId: string;
}

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

async function listMatches(
  apiUrl: string,
  token: string,
  protectionBypass?: string | null,
): Promise<MatchSummary[]> {
  const res = await fetch(withProtectionBypass(`${apiUrl}/api/matches`, protectionBypass), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { matches: MatchSummary[] };
  return data.matches;
}

async function fetchMatchDetail(
  apiUrl: string,
  token: string,
  matchId: string,
  protectionBypass?: string | null,
): Promise<MatchDetailResponse> {
  const res = await fetch(
    withProtectionBypass(`${apiUrl}/api/matches/${encodeURIComponent(matchId)}`, protectionBypass),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MatchDetailResponse;
}

async function setMatchChoiceRequest(
  apiUrl: string,
  token: string,
  matchId: string,
  input: SetMatchChoiceInput,
  protectionBypass?: string | null,
) {
  const res = await fetch(
    withProtectionBypass(
      `${apiUrl}/api/matches/${encodeURIComponent(matchId)}/choices`,
      protectionBypass,
    ),
    { method: "PATCH", headers: apiHeaders(token), body: JSON.stringify(input) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function setMatchStatusRequest(
  apiUrl: string,
  token: string,
  matchId: string,
  status: MatchStatus,
  protectionBypass?: string | null,
): Promise<{ match: MatchResponse }> {
  const res = await fetch(
    withProtectionBypass(
      `${apiUrl}/api/matches/${encodeURIComponent(matchId)}/status`,
      protectionBypass,
    ),
    { method: "PATCH", headers: apiHeaders(token), body: JSON.stringify({ status }) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function createMatch(
  apiUrl: string,
  token: string,
  input: CreateMatchInput,
  protectionBypass?: string | null,
): Promise<{ match: MatchSummary }> {
  const res = await fetch(withProtectionBypass(`${apiUrl}/api/matches`, protectionBypass), {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as { match: MatchSummary };
}

async function updateMatch(
  apiUrl: string,
  token: string,
  matchId: string,
  input: UpdateMatchInput,
  protectionBypass?: string | null,
): Promise<{ match: MatchSummary }> {
  const res = await fetch(
    withProtectionBypass(`${apiUrl}/api/matches/${encodeURIComponent(matchId)}`, protectionBypass),
    {
      method: "PATCH",
      headers: apiHeaders(token),
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as { match: MatchSummary };
}

async function respondToInvitation(
  apiUrl: string,
  token: string,
  invitationId: string,
  decision: "accept" | "decline",
  protectionBypass?: string | null,
): Promise<{ invitation: MatchInvitationResponse }> {
  const res = await fetch(
    withProtectionBypass(
      `${apiUrl}/api/match-invitations/${encodeURIComponent(invitationId)}`,
      protectionBypass,
    ),
    {
      method: "PATCH",
      headers: apiHeaders(token),
      body: JSON.stringify({ decision }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { invitation: MatchInvitationResponse };
}

async function deleteMatchRequest(
  apiUrl: string,
  token: string,
  matchId: string,
  protectionBypass?: string | null,
): Promise<void> {
  const res = await fetch(
    withProtectionBypass(`${apiUrl}/api/matches/${encodeURIComponent(matchId)}`, protectionBypass),
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function leaveMatchRequest(
  apiUrl: string,
  token: string,
  invitationId: string,
  protectionBypass?: string | null,
): Promise<void> {
  const res = await fetch(
    withProtectionBypass(
      `${apiUrl}/api/match-invitations/${encodeURIComponent(invitationId)}`,
      protectionBypass,
    ),
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function searchBgg(
  apiUrl: string,
  token: string,
  query: string,
  protectionBypass?: string | null,
): Promise<BggSearchItem[]> {
  const res = await fetch(
    withProtectionBypass(
      `${apiUrl}/api/bgg/search?query=${encodeURIComponent(query)}`,
      protectionBypass,
    ),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { items: BggSearchItem[] };
  return data.items;
}

async function fetchBggThing(
  apiUrl: string,
  token: string,
  id: number,
  protectionBypass?: string | null,
): Promise<BggThingResponse> {
  const res = await fetch(
    withProtectionBypass(`${apiUrl}/api/bgg/thing?id=${id}`, protectionBypass),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as BggThingResponse;
}

function patchInvitation(
  match: MatchSummary,
  invitationId: string,
  status: "ACCEPTED" | "DECLINED",
): MatchSummary {
  const now = new Date().toISOString();
  return {
    ...match,
    invitations: match.invitations.map((invitation) =>
      invitation.id === invitationId
        ? { ...invitation, status, respondedAt: now, updatedAt: now }
        : invitation,
    ),
  };
}

function patchInvitationCache(
  data: unknown,
  invitationId: string,
  status: "ACCEPTED" | "DECLINED",
): unknown {
  if (Array.isArray(data)) {
    if (status === "DECLINED") {
      return data.filter(
        (match: MatchSummary) =>
          !match.invitations.some((invitation) => invitation.id === invitationId),
      );
    }
    return data.map((match: MatchSummary) => patchInvitation(match, invitationId, status));
  }
  if (!data || typeof data !== "object" || !("match" in data)) return data;
  const detail = data as MatchDetailResponse;
  return {
    ...detail,
    match: patchInvitation(detail.match, invitationId, status),
    invitedPlayers: detail.invitedPlayers.map((player) => ({
      ...player,
      invitation:
        player.invitation.id === invitationId
          ? {
              ...player.invitation,
              status,
              respondedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : player.invitation,
    })),
  };
}

function patchMatch(match: MatchSummary, input: UpdateMatchInput): MatchSummary {
  const now = new Date().toISOString();
  const invitedUserIds = input.invitedUserIds ?? match.invitedUserIds;
  const invitationsByUserId = new Map(
    match.invitations.map((invitation) => [invitation.inviteeUserId, invitation]),
  );
  return {
    ...match,
    ...input,
    invitedUserIds,
    invitations: invitedUserIds.map(
      (inviteeUserId, index) =>
        invitationsByUserId.get(inviteeUserId) ?? {
          id: `optimistic-${match.id}-${index}`,
          matchId: match.id,
          inviterUserId: match.adminUserId,
          inviteeUserId,
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        },
    ),
    updatedAt: now,
  };
}

function patchMatchCache(data: unknown, matchId: string, input: UpdateMatchInput): unknown {
  if (Array.isArray(data)) {
    return data.map((match: MatchSummary) =>
      match.id === matchId ? patchMatch(match, input) : match,
    );
  }
  if (!data || typeof data !== "object" || !("match" in data)) return data;
  const detail = data as MatchDetailResponse;
  if (detail.match.id !== matchId) return data;
  const selectedUserIds = new Set(input.invitedUserIds ?? detail.match.invitedUserIds);
  const selectedGameIds = new Set(input.gameIds ?? detail.match.gameIds);
  return {
    ...detail,
    match: patchMatch(detail.match, input),
    invitedPlayers: detail.invitedPlayers.filter((player) => selectedUserIds.has(player.id)),
    games: detail.games.filter((game) => selectedGameIds.has(game.id)),
  };
}

function replaceMatchCache(data: unknown, match: MatchSummary): unknown {
  if (Array.isArray(data)) {
    return data.map((candidate: MatchSummary) => (candidate.id === match.id ? match : candidate));
  }
  if (!data || typeof data !== "object" || !("match" in data)) return data;
  const detail = data as MatchDetailResponse;
  if (detail.match.id !== match.id) return data;
  const invitedUserIds = new Set(match.invitedUserIds);
  const gameIds = new Set(match.gameIds);
  return {
    ...detail,
    match,
    invitedPlayers: detail.invitedPlayers.filter((player) => invitedUserIds.has(player.id)),
    games: detail.games.filter((game) => gameIds.has(game.id)),
  };
}

function optimisticMatch(input: CreateMatchInput, userId?: string | null): MatchSummary {
  const now = new Date().toISOString();
  const id = `optimistic-${Date.now()}`;
  return {
    id,
    adminUserId: userId ?? "",
    name: input.name,
    dates: input.dates,
    minPlayers: input.minPlayers,
    maxPlayers: input.maxPlayers,
    invitedUserIds: input.invitedUserIds,
    gameIds: input.gameIds,
    status: "PLANNING",
    createdAt: now,
    updatedAt: now,
    invitations: input.invitedUserIds.map((inviteeUserId, index) => ({
      id: `${id}-${index}`,
      matchId: id,
      inviterUserId: userId ?? "",
      inviteeUserId,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    })),
    optimistic: true,
  };
}

function useRespondToInvitation(options: MatchesApiOptions) {
  const { apiUrl, token, getToken, protectionBypass, feedback } = options;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invitationId,
      decision,
    }: {
      invitationId: string;
      decision: "accept" | "decline";
    }) => {
      const freshToken = await resolveToken(token, getToken);
      return respondToInvitation(apiUrl, freshToken, invitationId, decision, protectionBypass);
    },
    onMutate: async ({ invitationId, decision }) => {
      await queryClient.cancelQueries({ queryKey: ["matches"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["matches"] });
      const status = decision === "accept" ? "ACCEPTED" : "DECLINED";
      for (const [queryKey, data] of snapshots) {
        queryClient.setQueryData(queryKey, patchInvitationCache(data, invitationId, status));
      }
      feedback?.onOptimisticUpdate?.(
        decision === "accept" ? "accept_match_invitation" : "decline_match_invitation",
      );
      return snapshots;
    },
    onSuccess: ({ invitation }) => {
      if (invitation.status !== "ACCEPTED" && invitation.status !== "DECLINED") return;
      for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: ["matches"] })) {
        queryClient.setQueryData(
          queryKey,
          patchInvitationCache(data, invitation.id, invitation.status),
        );
      }
    },
    onError: (error: Error, { decision }, snapshots) => {
      for (const [queryKey, data] of snapshots ?? []) queryClient.setQueryData(queryKey, data);
      feedback?.onError?.(
        error,
        decision === "accept" ? "accept_match_invitation" : "decline_match_invitation",
      );
    },
    onSettled: (_data, error) =>
      queryClient.invalidateQueries({
        queryKey: ["matches"],
        refetchType: error ? "active" : "none",
      }),
  });
}

export function useMatches(options: MatchesApiOptions) {
  const { apiUrl, token, getToken, protectionBypass, userId, feedback } = options;
  const queryClient = useQueryClient();
  const enabled = Boolean(apiUrl) && Boolean(token);
  const respondInvitation = useRespondToInvitation(options);

  const list = useQuery({
    queryKey: ["matches", apiUrl, token],
    queryFn: async () => {
      const freshToken = await resolveToken(token, getToken);
      return listMatches(apiUrl, freshToken, protectionBypass);
    },
    enabled,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (input: CreateMatchInput) => {
      const freshToken = await resolveToken(token, getToken);
      return createMatch(apiUrl, freshToken, input, protectionBypass);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["matches"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["matches"] });
      for (const [queryKey, data] of snapshots) {
        if (Array.isArray(data)) {
          queryClient.setQueryData(queryKey, [optimisticMatch(input, userId), ...data]);
        }
      }
      feedback?.onOptimisticUpdate?.("create_match");
      return snapshots;
    },
    onError: (error: Error, _input, snapshots) => {
      for (const [queryKey, data] of snapshots ?? []) queryClient.setQueryData(queryKey, data);
      feedback?.onError?.(error, "create_match");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
  });

  const update = useMutation({
    mutationFn: async ({ matchId, input }: { matchId: string; input: UpdateMatchInput }) => {
      const freshToken = await resolveToken(token, getToken);
      return updateMatch(apiUrl, freshToken, matchId, input, protectionBypass);
    },
    onMutate: async ({ matchId, input }) => {
      await queryClient.cancelQueries({ queryKey: ["matches"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["matches"] });
      for (const [queryKey, data] of snapshots) {
        queryClient.setQueryData(queryKey, patchMatchCache(data, matchId, input));
      }
      feedback?.onOptimisticUpdate?.("update_match");
      return snapshots;
    },
    onSuccess: ({ match }) => {
      for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: ["matches"] })) {
        queryClient.setQueryData(queryKey, replaceMatchCache(data, match));
      }
    },
    onError: (error: Error, _variables, snapshots) => {
      for (const [queryKey, data] of snapshots ?? []) queryClient.setQueryData(queryKey, data);
      feedback?.onError?.(error, "update_match");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
  });

  const search = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const freshToken = await resolveToken(token, getToken);
      return searchBgg(apiUrl, freshToken, query, protectionBypass);
    },
  });

  const thing = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const freshToken = await resolveToken(token, getToken);
      return fetchBggThing(apiUrl, freshToken, id, protectionBypass);
    },
  });

  return useMemo(
    () => ({ list, create, update, search, thing, respondInvitation }),
    [list, create, update, search, thing, respondInvitation],
  );
}

export function useMatchDetail(options: MatchDetailApiOptions) {
  const { apiUrl, token, getToken, protectionBypass, matchId, feedback } = options;
  const queryClient = useQueryClient();
  const respondInvitation = useRespondToInvitation(options);
  const detail = useQuery({
    queryKey: ["matches", "detail", matchId, apiUrl, token],
    queryFn: async () => {
      const freshToken = await resolveToken(token, getToken);
      return fetchMatchDetail(apiUrl, freshToken, matchId, protectionBypass);
    },
    enabled: Boolean(apiUrl) && Boolean(token) && Boolean(matchId),
    staleTime: 30_000,
  });

  const setChoice = useMutation({
    mutationFn: async (input: SetMatchChoiceInput) =>
      setMatchChoiceRequest(
        apiUrl,
        await resolveToken(token, getToken),
        matchId,
        input,
        protectionBypass,
      ),
    onMutate: async (input) => {
      const key = ["matches", "detail", matchId, apiUrl, token];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MatchDetailResponse>(key);
      if (previous) {
        const field = input.kind;
        const id = input.kind === "dates" ? String(Date.parse(input.itemId)) : String(input.itemId);
        queryClient.setQueryData<MatchDetailResponse>(key, {
          ...previous,
          choices: {
            ...previous.choices,
            [field]: { ...previous.choices?.[field], [id]: input.choice },
          },
        });
      }
      feedback?.onOptimisticUpdate?.("set_match_choice");
      return { key, previous };
    },
    onError: (error: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
      feedback?.onError?.(error, "set_match_choice");
    },
    onSettled: (_data, error) =>
      queryClient.invalidateQueries({
        queryKey: ["matches", "detail", matchId],
        refetchType: error ? "active" : "none",
      }),
  });
  const setStatus = useMutation({
    mutationFn: async (status: MatchStatus) =>
      setMatchStatusRequest(
        apiUrl,
        await resolveToken(token, getToken),
        matchId,
        status,
        protectionBypass,
      ),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: ["matches"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["matches"] });
      const patch = (match: MatchResponse) =>
        match.id === matchId
          ? {
              ...match,
              status,
              ...(status === "PLANNING"
                ? { selectedDate: undefined, selectedGameId: undefined }
                : {}),
              ...(status === "CREATED"
                ? {
                    invitations: match.invitations.filter(
                      (invitation) => invitation.status === "ACCEPTED",
                    ),
                    invitedUserIds: match.invitations
                      .filter((invitation) => invitation.status === "ACCEPTED")
                      .map((invitation) => invitation.inviteeUserId),
                  }
                : {}),
            }
          : match;
      for (const [queryKey, data] of snapshots) {
        if (Array.isArray(data)) queryClient.setQueryData(queryKey, data.map(patch));
        else if (data && typeof data === "object" && "match" in data) {
          const detail = data as MatchDetailResponse;
          queryClient.setQueryData(queryKey, {
            ...detail,
            match: patch(detail.match),
            invitedPlayers:
              status === "CREATED"
                ? detail.invitedPlayers.filter((player) => player.invitation.status === "ACCEPTED")
                : detail.invitedPlayers,
          });
        }
      }
      feedback?.onOptimisticUpdate?.(status === "CREATED" ? "create_match_status" : "replan_match");
      return snapshots;
    },
    onSuccess: ({ match }) => {
      for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: ["matches"] })) {
        queryClient.setQueryData(queryKey, replaceMatchCache(data, match));
      }
    },
    onError: (error: Error, status, snapshots) => {
      for (const [queryKey, data] of snapshots ?? []) queryClient.setQueryData(queryKey, data);
      feedback?.onError?.(error, status === "CREATED" ? "create_match_status" : "replan_match");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
  });

  const deleteMatch = useMutation({
    mutationFn: async (id: string) =>
      deleteMatchRequest(apiUrl, await resolveToken(token, getToken), id, protectionBypass),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["matches"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["matches"] });
      for (const [queryKey, data] of snapshots) {
        if (Array.isArray(data)) {
          queryClient.setQueryData(
            queryKey,
            data.filter((match: MatchSummary) => match.id !== id),
          );
        }
      }
      feedback?.onOptimisticUpdate?.("delete_match");
      return snapshots;
    },
    onError: (error: Error, _id, snapshots) => {
      for (const [queryKey, data] of snapshots ?? []) queryClient.setQueryData(queryKey, data);
      feedback?.onError?.(error, "delete_match");
    },
    onSettled: (_data, error) =>
      queryClient.invalidateQueries({
        queryKey: ["matches"],
        refetchType: error ? "active" : "none",
      }),
  });

  const leaveMatch = useMutation({
    mutationFn: async (invitationId: string) =>
      leaveMatchRequest(
        apiUrl,
        await resolveToken(token, getToken),
        invitationId,
        protectionBypass,
      ),
    onMutate: async (invitationId) => {
      await queryClient.cancelQueries({ queryKey: ["matches"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["matches"] });
      for (const [queryKey, data] of snapshots) {
        if (Array.isArray(data)) {
          queryClient.setQueryData(
            queryKey,
            data.filter(
              (match: MatchSummary) =>
                !match.invitations.some((invitation) => invitation.id === invitationId),
            ),
          );
        }
      }
      feedback?.onOptimisticUpdate?.("leave_match");
      return snapshots;
    },
    onError: (error: Error, _invitationId, snapshots) => {
      for (const [queryKey, data] of snapshots ?? []) queryClient.setQueryData(queryKey, data);
      feedback?.onError?.(error, "leave_match");
    },
    onSettled: (_data, error) =>
      queryClient.invalidateQueries({
        queryKey: ["matches"],
        refetchType: error ? "active" : "none",
      }),
  });

  return useMemo(
    () => ({ detail, respondInvitation, setChoice, setStatus, deleteMatch, leaveMatch }),
    [detail, respondInvitation, setChoice, setStatus, deleteMatch, leaveMatch],
  );
}
