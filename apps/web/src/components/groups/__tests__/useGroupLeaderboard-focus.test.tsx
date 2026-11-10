import { useGroupLeaderboard } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
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
    const hook = renderHook((p: typeof options) => useGroupLeaderboard(p), {
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
