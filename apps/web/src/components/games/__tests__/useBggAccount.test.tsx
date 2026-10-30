import { clearSessionQueryCache, useBggAccount } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("announces the request before HTTP without inventing a verified BGG identity and starts dependent sync only after the link receipt", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const feedback = { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
  const writes: Array<{ url: string; body?: string; resolve: (response: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) =>
          writes.push({ url, body: init?.body as string | undefined, resolve }),
        ),
    ),
  );
  const getToken = vi.fn().mockResolvedValueOnce("fresh-1").mockResolvedValue("fresh-2");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  client.setQueryData(["bgg-account", "https://api.test", "owner"], {
    active: null,
    pending: null,
  });
  const hook = renderHook(
    () =>
      useBggAccount({
        apiUrl: "https://api.test",
        userId: "owner",
        getToken,
        enabled: false,
        feedback,
      }),
    { wrapper },
  );
  act(() => hook.result.current.link.mutate({ username: "alice", synchronize: true }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].body).toBe(JSON.stringify({ username: "alice" }));
  expect(feedback.onOptimisticUpdate).toHaveBeenCalledOnce();
  expect(hook.result.current.account.data).toEqual({ active: null, pending: null });
  const identity = { id: 42, username: "alice", avatarUrl: null };
  await act(async () =>
    writes[0].resolve(
      Response.json({
        active: null,
        pending: { ...identity, status: "syncing", nextAttemptAt: null, error: null },
      }),
    ),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].url).toBe("https://api.test/api/bgg/account/sync");
  expect(writes[1].body).toBeUndefined();
  expect(hook.result.current.account.data?.pending?.username).toBe("alice");
  const active = { ...identity, snapshot: "snapshot", syncedAt: new Date().toISOString() };
  await act(async () => writes[1].resolve(Response.json({ active, pending: null })));
  await waitFor(() => expect(hook.result.current.account.data?.active).toEqual(active));
  expect(getToken).toHaveBeenCalledTimes(2);
  expect(feedback.onOptimisticUpdate).toHaveBeenCalledOnce();
  expect(feedback.onSuccess).not.toHaveBeenCalled();
  hook.unmount();
  clearSessionQueryCache(client);
});

it("keeps a rejected BGG identity unpublished and never launches its dependent synchronization", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const feedback = { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
  const fetcher = vi.fn(async () =>
    Response.json({ error: "BGG_USER_NOT_FOUND" }, { status: 404 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useBggAccount({
        apiUrl: "https://api.test",
        userId: "owner",
        getToken: async () => "fresh",
        enabled: false,
        feedback,
      }),
    { wrapper },
  );
  act(() => hook.result.current.link.mutate({ username: "missing-user", synchronize: true }));
  await waitFor(() =>
    expect(feedback.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "BGG user not found" }),
      "link_bgg",
    ),
  );
  expect(fetcher).toHaveBeenCalledOnce();
  expect(hook.result.current.account.data).toBeUndefined();
  expect(feedback.onSuccess).not.toHaveBeenCalled();
  hook.unmount();
  clearSessionQueryCache(client);
});
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
