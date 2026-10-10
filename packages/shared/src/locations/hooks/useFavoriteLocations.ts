import {
  type FavoriteLocation,
  type FavoriteLocationsResponse,
  locationFavoriteKey,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { withProtectionBypass } from "../../common/api";
import type { MutationFeedback } from "../../common/mutationFeedback";

export interface FavoriteLocationsOptions {
  apiUrl: string;
  userId: string | null | undefined;
  getToken: () => Promise<string | null>;
  protectionBypass?: string | null;
  feedback?: MutationFeedback;
}
export function useFavoriteLocations(
  options: FavoriteLocationsOptions,
  locations: MatchLocation[] = [],
) {
  const { apiUrl, userId, getToken, protectionBypass, feedback } = options;
  const client = useQueryClient();
  const root = ["favoriteLocations", apiUrl, userId] as const;
  const listKey = [...root, "list"] as const;
  const keys = [...new Set(locations.map(locationFavoriteKey))].sort();
  const statusKey = [...root, "status", keys] as const;
  const enabled = Boolean(apiUrl && userId);
  const request = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    if (!token) throw new Error("Unauthorized");
    const response = await fetch(
      withProtectionBypass(`${apiUrl}/api/locations/favorites${path}`, protectionBypass),
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam, signal }) =>
      request(`?limit=20${pageParam ? `&cursor=${pageParam}` : ""}`, {
        signal,
      }) as Promise<FavoriteLocationsResponse>,
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
    staleTime: 5 * 60_000,
  });
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
        body: JSON.stringify(
          favorite
            ? { key: locationFavoriteKey(location) }
            : { location, ...(matchId ? { matchId } : {}) },
        ),
      });
    },
    onMutate: async ({ location, favorite }) => {
      await client.cancelQueries({ queryKey: root });
      const snapshots = client.getQueriesData({ queryKey: root });
      const key = locationFavoriteKey(location);
      for (const [queryKey, data] of snapshots) {
        if (queryKey[3] === "status" && Array.isArray(data)) {
          client.setQueryData(
            queryKey,
            favorite ? data.filter((item) => item !== key) : [...new Set([...data, key])],
          );
        } else if (queryKey[3] === "list" && data) {
          const pages = data as InfiniteData<FavoriteLocationsResponse>;
          client.setQueryData(queryKey, {
            ...pages,
            pages: pages.pages.map((page, index) => ({
              ...page,
              items: favorite
                ? page.items.filter((item) => item.key !== key)
                : index === 0
                  ? [{ key, location }, ...page.items.filter((item) => item.key !== key)]
                  : page.items.filter((item) => item.key !== key),
            })),
          });
        }
      }
      feedback?.onOptimisticUpdate?.(
        favorite ? "remove_favorite_location" : "add_favorite_location",
      );
      return snapshots;
    },
    onError: (error: Error, variables, snapshots) => {
      for (const [key, data] of snapshots ?? []) client.setQueryData(key, data);
      feedback?.onError?.(
        error,
        variables.favorite ? "remove_favorite_location" : "add_favorite_location",
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: root }),
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const isFavorite = (location: MatchLocation) => {
    const key = locationFavoriteKey(location);
    return Boolean(status.data?.includes(key) || items.some((item) => item.key === key));
  };
  return { list, status, items, toggle, isFavorite };
}
export type FavoriteLocationsState = ReturnType<typeof useFavoriteLocations>;
