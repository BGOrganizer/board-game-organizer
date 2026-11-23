import { useLeaderboard } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const groupId = "11111111-1111-4111-8111-111111111111";
const options = {
  apiUrl: "https://api.test",
  userId: "owner",
  groupId,
  gameId: null,
  getToken: async () => "fresh-token",
  query: "",
  sort: "rating" as const,
  direction: "desc" as const,
};
afterEach(() => vi.unstubAllGlobals());
it.each([
  { apiUrl: "https://other.test" },
  { userId: "another-owner" },
  { groupId: "22222222-2222-4222-8222-222222222222" },
])(
  "retains search continuity only inside the same API/user/group, never across %j",
  async (change) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        new URL(url).searchParams.has("query")
          ? new Promise<Response>(() => {})
          : Response.json({
              games: [{ id: 1, name: "Cascadia", imageUrl: null }],
              players: [],
              nextCursor: 25,
            }),
      ),
    );
    const hook = renderHook((p: typeof options) => useLeaderboard(p), {
      initialProps: options,
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    try {
      await waitFor(() => expect(hook.result.current.games.data?.games).toHaveLength(1));
      hook.rerender({ ...options, query: "casc" });
      await waitFor(() => expect(hook.result.current.games.isPlaceholderData).toBe(true));
      expect(hook.result.current.games.isPending).toBe(false);
      expect(hook.result.current.games.data?.games[0].name).toBe("Cascadia");
      // Observer presentation is not duplicated into authoritative Query/MMKV data.
      expect(
        client.getQueryData([
          "groups",
          options.apiUrl,
          options.userId,
          "rankings",
          groupId,
          "games",
          "casc",
        ]),
      ).toBeUndefined();
      hook.rerender({ ...options, ...change, query: "casc" });
      await waitFor(() => expect(hook.result.current.games.isPlaceholderData).toBe(false));
      expect(hook.result.current.games.data).toBeUndefined();
      expect(hook.result.current.games.isPending).toBe(true);
    } finally {
      hook.unmount();
      client.clear();
    }
  },
);

it("progressively reveals retained leaderboard games without scanning or fetching later pages on reentry", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const getToken = vi.fn(async () => "fresh-token");
  const reads = Array.from({ length: 200 }, () => 0);
  const pages = reads.map((_, page) => ({
    get games() {
      reads[page]++;
      return Array.from({ length: 25 }, (_, index) => ({
        id: page * 25 + index + 1,
        name: `Game ${page}-${index}`,
        imageUrl: null,
      }));
    },
    players: [],
    nextCursor: null,
  }));
  const queryKey = ["groups", options.apiUrl, options.userId, "rankings", groupId, "games", ""];
  client.setQueryData(queryKey, { pages, pageParams: pages.map((_, page) => page * 25) });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const mount = () => renderHook(() => useLeaderboard({ ...options, getToken }), { wrapper });
  const first = mount();
  expect(first.result.current.games.data?.games).toHaveLength(25);
  expect(reads.slice(1).every((count) => count === 0)).toBe(true);
  const items = first.result.current.games.data?.games;
  first.rerender();
  expect(first.result.current.games.data?.games).toBe(items);
  await act(async () => {
    await first.result.current.games.fetchNextPage();
  });
  expect(first.result.current.games.data?.games).toHaveLength(50);
  expect(reads.slice(2).every((count) => count === 0)).toBe(true);
  first.unmount();
  const second = mount();
  expect(second.result.current.games.data?.games).toHaveLength(25);
  expect(getToken).not.toHaveBeenCalled();
  expect(client.getQueryData<{ pages: unknown[] }>(queryKey)?.pages).toHaveLength(200);
  second.unmount();
  client.clear();
});

it("keeps selected-game metadata outside the visible options and across closing a filtered search without crossing owners", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const getToken = vi.fn(async () => "fresh-token");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const normalKey = ["groups", options.apiUrl, options.userId, "rankings", groupId, "games", ""];
  const searchKey = [...normalKey.slice(0, -1), "needle"];
  const offPage = { id: 26, name: "Off-page game", imageUrl: null };
  const searchOnly = { id: 99, name: "Needle", imageUrl: null };
  const first = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    name: `Game ${index}`,
    imageUrl: null,
  }));
  client.setQueryData(normalKey, {
    pages: [
      { games: first, players: [], nextCursor: 25 },
      { games: [offPage], players: [], nextCursor: null },
    ],
    pageParams: [0, 25],
  });
  client.setQueryData(searchKey, {
    pages: [{ games: [searchOnly], players: [], nextCursor: null }],
    pageParams: [0],
  });
  for (const id of [26, 99]) {
    client.setQueryData(
      [
        "groups",
        options.apiUrl,
        options.userId,
        "rankings",
        groupId,
        "players",
        id,
        "rating",
        "desc",
      ],
      {
        pages: [{ games: [], players: [], nextCursor: null }],
        pageParams: [0],
      },
    );
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const hook = renderHook(
    (props: { userId: string; query: string; gameId: number | null }) =>
      useLeaderboard({ ...options, ...props, getToken }),
    {
      wrapper,
      initialProps: { userId: options.userId, query: "", gameId: 26 as number | null },
    },
  );
  expect(hook.result.current.games.data?.games).toHaveLength(25);
  expect(hook.result.current.games.data?.games.some((game) => game.id === 26)).toBe(false);
  expect(hook.result.current.games.selectedGame).toEqual(offPage);
  hook.rerender({ userId: options.userId, query: "needle", gameId: 99 });
  expect(hook.result.current.games.selectedGame).toEqual(searchOnly);
  hook.rerender({ userId: options.userId, query: "", gameId: 99 });
  expect(hook.result.current.games.data?.games).toHaveLength(25);
  expect(hook.result.current.games.selectedGame).toEqual(searchOnly);
  expect(getToken).not.toHaveBeenCalled();
  hook.rerender({ userId: "another-owner", query: "", gameId: 99 });
  expect(hook.result.current.games.selectedGame).toBeUndefined();
  expect(hook.result.current.games.data).toBeUndefined();
  hook.unmount();
  client.clear();
});
