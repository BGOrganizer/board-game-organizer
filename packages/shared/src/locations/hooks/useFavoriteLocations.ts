import {
  type FavoriteLocationsResponse,
  favoriteLocationSchema,
  locationFavoriteKey,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import {
  type InfiniteData,
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { withProtectionBypass } from "../../common/api";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import { useScopedMutations } from "../../common/hooks/useScopedMutations";
import type { MutationFeedback } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  optimisticFailureAction,
  optimisticOperationSignal,
} from "../../common/optimisticOperation";
import { CommunityApiError } from "../../community/communityApi";

export interface FavoriteLocationsOptions {
  apiUrl: string;
  userId: string | null | undefined;
  getToken: () => Promise<string | null>;
  protectionBypass?: string | null;
  feedback?: MutationFeedback;
}
async function requestFavoriteLocations(
  options: FavoriteLocationsOptions,
  path: string,
  init?: RequestInit,
) {
  const token = await options.getToken();
  if (!token) throw new CommunityApiError(401, "Unauthorized");
  const response = await fetch(
    withProtectionBypass(
      `${options.apiUrl}/api/locations/favorites${path}`,
      options.protectionBypass,
    ),
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    },
  );
  if (!response.ok) throw new CommunityApiError(response.status, `HTTP ${response.status}`);
  return response.json();
}
export function favoriteLocationsQuery(options: FavoriteLocationsOptions) {
  return infiniteQueryOptions({
    queryKey: ["favoriteLocations", options.apiUrl, options.userId, "list"] as const,
    queryFn: ({ pageParam, signal }) =>
      requestFavoriteLocations(options, `?limit=20${pageParam ? `&cursor=${pageParam}` : ""}`, {
        signal,
      }) as Promise<FavoriteLocationsResponse>,
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(options.apiUrl && options.userId),
    staleTime: 5 * 60_000,
  });
}
export function useFavoriteLocations(
  options: FavoriteLocationsOptions,
  locations: MatchLocation[] = [],
) {
  const { apiUrl, userId, feedback } = options;
  const client = useQueryClient();
  const root = ["favoriteLocations", apiUrl, userId] as const;
  const listKey = [...root, "list"] as const;
  const resourceBusy = useOptimisticBusy(root);
  const resourceKey = (location: MatchLocation) => {
    const key = locationFavoriteKey(location);
    const cached = client.getQueryData<InfiniteData<FavoriteLocationsResponse>>(listKey);
    return (
      cached?.pages
        .flatMap((page) => page.items)
        .find((item) => item.key === key || locationFavoriteKey(item.location) === key)?.key ?? key
    );
  };
  const keys = [...new Set(locations.map(locationFavoriteKey))].sort();
  const statusKey = [...root, "status", keys] as const;
  const enabled = Boolean(apiUrl && userId);
  const request = (path: string, init?: RequestInit) =>
    requestFavoriteLocations(options, path, init);
  const list = useInfiniteQuery(favoriteLocationsQuery(options));
  const status = useQuery({
    queryKey: statusKey,
    queryFn: async ({ signal }) => {
      const found: string[] = [];
      for (let index = 0; index < keys.length; ) {
        const batch = [keys[index++]];
        // Keep encoded batches below common proxy URL limits, including long Unicode addresses.
        while (
          index < keys.length &&
          batch.length < 50 &&
          encodeURIComponent(JSON.stringify([...batch, keys[index]])).length <= 6000
        )
          batch.push(keys[index++]);
        const response = (await request(`?keys=${encodeURIComponent(JSON.stringify(batch))}`, {
          signal,
        })) as { keys: string[] };
        found.push(...response.keys);
      }
      return found;
    },
    enabled: enabled && keys.length > 0,
    staleTime: 5 * 60_000,
  });
  const toggle = useMutation({
    mutationKey: root,
    mutationFn: async ({
      location,
      favorite,
      matchId,
    }: {
      location: MatchLocation;
      favorite: boolean;
      matchId?: string;
    }) => {
      return request("", {
        method: favorite ? "DELETE" : "POST",
        signal: optimisticOperationSignal(client, [...root, locationFavoriteKey(location)]),
        body: JSON.stringify(
          favorite
            ? { key: locationFavoriteKey(location) }
            : { location, ...(matchId ? { matchId } : {}) },
        ),
      });
    },
    onMutate: async ({ location, favorite }) => {
      const key = locationFavoriteKey(location);
      const identity = resourceKey(location);
      const cached = client.getQueryData<InfiniteData<FavoriteLocationsResponse>>(listKey);
      const equivalent =
        cached?.pages
          .flatMap((page) => page.items)
          .filter((item) => item.key === key || locationFavoriteKey(item.location) === key) ?? [];
      const affected = new Set([
        key,
        ...equivalent.flatMap((item) => [item.key, locationFavoriteKey(item.location)]),
      ]);
      const operation = await beginOptimisticOperation(
        client,
        [...root, identity],
        { queryKey: root },
        (data, queryKey) => {
          if (queryKey[3] === "status" && Array.isArray(data))
            return favorite
              ? data.filter((item) => !affected.has(item))
              : [...new Set([...data, key])];
          if (queryKey[3] !== "list" || !data) return data;
          const pages = data as InfiniteData<FavoriteLocationsResponse>;
          return {
            ...pages,
            pages: pages.pages.map((page, index) => ({
              ...page,
              items: favorite
                ? page.items.filter(
                    (item) =>
                      !affected.has(item.key) && !affected.has(locationFavoriteKey(item.location)),
                  )
                : index === 0
                  ? [{ key, location }, ...page.items.filter((item) => item.key !== key)]
                  : page.items.filter((item) => item.key !== key),
            })),
          };
        },
        [...affected].map((alias) => [...root, alias]),
      );
      feedback?.onOptimisticUpdate?.(
        favorite ? "remove_favorite_location" : "add_favorite_location",
      );
      return { operation, key, root };
    },
    onSuccess: (response, variables, context) => {
      if (!context?.operation.active) return;
      const parsed = favoriteLocationSchema.safeParse(response?.item);
      context.operation.commit((data, queryKey) => {
        if (variables.favorite || !parsed.success || queryKey[3] !== "list" || !data) return data;
        const current = data as InfiniteData<FavoriteLocationsResponse>;
        const seen = new Set<string>();
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.flatMap((item) => {
              const saved = item.key === context.key ? parsed.data : item;
              if (seen.has(saved.key)) return [];
              seen.add(saved.key);
              return [saved];
            }),
          })),
        };
      });
    },
    onError: async (error: Error, variables, context) => {
      if (context && !context.operation.active) return;
      const action = variables.favorite ? "remove_favorite_location" : "add_favorite_location";
      feedback?.onError?.(error, context ? optimisticFailureAction(error, action) : action);
      await context?.operation.reject(error);
    },
    onSettled: (_data, _error, _variables, context) => {
      void client.invalidateQueries({
        queryKey: context?.root ?? root,
        refetchType: resourceBusy() ? "none" : "active",
      });
    },
  });
  const pending = useScopedMutations({ mutationKey: root, status: "pending" }).map((mutation) =>
    (mutation.state.context as { operation?: { active: boolean } } | undefined)?.operation?.active
      ? (mutation.state.variables as Parameters<typeof toggle.mutate>[0])
      : undefined,
  );
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const isFavorite = (location: MatchLocation) => {
    const key = locationFavoriteKey(location);
    const intent = pending.find(
      (input) => input && resourceKey(input.location) === resourceKey(location),
    );
    if (intent) return !intent.favorite;
    return Boolean(
      status.data?.includes(key) ||
        items.some((item) => item.key === key || locationFavoriteKey(item.location) === key),
    );
  };
  const isBusy = (location: MatchLocation) =>
    resourceBusy([...root, locationFavoriteKey(location)]);
  return { list, status, items, toggle, isFavorite, isBusy };
}
export type FavoriteLocationsState = ReturnType<typeof useFavoriteLocations>;
