import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { groupsPageQuery } from "../../groups/hooks/useGroups";
import { matchesPageQuery } from "../../matches/hooks/useMatches";
import { notificationsPageQuery } from "../../notifications/hooks/useNotifications";

afterEach(() => vi.unstubAllGlobals());

it("prefetches first pages under screen query keys using fresh Clerk tokens", async () => {
  const fetchMock = vi.fn().mockImplementation(async (input: string, _init: RequestInit) => ({
    ok: true,
    json: async () =>
      input.includes("/notifications")
        ? { notifications: [], unreadCount: 0, nextCursor: null }
        : input.includes("/groups")
          ? { groups: [], nextCursor: null }
          : { matches: [], nextCursor: null },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient();
  const getToken = vi.fn().mockResolvedValue("fresh-jwt");
  const base = {
    apiUrl: "https://api.example.test",
    token: "old-jwt",
    userId: "user-1",
    getToken,
    listFilters: { query: "", roles: ["admin", "invited", "accepted"] as const, limit: 20 },
  };
  const matches = matchesPageQuery({
    ...base,
    listFilters: { ...base.listFilters, roles: [...base.listFilters.roles] },
  });
  const groups = groupsPageQuery({
    ...base,
    listFilters: { ...base.listFilters, roles: [...base.listFilters.roles] },
  });
  const notifications = notificationsPageQuery(
    { apiUrl: base.apiUrl, getToken, userId: "user-1", enabled: true },
    3,
  );

  await Promise.all([
    client.prefetchInfiniteQuery(matches),
    client.prefetchInfiniteQuery(groups),
    client.prefetchInfiniteQuery(notifications),
  ]);
  expect(matches.queryKey).toEqual([
    "matches",
    "paged",
    base.apiUrl,
    "user-1",
    "",
    "admin,invited,accepted",
  ]);
  expect(groups.queryKey).toEqual([
    "groups",
    "paged",
    base.apiUrl,
    "user-1",
    "",
    "admin,invited,accepted",
  ]);
  expect(notifications.queryKey).toEqual(["notifications", base.apiUrl, "user-1", 3]);
  expect(matchesPageQuery({ ...base, token: "rotated-jwt" }).queryKey).toEqual(matches.queryKey);
  expect(groupsPageQuery({ ...base, token: "rotated-jwt" }).queryKey).toEqual(groups.queryKey);
  expect(client.getQueryData(matches.queryKey)).toMatchObject({ pages: [{ matches: [] }] });
  expect(client.getQueryData(groups.queryKey)).toMatchObject({ pages: [{ groups: [] }] });
  expect(client.getQueryData(notifications.queryKey)).toMatchObject({
    pages: [{ notifications: [] }],
  });
  expect(getToken).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const [url, init] of fetchMock.mock.calls) {
    expect(url).toContain("https://api.example.test/api/");
    expect(init.headers.Authorization).toBe("Bearer fresh-jwt");
  }
});
