import { infiniteQueryOptions, type QueryClient } from "@tanstack/react-query";
import type { CommunityApiOptions } from "../community/communityApi";
import {
  fetchRelationshipPageWithToken,
  fetchSuggestionPageWithToken,
} from "../contacts/hooks/useContacts";
import {
  eventRecordQuery,
  eventRecordsQuery,
  recordTablesQuery,
} from "../events/hooks/useEventRecords";
import { bggAccountQuery } from "../games/hooks/useBggAccount";
import { bggPickerQuery } from "../games/hooks/useBggPicker";
import { groupPeopleQuery, groupRecordsPageQuery } from "../groups/hooks/useGroupRecords";
import { favoriteLocationsQuery } from "../locations/hooks/useFavoriteLocations";
import { notificationsPageQuery } from "../notifications/hooks/useNotifications";
import { profileQueryOptions } from "../profile/hooks/useProfile";

export const startupRelationshipTypes = [
  "friends",
  "pending",
  "following",
  "followers",
  "sent",
  "blocked",
] as const;
type Read = () => Promise<unknown>;
type StartupOptions = CommunityApiOptions & { locale: "en" | "it" };

async function runReads(reads: Read[], concurrency: number, isCurrent: () => boolean) {
  let next = 0;
  const worker = async () => {
    while (isCurrent() && next < reads.length) await reads[next++]();
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/** Only these four datasets participate in the ordinary mobile splash gate. */
export function warmStartupPriority(
  client: QueryClient,
  options: CommunityApiOptions,
  isCurrent: () => boolean,
) {
  return runReads(
    [
      () => client.prefetchInfiniteQuery(recordTablesQuery(options, null)),
      () => client.prefetchInfiniteQuery(groupRecordsPageQuery(options)),
      () => client.prefetchInfiniteQuery(eventRecordsQuery(options)),
      () => client.prefetchQuery(profileQueryOptions(options)),
    ],
    3,
    isCurrent,
  );
}

/** One background read at a time, first pages only; no searches, provider syncs or mutations. */
export async function warmStartupBackground(
  client: QueryClient,
  options: StartupOptions,
  isCurrent: () => boolean,
) {
  const { apiUrl, userId, getToken, protectionBypass } = options;
  await runReads(
    [
      () => client.prefetchInfiniteQuery(favoriteLocationsQuery(options)),
      () => client.prefetchQuery(bggAccountQuery(options)),
      () => client.prefetchInfiniteQuery(notificationsPageQuery({ ...options, enabled: true }, 3)),
      () => client.prefetchInfiniteQuery(notificationsPageQuery({ ...options, enabled: true }, 20)),
      ...startupRelationshipTypes.map(
        (type) => () =>
          client.prefetchInfiniteQuery(
            infiniteQueryOptions({
              queryKey: ["contacts", type, apiUrl, userId],
              queryFn: ({ pageParam, signal }) =>
                fetchRelationshipPageWithToken(
                  apiUrl,
                  null,
                  getToken,
                  type,
                  pageParam,
                  protectionBypass,
                  signal,
                ),
              initialPageParam: "",
              getNextPageParam: (page) => page.nextCursor ?? undefined,
              staleTime: 5 * 60_000,
            }),
          ),
      ),
      () =>
        client.prefetchInfiniteQuery(
          infiniteQueryOptions({
            queryKey: ["contacts", "suggestions", apiUrl, userId],
            queryFn: ({ pageParam, signal }) =>
              fetchSuggestionPageWithToken(
                apiUrl,
                null,
                getToken,
                pageParam,
                protectionBypass,
                signal,
              ),
            initialPageParam: "",
            getNextPageParam: (page) => page.nextCursor ?? undefined,
            staleTime: 5 * 60_000,
          }),
        ),
    ],
    1,
    isCurrent,
  );
  if (!isCurrent()) return;

  const reads: Read[] = [];
  const snapshot = client.getQueryData(bggAccountQuery(options).queryKey)?.active?.snapshot;
  if (snapshot) {
    for (const search of [true, false])
      reads.push(() =>
        client.prefetchInfiniteQuery(
          bggPickerQuery({
            ...options,
            query: "",
            search,
            collection: true,
            snapshot,
          }),
        ),
      );
  }
  const tables = client.getQueryData(recordTablesQuery(options, null).queryKey);
  const events = client.getQueryData(eventRecordsQuery(options).queryKey);
  const eventIds = [
    ...new Set([
      ...(tables?.pages[0]?.items.map((row) => row.eventId) ?? []),
      ...(events?.pages[0]?.items.map((row) => row.id) ?? []),
    ]),
  ].slice(0, 2);
  for (const id of eventIds) {
    reads.push(() => client.prefetchQuery(eventRecordQuery(options, id)));
    reads.push(() => client.prefetchInfiniteQuery(recordTablesQuery(options, id)));
  }
  const groups =
    client.getQueryData(groupRecordsPageQuery(options).queryKey)?.pages[0]?.items ?? [];
  for (const group of groups.slice(0, 2)) {
    if (group.canViewMembers)
      reads.push(() => client.prefetchInfiniteQuery(groupPeopleQuery(options, group.id)));
    if (group.canViewEvents)
      reads.push(() =>
        client.prefetchInfiniteQuery(eventRecordsQuery(options, { groupId: group.id })),
      );
  }
  await runReads(reads, 1, isCurrent);
}
