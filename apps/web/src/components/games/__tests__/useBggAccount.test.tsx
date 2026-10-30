import { clearSessionQueryCache, useBggAccount } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("does not send an old account action after token resolution crosses a session/API change", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let releaseToken!: (token: string) => void;
  const oldToken = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        releaseToken = resolve;
      }),
  );
  let releaseWrite!: (response: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        releaseWrite = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ userId, apiUrl, getToken }) => useBggAccount({ userId, apiUrl, getToken, enabled: false }),
    {
      wrapper,
      initialProps: {
        userId: "old-owner",
        apiUrl: "https://old.test",
        getToken: oldToken as () => Promise<string>,
      },
    },
  );
  let previous!: Promise<unknown>;
  act(() => {
    previous = hook.result.current.link.mutateAsync("old-account").catch(() => undefined);
  });
  await waitFor(() => expect(releaseToken).toBeDefined());
  act(() => {
    clearSessionQueryCache(client);
  });
  hook.rerender({
    userId: "new-owner",
    apiUrl: "https://new.test",
    getToken: async () => "new-token",
  });
  let current!: Promise<unknown>;
  act(() => {
    current = hook.result.current.link.mutateAsync("new-account");
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await act(async () => {
    releaseToken("new-token");
    await previous;
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    "https://new.test/api/bgg/account",
    expect.objectContaining({ body: JSON.stringify({ username: "new-account" }) }),
  );
  await act(async () => {
    releaseWrite(Response.json({ active: null, pending: null }));
    await current;
  });
  expect(client.getQueryData(["bgg-account", "https://old.test", "old-owner"])).toBeUndefined();
  expect(hook.result.current.busy).toBe(false);
});

it("reads BGG account with fresh tokens and verifies a lost unlink response before restoring it", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const active = {
    id: 42,
    username: "alice",
    avatarUrl: null,
    snapshot: "snap",
    syncedAt: "2026-09-01T00:00:00.000Z",
  };
  let rejectDelete: ((error: Error) => void) | undefined;
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === "DELETE"
      ? new Promise<Response>((_resolve, reject) => {
          rejectDelete = reject;
        })
      : Promise.resolve(new Response(JSON.stringify({ active, pending: null }), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const getToken = vi.fn().mockResolvedValueOnce("fresh-1").mockResolvedValue("fresh-2");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useBggAccount({ apiUrl: "https://api.example.com", userId: "owner", getToken }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.account.data?.active?.username).toBe("alice"));
  act(() => result.current.unlink.mutate());
  await waitFor(() => expect(result.current.account.data?.active).toBeNull());
  await waitFor(() => expect(rejectDelete).toBeDefined());
  await act(async () => rejectDelete?.(new Error("network")));
  await waitFor(() => expect(result.current.account.data?.active?.username).toBe("alice"));
  expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers)).toEqual([
    expect.objectContaining({ Authorization: "Bearer fresh-1" }),
    expect.objectContaining({ Authorization: "Bearer fresh-2" }),
    expect.objectContaining({ Authorization: "Bearer fresh-2" }),
  ]);
  expect(fetchMock.mock.calls[2][1]?.method).toBe("GET");
});
