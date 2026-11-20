"use client";

import {
  type BggSearchItem,
  type BggThingResponse,
  bggThingBatchResponseSchema,
} from "@board-game-organizer/schemas";
import { type QueryClient, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityRequest,
} from "../../community/communityApi";

type GameMetadata = Partial<
  Pick<
    BggSearchItem,
    | "categories"
    | "year"
    | "average"
    | "rank"
    | "minPlayMinutes"
    | "maxPlayMinutes"
    | "suggestedPlayers"
    | "averageWeight"
  >
> & { id: number };

type PendingGame = {
  id: number;
  signal: AbortSignal;
  resolve: (game: BggThingResponse) => void;
  reject: (error: unknown) => void;
};

// Only pending requests are held here. Results and deduplication belong to the scoped Query cache.
const pending = new WeakMap<QueryClient, Map<string, PendingGame[]>>();
const aborted = () => Object.assign(new Error("Aborted"), { name: "AbortError" });

async function fetchBatch(options: CommunityApiOptions, entries: PendingGame[]) {
  const active = entries.filter(({ signal, reject }) => {
    if (!signal.aborted) return true;
    reject(aborted());
    return false;
  });
  if (active.length === 0) return;

  const controller = new AbortController();
  const abort = () => {
    if (active.every(({ signal }) => signal.aborted)) controller.abort();
  };
  for (const { signal } of active) signal.addEventListener("abort", abort);
  try {
    const ids = new Set(active.map(({ id }) => id));
    const params = new URLSearchParams({ ids: [...ids].join(",") });
    const raw = await communityRequest<unknown>(
      options,
      `bgg/thing?${params}`,
      "GET",
      undefined,
      controller.signal,
    );
    const { items } = bggThingBatchResponseSchema.parse(raw);
    const byId = new Map(items.map((game) => [game.id, game]));
    for (const { id, signal, resolve, reject } of active) {
      const game = byId.get(id);
      if (signal.aborted) reject(aborted());
      else if (!game) reject(new CommunityApiError(404, "Game not found"));
      else resolve(game);
    }
  } catch (error) {
    for (const { reject } of active) reject(error);
  } finally {
    for (const { signal } of active) signal.removeEventListener("abort", abort);
  }
}

function requestGame(
  client: QueryClient,
  options: CommunityApiOptions,
  id: number,
  signal: AbortSignal,
) {
  let scopes = pending.get(client);
  if (!scopes) {
    scopes = new Map();
    pending.set(client, scopes);
  }
  const batches = scopes;
  const scope = JSON.stringify([options.apiUrl, options.userId, options.protectionBypass]);
  const queue = batches.get(scope) ?? [];
  if (!batches.has(scope)) {
    batches.set(scope, queue);
    // Native viewability and IntersectionObserver may enable rows in different callbacks.
    setTimeout(() => {
      batches.delete(scope);
      for (let i = 0; i < queue.length; i += 20) void fetchBatch(options, queue.slice(i, i + 20));
    }, 40);
  }
  return new Promise<BggThingResponse>((resolve, reject) => {
    queue.push({ id, signal, resolve, reject });
  });
}

/** Partial catalog responses must preserve a collection's known cover and game facts. */
export function mergeBggGameMetadata<T extends BggSearchItem>(
  game: T,
  details: BggThingResponse | undefined,
): T {
  if (!details || details.id !== game.id) return game;
  const available = Object.entries(details).filter(
    ([key, value]) => key !== "name" && value != null,
  );
  return { ...game, ...Object.fromEntries(available) };
}

export function gameMetadataMissing(game: GameMetadata) {
  return (
    game.categories === undefined ||
    !game.year ||
    !game.average ||
    game.rank == null ||
    !game.minPlayMinutes ||
    !game.maxPlayMinutes ||
    !game.suggestedPlayers ||
    !game.averageWeight
  );
}

export function bggGameMetadataQuery(
  client: QueryClient,
  options: CommunityApiOptions,
  game: GameMetadata | undefined,
  visible: boolean,
) {
  const id = game?.id;
  return queryOptions({
    queryKey: ["bgg-game-metadata", options.apiUrl, options.userId, id] as const,
    enabled: Boolean(
      visible &&
        options.enabled !== false &&
        options.userId &&
        game?.id &&
        gameMetadataMissing(game),
    ),
    queryFn: ({ signal }) => requestGame(client, options, id as number, signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useBggGameMetadata(
  options: CommunityApiOptions,
  game: GameMetadata | undefined,
  visible: boolean,
) {
  return useQuery(bggGameMetadataQuery(useQueryClient(), options, game, visible));
}
