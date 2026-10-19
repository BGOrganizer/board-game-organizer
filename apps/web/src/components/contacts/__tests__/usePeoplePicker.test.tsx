import { usePeoplePicker } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = {
    apiUrl: "https://api.test",
    userId: "viewer",
    getToken: vi.fn(async () => "fresh"),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { options, client, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
it("waits for four characters for general users, while friends initially source-page existing relationships", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("users/search")
            ? { users: [{ id: "searched" }], nextCursor: null }
            : { rows: [{ profile: { id: "friend" } }, { profile: null }], nextCursor: null },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const general = renderHook(({ query }) => usePeoplePicker(options, query, false), {
    wrapper,
    initialProps: { query: "abc" },
  });
  expect(general.result.current.needsSearch).toBe(true);
  expect(general.result.current.isPending).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  const friends = renderHook(() => usePeoplePicker(options, "", true), { wrapper });
  await waitFor(() => expect(friends.result.current.items).toEqual([{ id: "friend" }]));
  general.rerender({ query: "board" });
  await waitFor(() => expect(general.result.current.items).toEqual([{ id: "searched" }]));
  expect(new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("friendsOnly")).toBe("false");
});
it("keeps friend search paginated at source and resolves a fresh token for every page", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify({
          users: [{ id: new URL(url).searchParams.has("cursor") ? "second" : "first" }],
          nextCursor: new URL(url).searchParams.has("cursor") ? null : "first",
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => usePeoplePicker(options, "board", true), { wrapper });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  await act(async () => {
    await hook.result.current.fetchNextPage();
  });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(2));
  expect(options.getToken).toHaveBeenCalledTimes(2);
  for (const [url] of fetch.mock.calls)
    expect(new URL(url).searchParams.get("friendsOnly")).toBe("true");
  expect(fetch.mock.calls.some(([url]) => url.includes("relationships"))).toBe(false);
});
it("retains observable failures, supports retry, and never requests disabled/private unauthenticated data", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(async () => new Response('{"error":"FAILED"}', { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  renderHook(() => usePeoplePicker({ ...options, enabled: false }, "board", true), { wrapper });
  renderHook(() => usePeoplePicker({ ...options, userId: null }, "board", false), { wrapper });
  expect(fetch).not.toHaveBeenCalled();
  const hook = renderHook(() => usePeoplePicker(options, "board", false), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.error?.message).toBe("FAILED");
  fetch.mockResolvedValue(new Response('{"users":[],"nextCursor":null}'));
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(false));
});
