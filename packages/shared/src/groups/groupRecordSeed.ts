import type { CommunityPageResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { optimisticBaseData } from "../common/optimisticOperation";

/** Existing details need no seeding; cold details stop at the first authorized ordinary list match. */
export function groupRecordSeed(client: QueryClient, root: QueryKey, id: string) {
  if (client.getQueryData([...root, "detail", id]) !== undefined) return undefined;
  const lists = client.getQueriesData<{ pages: CommunityPageResponse<GroupRecordResponse>[] }>({
    queryKey: root,
    predicate: (query) => query.queryKey[3] === "list" && query.queryKey[4] !== "moderation",
  });
  for (const [key, data] of lists) {
    const base = optimisticBaseData(client, key) as typeof data;
    for (const page of base?.pages ?? [])
      for (const row of page.items) if (row.id === id) return { row, key };
  }
  return undefined;
}
