import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import type {
  BggSearchItem,
  BggThingResponse,
  CreateMatchInput,
} from "@board-game-organizer/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

/**
 * Matches API surface shared by web + mobile:
 * - list the caller's matches
 * - create a match (wizard final step)
 * - BGG game search (id + name) and game details (image + year)
 *
 * Same fresh-token pattern as useContacts: `getToken` resolves a fresh Clerk
 * JWT right before every call so rotated tokens never 401.
 */

export interface MatchSummary {
  id: string;
  name: string;
  dates: string[];
  minPlayers: number;
  maxPlayers: number;
  invitedUserIds: string[];
  gameIds: number[];
  createdAt: string;
}

export interface MatchesApiOptions {
  apiUrl: string;
  token: string | null | undefined;
  getToken?: () => Promise<string | null>;
  protectionBypass?: string | null;
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
  const res = await fetch(
    withProtectionBypass(`${apiUrl}/api/matches`, protectionBypass),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { matches: MatchSummary[] };
  return data.matches;
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

export function useMatches(options: MatchesApiOptions) {
  const { apiUrl, token, getToken, protectionBypass } = options;
  const queryClient = useQueryClient();
  const enabled = Boolean(apiUrl) && Boolean(token);

  const list = useQuery({
    queryKey: ["matches", apiUrl, token],
    queryFn: async () => {
      const t = await resolveToken(token, getToken);
      return listMatches(apiUrl, t, protectionBypass);
    },
    enabled,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (input: CreateMatchInput) => {
      const t = await resolveToken(token, getToken);
      return createMatch(apiUrl, t, input, protectionBypass);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
  });

  const search = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const t = await resolveToken(token, getToken);
      return searchBgg(apiUrl, t, query, protectionBypass);
    },
  });

  const thing = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const t = await resolveToken(token, getToken);
      return fetchBggThing(apiUrl, t, id, protectionBypass);
    },
  });

  return useMemo(
    () => ({ list, create, search, thing }),
    [list, create, search, thing],
  );
}
