import type { ProfileView } from "@board-game-organizer/schemas";
import {
  bggCollectionQuery,
  communityActivitiesQuery,
  optimisticProfileSocialData,
  profileActivitiesQuery,
  profileViewKeys,
  profileViewQuery,
  useBggCollection,
  useCommunityActivities,
  useProfileActivities,
  useProfileRating,
  useProfileRatingGames,
  useProfileView,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";

const data: ProfileView = {
  id: "owner",
  name: "Owner",
  username: "owner",
  avatarUrl: null,
  social: { friends: 1, followers: 2, following: 3 },
  player: { gamesPlayed: 2, gamesWon: 1, winRate: 50 },
};
const setup = () => {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    getToken = vi.fn(async () => "fresh"),
    options = { apiUrl: "https://api.test", userId: "owner", getToken },
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  return { client, options, wrapper };
};
afterEach(() => vi.unstubAllGlobals());
it("quarantines a denied subject collection/Profile and fences late reads without affecting other subjects/APIs", async () => {
  const { client, options, wrapper } = setup();
  const payload = {
    snapshot: "snap",
    counts: null,
    items: [
      {
        id: 1,
        name: "Private subject game",
        year: 2020,
        imageUrl: null,
        source: "collection" as const,
        userRating: 8,
        wishlist: false,
        isExpansion: false,
      },
    ],
    nextCursor: null,
  };
  const target = bggCollectionQuery({
    ...options,
    subjectId: "subject",
    snapshot: "snap",
    query: "",
  }).queryKey;
  const other = bggCollectionQuery({
    ...options,
    subjectId: "other",
    snapshot: "snap",
    query: "",
  }).queryKey;
  const foreign = bggCollectionQuery({
    ...options,
    apiUrl: "foreign",
    subjectId: "subject",
    snapshot: "snap",
    query: "",
  }).queryKey;
  for (const key of [target, other, foreign])
    client.setQueryData(key, { pages: [payload], pageParams: [""] });
  client.setQueryData(profileViewKeys.view(options, "subject"), { ...data, id: "subject" });
  let finish: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.includes("query=late")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(Response.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 })),
    ),
  );
  const lateQuery = bggCollectionQuery({
    ...options,
    subjectId: "subject",
    snapshot: "snap",
    query: "late",
  });
  const late = client.fetchInfiniteQuery(lateQuery).catch(() => null);
  await waitFor(() => expect(options.getToken).toHaveBeenCalled());
  await client.invalidateQueries({ queryKey: target, exact: true, refetchType: "none" });
  const hook = renderHook(
    () => useBggCollection({ ...options, subjectId: "subject", snapshot: "snap", query: "" }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.error).toBeTruthy());
  await waitFor(() => expect(client.getQueryData(target)).toBeNull());
  expect(client.getQueryData(profileViewKeys.view(options, "subject"))).toBeNull();
  expect(client.getQueryData(other)).toEqual({ pages: [payload], pageParams: [""] });
  expect(client.getQueryData(foreign)).toEqual({ pages: [payload], pageParams: [""] });
  finish(Response.json(payload));
  await late;
  expect(client.getQueryData(lateQuery.queryKey)).toBeNull();
  hook.unmount();
  client.clear();
});
it("removes only obsolete subject snapshot pages after verified profile metadata changes", async () => {
  const { client, options, wrapper } = setup(),
    key = (subject: string, snapshot: string) =>
      bggCollectionQuery({ ...options, subjectId: subject, snapshot, query: "" }).queryKey;
  const old = key("subject", "old"),
    current = key("subject", "current"),
    other = key("other", "old");
  for (const k of [old, current, other]) client.setQueryData(k, { pages: [], pageParams: [] });
  client.setQueryData(profileViewKeys.view(options, "subject"), {
    ...data,
    id: "subject",
    collection: { snapshot: "current" },
  });
  const h = renderHook(() => useProfileView(options, "subject"), { wrapper });
  await waitFor(() => expect(client.getQueryState(old)).toBeUndefined());
  expect(client.getQueryState(current)).toBeDefined();
  expect(client.getQueryState(other)).toBeDefined();
  h.unmount();
  client.clear();
});
it("keys profiles by API/viewer/subject, not rotating tokens, and resolves a new token for each request", async () => {
  const { client, options } = setup(),
    fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(data));
  vi.stubGlobal("fetch", fetch);
  options.getToken.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
  const query = profileViewQuery(options, "subject");
  await client.fetchQuery({ ...query, staleTime: 0 });
  await client.fetchQuery({ ...query, staleTime: 0 });
  expect(query.queryKey).toEqual(["profile", "https://api.test", "owner", "view", "subject"]);
  expect(profileViewKeys.view({ ...options, userId: "other" }, "subject")).not.toEqual(
    query.queryKey,
  );
  expect(options.getToken).toHaveBeenCalledTimes(2);
  expect(
    fetch.mock.calls.map((call) => new Headers(call[1]?.headers).get("Authorization")),
  ).toEqual(["Bearer first", "Bearer second"]);
});
it("keys and source-filters Community activity types without reusing another kind's page or token", async () => {
  const { client, options } = setup();
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ items: [], nextCursor: null }),
  );
  vi.stubGlobal("fetch", fetch);
  options.getToken.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
  const played = communityActivitiesQuery(options, "all", "played"),
    friends = communityActivitiesQuery(options, "all", "friendship");
  expect(played.queryKey).not.toEqual(friends.queryKey);
  expect(played.queryKey.at(-1)).toBe("public-v1");
  await client.fetchInfiniteQuery(played);
  await client.fetchInfiniteQuery(friends);
  expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("kind"))).toEqual([
    "played",
    "friendship",
  ]);
  expect(
    fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("Authorization")),
  ).toEqual(["Bearer first", "Bearer second"]);
  expect(
    fetch.mock.calls.every(([url]) => new URL(url).searchParams.get("network") === "all"),
  ).toBe(true);
});
it("reuses complete owner snapshots but immediately revalidates a known stale root without concealing cached content", async () => {
  const { client, options, wrapper } = setup(),
    fetch = vi.fn(async () => Response.json(data));
  vi.stubGlobal("fetch", fetch);
  client.setQueryData(profileViewKeys.root(options), data);
  const first = renderHook(() => useProfileView(options, "owner"), { wrapper });
  expect(first.result.current.data).toEqual(data);
  expect(fetch).not.toHaveBeenCalled();
  first.unmount();
  client.removeQueries({ queryKey: profileViewKeys.view(options, "owner"), exact: true });
  await client.invalidateQueries({ queryKey: profileViewKeys.root(options), refetchType: "none" });
  const second = renderHook(() => useProfileView(options, "owner"), { wrapper });
  expect(second.result.current.data).toEqual(data);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
});
it("never seeds another subject, anonymous sessions or incomplete legacy snapshots as an authorized detail", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(profileViewKeys.root(options), data);
  const hook = renderHook(() => useProfileView({ ...options, enabled: false }, "other"), {
    wrapper,
  });
  expect(hook.result.current.data).toBeUndefined();
  hook.unmount();
  client.setQueryData(profileViewKeys.root(options), { id: "owner", stats: {} });
  const old = renderHook(() => useProfileView({ ...options, enabled: false }, "owner"), {
    wrapper,
  });
  expect(old.result.current.data).toBeUndefined();
});
it("source-pages activity types/cursors at five or ten using current credentials", async () => {
  const { options, wrapper } = setup(),
    cursor = "2030-06-03T12:00:00.000Z|11111111-1111-4111-8111-111111111111";
  let reads = 0;
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ items: [], nextCursor: ++reads === 1 ? cursor : null }),
  );
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => useProfileActivities(options, "subject", "played", 10), {
    wrapper,
  });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  await act(async () => {
    await hook.result.current.fetchNextPage();
  });
  expect(fetch.mock.calls).toHaveLength(2);
  const url = new URL(fetch.mock.calls[1][0]);
  expect(url.searchParams.get("cursor")).toBe(cursor);
  expect(url.searchParams.get("kind")).toBe("played");
  expect(url.searchParams.get("limit")).toBe("10");
  await waitFor(() => expect(hook.result.current.hasNextPage).toBe(false));
  expect(profileActivitiesQuery(options, "subject", undefined, 5).queryKey).toEqual([
    "profile",
    options.apiUrl,
    "owner",
    "activities",
    "subject",
    null,
    5,
    "public-v1",
  ]);
});
it("source-pages the network with owner/filter/policy keys, fresh tokens and cancellation", async () => {
  const { client, options, wrapper } = setup(),
    cursor = "2030-01-01T00:00:00.000Z|11111111-1111-4111-8111-111111111111";
  const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
    Response.json({ items: [], nextCursor: url.includes("cursor=") ? null : cursor }),
  );
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(
    () => {
      const q = useCommunityActivities(options, "friends");
      return {
        data: q.data,
        hasNextPage: q.hasNextPage,
        isSuccess: q.isSuccess,
        fetchNextPage: q.fetchNextPage,
      };
    },
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  await act(async () => {
    await hook.result.current.fetchNextPage();
  });
  expect(options.getToken).toHaveBeenCalledTimes(2);
  expect(new URL(fetch.mock.calls[1][0]).searchParams.get("cursor")).toBe(cursor);
  expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/community/activities");
  expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  expect(communityActivitiesQuery(options, "following").queryKey).not.toEqual(
    communityActivitiesQuery(options, "friends").queryKey,
  );
  await waitFor(() => expect(hook.result.current.hasNextPage).toBe(false));
  hook.unmount();
  const disabled = renderHook(() => useCommunityActivities({ ...options, enabled: false }, "all"), {
    wrapper,
  });
  expect(disabled.result.current.isFetching).toBe(false);
  disabled.unmount();
  client.clear();
});
it("fails closed against old API activity permissions instead of caching formerly private rows", async () => {
  const { client, options } = setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        items: [
          {
            id: "old",
            kind: "group_join",
            context: "NEVER PRIVATE",
            groupId: "private",
            href: "/groups/private",
          },
        ],
        nextCursor: null,
      }),
    ),
  );
  const query = profileActivitiesQuery(options, "subject", undefined, 5);
  await expect(client.fetchInfiniteQuery(query)).rejects.toMatchObject({
    status: 502,
    code: "ACTIVITY_VISIBILITY_UNVERIFIED",
  });
  expect(client.getQueryData(query.queryKey)).toBeUndefined();
  client.clear();
});
it("keeps game and history pages distinct, propagates cursor zero safely and never sends scope or time filters", async () => {
  const { options, wrapper } = setup(),
    fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      Response.json(
        url.includes("/games?")
          ? { items: [], nextCursor: url.includes("cursor=0") ? 20 : null }
          : { points: [], nextCursor: url.includes("cursor=101") ? null : 101 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const games = renderHook(() => useProfileRatingGames(options, "subject", "[Chess]"), { wrapper });
  await waitFor(() => expect(games.result.current.isSuccess).toBe(true));
  await act(async () => {
    await games.result.current.fetchNextPage();
  });
  expect(
    fetch.mock.calls.some(
      ([url]) => new URL(url).searchParams.get("query") === "[Chess]" && url.includes("cursor=20"),
    ),
  ).toBe(true);
  const history = renderHook(() => useProfileRating(options, "subject", 7), { wrapper });
  await waitFor(() => expect(history.result.current.isSuccess).toBe(true));
  await act(async () => {
    await history.result.current.fetchNextPage();
  });
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/games/7?cursor=101"))).toBe(true);
  expect(fetch.mock.calls.every(([url]) => !url.includes("scope=") && !url.includes("date="))).toBe(
    true,
  );
});
it("applies blocking to actual cached queries immediately, preserves unrelated profile rows and restores only the failed intent", async () => {
  const { client, options } = setup(),
    key = profileViewKeys.view(options, "target"),
    self = profileViewKeys.view(options, "owner");
  client.setQueryData(key, { ...data, id: "target" });
  client.setQueryData(self, data);
  const networkKey = communityActivitiesQuery(options, "all").queryKey,
    foreignKey = communityActivitiesQuery({ ...options, userId: "other" }, "all").queryKey;
  const network = {
    pages: [
      {
        items: ["target", "safe"].map((id) => ({
          id,
          kind: "friendship" as const,
          occurredAt: "2030-01-01T00:00:00.000Z",
          context: "Peer",
          href: "/profiles/peer",
          visibility: "authorized" as const,
          author: { id, name: id, username: null, avatarUrl: null },
        })),
        nextCursor: null,
      },
    ],
    pageParams: [""],
  };
  client.setQueryData(networkKey, network);
  client.setQueryData(foreignKey, network);
  const target = {
    id: "target",
    name: "Target",
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "" },
    isFollowing: true,
    isFollower: false,
    isFriend: false,
  };
  const operation = await beginOptimisticOperation(
    client,
    ["contacts", options.apiUrl, "owner", "target"],
    { queryKey: profileViewKeys.root(options) },
    (current, query) =>
      optimisticProfileSocialData(
        query,
        current,
        "block",
        { targetUserId: "target", targetUser: target },
        "owner",
      ),
  );
  expect(client.getQueryData(key)).toBeNull();
  expect(client.getQueryData<ProfileView>(self)?.social.following).toBe(2);
  expect(client.getQueryData<typeof network>(networkKey)?.pages[0].items.map((i) => i.id)).toEqual([
    "safe",
  ]);
  expect(client.getQueryData(foreignKey)).toEqual(network);
  operation.rollback();
  expect(client.getQueryData(key)).toEqual({ ...data, id: "target" });
  expect(client.getQueryData(self)).toEqual(data);
  expect(client.getQueryData(networkKey)).toEqual(network);
});
