import type { BggPickerResponse } from "@board-game-organizer/schemas";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiHeaders, withProtectionBypass } from "../api";

export function useBggPicker({
  apiUrl,
  getToken,
  userId,
  query,
  search,
  collection,
  snapshot,
  protectionBypass,
}: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  query: string;
  search: boolean;
  collection: boolean;
  snapshot?: string | null;
  protectionBypass?: string | null;
}) {
  const trimmed = query.trim();
  return useInfiniteQuery({
    queryKey: ["bgg-picker", apiUrl, userId, trimmed, search, collection, snapshot],
    enabled:
      Boolean(userId) && ((search && trimmed.length >= 4) || (collection && Boolean(snapshot))),
    initialPageParam: "",
    queryFn: async ({ pageParam }): Promise<BggPickerResponse> => {
      const token = await getToken();
      if (!token) throw new Error("No session token");
      const params = new URLSearchParams({
        query: trimmed,
        search: search ? "1" : "0",
        collection: collection ? "1" : "0",
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      const response = await fetch(
        withProtectionBypass(`${apiUrl}/api/bgg/picker?${params}`, protectionBypass),
        { headers: apiHeaders(token) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as BggPickerResponse;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
