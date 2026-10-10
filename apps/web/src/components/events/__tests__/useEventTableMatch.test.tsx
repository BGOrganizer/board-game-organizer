import { CommunityApiError, matchDetailQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useEventTableMatch } from "../../../../../../packages/shared/src/events/hooks/useEventTableMatch";

const options = {
  apiUrl: "https://api.test",
  userId: "former-member",
  getToken: vi.fn(async () => "fresh"),
  protectionBypass: "test-bypass",
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("authorizes frozen former participants through the match API, with fresh token, scoped cache and cancellation", async () => {
  const { client, wrapper } = setup();
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ match: { id: "match" }, invitedPlayers: [{ id: "former-member" }] }),
  }));
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => useEventTableMatch(options, "match"), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.match.id).toBe("match"));
  expect(fetch).toHaveBeenCalledWith(
    "https://api.test/api/matches/match?x-vercel-protection-bypass=test-bypass",
    expect.objectContaining({
      headers: { Authorization: "Bearer fresh" },
      signal: expect.any(AbortSignal),
    }),
  );
  expect(
    client.getQueryData(["matches", "detail", "match", "https://api.test", "former-member"]),
  ).toBe(hook.result.current.data);
  options.getToken.mockResolvedValueOnce("rotated");
  await act(async () => {
    await hook.result.current.refetch();
  });
  expect(fetch).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ headers: { Authorization: "Bearer rotated" } }),
  );
});
it.each([403, 404])(
  "does not expose cached private results when optional match access is denied %s",
  async (status) => {
    const { client, wrapper } = setup();
    client.setQueryData(["matches", "detail", "match", options.apiUrl, options.userId], {
      match: { id: "private" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status })),
    );
    const hook = renderHook(() => useEventTableMatch(options, "match"), { wrapper });
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.error).toBeNull();
  },
);
it.each([401, 500])(
  "preserves an observable failure for HTTP %s rather than treating it as empty success",
  async (status) => {
    const { wrapper } = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status })),
    );
    const hook = renderHook(() => useEventTableMatch(options, "match"), { wrapper });
    await waitFor(() => expect(hook.result.current.error).toBeInstanceOf(CommunityApiError));
    expect(hook.result.current.data).toBeUndefined();
  },
);
it("keeps ordinary network errors observable and prevents queries without identity, URL, ID or permission", async () => {
  const fetch = vi.fn(async () => {
    throw new Error("network");
  });
  vi.stubGlobal("fetch", fetch);
  const { wrapper } = setup();
  const hook = renderHook(() => useEventTableMatch(options, "match"), { wrapper });
  await waitFor(() => expect(hook.result.current.error?.message).toBe("network"));
  hook.unmount();
  fetch.mockClear();
  for (const extra of [{ enabled: false }, { userId: null }, { apiUrl: "" }]) {
    const disabled = renderHook(() => useEventTableMatch({ ...options, ...extra }, "match"), {
      wrapper: setup().wrapper,
    });
    disabled.unmount();
  }
  const noId = renderHook(() => useEventTableMatch(options), { wrapper: setup().wrapper });
  noId.unmount();
  expect(fetch).not.toHaveBeenCalled();
});
it("retains the factory's direct-call compatibility while adding AbortSignal to real observers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ match: { id: "match" } }) })),
  );
  await matchDetailQuery({ ...options, matchId: "match", token: null }).queryFn();
  expect(fetch).toHaveBeenCalledWith(expect.any(String), {
    headers: { Authorization: "Bearer fresh" },
  });
});
