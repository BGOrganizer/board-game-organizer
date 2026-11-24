import { globalLeaderboardKey, useLeaderboard } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const apiUrl = "https://rankings.test";
const owner = {
  apiUrl,
  userId: "owner",
  groupId: null,
  gameId: null,
  getToken: async () => "ranking-token",
};
const chess = { id: 1, name: "Chess", imageUrl: null };
const azul = { id: 2, name: "Azul", imageUrl: null };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
afterEach(() => vi.unstubAllGlobals());

it("keeps a selected global game from an older search without exposing that account during a scope change", async () => {
  const { client, wrapper } = setup();
  const root = [...globalLeaderboardKey(apiUrl, owner.userId), null, "games"];
  const page = (game: typeof chess) => ({
    pages: [{ games: [game], players: [], nextCursor: null }],
    pageParams: [0],
  });
  client.setQueryData([...root, "Chess"], page(chess));
  client.setQueryData([...root, "Azul"], page(azul));
  const requests = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer ranking-token");
    return Response.json({ games: [], players: [], nextCursor: null, path: url.pathname });
  });
  vi.stubGlobal("fetch", requests);
  const hook = renderHook(
    ({ userId, groupId }: { userId: string; groupId: string | null }) =>
      useLeaderboard({ ...owner, userId, groupId, gameId: chess.id, query: " Azul " }),
    { wrapper, initialProps: { userId: owner.userId, groupId: null as string | null } },
  );
  expect(hook.result.current.games.items).toEqual([azul]);
  expect(hook.result.current.games.selectedGame).toEqual(chess);
  await waitFor(() => expect(hook.result.current.players.isSuccess).toBe(true));

  hook.rerender({ userId: "other", groupId: "a/b" });
  expect(hook.result.current.games.data).toBeUndefined();
  expect(hook.result.current.games.selectedGame).toBeUndefined();
  await waitFor(() => expect(hook.result.current.games.items).toEqual([]));
  await waitFor(() => expect(requests).toHaveBeenCalledTimes(3));
  const urls = requests.mock.calls.map(([input]) => new URL(input));
  expect(urls[0].pathname).toBe("/api/community/leaderboard");
  expect(urls[0].searchParams.get("gameId")).toBe("1");
  const otherGroup = urls.slice(1);
  expect(otherGroup.every((url) => url.pathname === "/api/groups/a%2Fb/leaderboard")).toBe(true);
  const gameSearch = otherGroup.find((url) => url.searchParams.has("query"));
  expect(gameSearch?.searchParams.get("query")).toBe("Azul");
  hook.unmount();
  client.clear();
});

it("issues neither the collection nor the player request when the account or group route is incomplete", () => {
  const { client, wrapper } = setup();
  const requests = vi.fn();
  vi.stubGlobal("fetch", requests);
  const hook = renderHook(
    ({ userId, groupId }: { userId: string; groupId: string | null }) =>
      useLeaderboard({ ...owner, userId, groupId, gameId: chess.id, query: " A " }),
    { wrapper, initialProps: { userId: "", groupId: null as string | null } },
  );
  expect(hook.result.current.games.isEnabled).toBe(false);
  expect(hook.result.current.players.isEnabled).toBe(false);
  hook.rerender({ userId: owner.userId, groupId: "" });
  expect(hook.result.current.games.isEnabled).toBe(false);
  expect(hook.result.current.players.isEnabled).toBe(false);
  expect(requests).not.toHaveBeenCalled();
  hook.unmount();
  client.clear();
});

it("loads the initial catalog without a search and searches retained page metadata without expanding its presentation", async () => {
  const { client, wrapper } = setup();
  const root = [...globalLeaderboardKey(apiUrl, owner.userId), null, "games"];
  const requests: URL[] = [];
  client.getQueryCache().build(client, { queryKey: [...root, "Pending source"] });
  client.setQueryData([...root, "Retained options"], {
    pages: [
      { games: [azul], players: [], nextCursor: 25 },
      { games: [chess], players: [], nextCursor: null },
    ],
    pageParams: [0, 25],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ranking-token");
      requests.push(url);
      return Response.json({ games: [], players: [], nextCursor: null });
    }),
  );
  const view = renderHook(() => useLeaderboard({ ...owner, gameId: chess.id }), { wrapper });
  await waitFor(() =>
    expect(view.result.current.games.isSuccess && view.result.current.players.isSuccess).toBe(true),
  );
  expect(view.result.current.games.items).toEqual([]);
  expect(view.result.current.games.selectedGame).toEqual(chess);
  expect(requests).toHaveLength(2);
  expect(
    requests.every(
      (url) => !url.searchParams.has("query") && url.searchParams.get("cursor") === "0",
    ),
  ).toBe(true);
  view.unmount();
  client.clear();
});

it("rejects an explicit stale leaderboard refresh without even asking for credentials after sign-out", async () => {
  const { client, wrapper } = setup();
  const getToken = vi.fn(async () => "unused-token");
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const view = renderHook(
    () => useLeaderboard({ ...owner, userId: undefined, gameId: chess.id, getToken }),
    { wrapper },
  );
  expect(view.result.current.games.isEnabled).toBe(false);
  expect(view.result.current.players.isEnabled).toBe(false);
  const outcome = await act(async () => view.result.current.games.refetch());
  expect(outcome.error).toMatchObject({ status: 401 });
  expect(view.result.current.games.items).toEqual([]);
  expect(view.result.current.games.selectedGame).toBeUndefined();
  expect(getToken).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});
