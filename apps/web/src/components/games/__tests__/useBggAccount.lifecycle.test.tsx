import type { BggAccountResponse } from "@board-game-organizer/schemas";
import {
  bggAccountQuery,
  clearSessionQueryCache,
  profileViewKeys,
  useBggAccount,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const API = "https://bgg-lifecycle.test";
const identity = { id: 42, username: "braveheart85", avatarUrl: null };
const linked: BggAccountResponse = {
  active: { ...identity, snapshot: "snapshot", syncedAt: "2030-06-01T10:00:00.000Z" },
  pending: null,
};
const clients: QueryClient[] = [];
const token = async () => "fresh-session";
function setup({
  data = linked,
  enabled = false,
  getToken = token,
  seed = (_client: QueryClient) => {},
}: {
  data?: BggAccountResponse;
  enabled?: boolean;
  getToken?: () => Promise<string | null>;
  seed?: (client: QueryClient) => void;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn(), onSuccess: vi.fn() };
  const options = {
    apiUrl: API,
    userId: "owner",
    getToken,
    protectionBypass: "fixture-bypass",
    enabled,
    feedback,
  };
  const key = bggAccountQuery(options).queryKey;
  client.setQueryData(key, data);
  seed(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const h = renderHook(({ userId }) => useBggAccount({ ...options, userId }), {
    wrapper,
    initialProps: { userId: "owner" },
  });
  return { client, feedback, key, h, options };
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(clearSessionQueryCache);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false] as const)(
  "explicit sync retry=%s publishes only the server receipt and invalidates the owned profile/collection sources",
  async (retry) => {
    const picker = ["bgg-picker", API, "owner", "", false, true, "snapshot"];
    const collection = ["bgg-collection", API, "owner", "snapshot", ""];
    const other = ["bgg-collection", API, "other", "snapshot", ""];
    const profile = profileViewKeys.view(
      { apiUrl: API, userId: "owner", getToken: async () => "fixture-token" },
      "owner",
    );
    const f = setup({
      seed(client) {
        for (const key of [picker, collection, other, profile])
          client.setQueryData(key, { marker: "owned cache" });
      },
    });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(new URL(url).searchParams.get("x-vercel-protection-bypass")).toBe("fixture-bypass");
      expect(new URL(url).searchParams.get("retry")).toBe(retry ? "true" : null);
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-session");
      return Response.json(linked);
    });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => {
      await f.h.result.current.sync.mutateAsync(retry);
    });
    await waitFor(() => expect(f.h.result.current.sync.isSuccess).toBe(true));
    expect(f.h.result.current.account.data).toEqual(linked);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(f.feedback.onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith("sync_bgg");
    expect(f.feedback.onError).not.toHaveBeenCalled();
    for (const key of [picker, collection, profile])
      expect(f.client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(f.client.getQueryState(other)?.isInvalidated).toBe(false);
    act(() => f.h.result.current.reset());
    await waitFor(() => expect(f.h.result.current.sync.isIdle).toBe(true));
    expect(f.h.result.current.link.isIdle).toBe(true);
    expect(f.h.result.current.unlink.isIdle).toBe(true);
  },
);

it.each(["pending", "lastAttempt"] as const)(
  "announces an explicit sync failure encoded in %s without publishing an invented active account",
  async (field) => {
    const failed: BggAccountResponse =
      field === "pending"
        ? {
            active: null,
            pending: {
              ...identity,
              status: "failed",
              nextAttemptAt: null,
              error: "BGG unavailable",
            },
          }
        : {
            active: null,
            pending: null,
            lastAttempt: { status: "error", at: "2030-06-01T10:00:00.000Z" },
          };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(failed)),
    );
    const f = setup();
    await act(async () => {
      await f.h.result.current.sync.mutateAsync(false);
    });
    await waitFor(() => expect(f.h.result.current.account.data).toEqual(failed));
    expect(f.feedback.onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "BGG_SYNC_FAILED" }),
      "sync_bgg",
    );
    expect(f.h.result.current.busy).toBe(false);
  },
);

it.each([false, { retry: true, silent: true }] as const)(
  "rolls back a refused sync and only emits error feedback for explicit action %j",
  async (input) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "CONFLICT" }, { status: 409 })),
    );
    const f = setup();
    await act(async () => {
      await expect(f.h.result.current.sync.mutateAsync(input)).rejects.toMatchObject({
        status: 409,
      });
    });
    await waitFor(() => expect(f.h.result.current.sync.isError).toBe(true));
    expect(f.h.result.current.account.data).toEqual(linked);
    expect(f.h.result.current.busy).toBe(false);
    if (typeof input === "boolean") {
      expect(f.feedback.onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith("sync_bgg");
      expect(f.feedback.onError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 409 }),
        "sync_bgg",
      );
    } else {
      expect(f.feedback.onOptimisticUpdate).not.toHaveBeenCalled();
      expect(f.feedback.onError).not.toHaveBeenCalled();
    }
  },
);

it("rejects a missing session token before the HTTP port and restores the owned account", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const f = setup({ getToken: async () => null });
  await act(async () => {
    await expect(f.h.result.current.sync.mutateAsync(false)).rejects.toMatchObject({
      status: 401,
      code: "No session token",
    });
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(f.client.getQueryData(f.key)).toBeUndefined();
  expect(f.feedback.onError).toHaveBeenCalledWith(
    expect.objectContaining({ status: 401 }),
    "sync_bgg",
  );
});

it.each(["success", "failure"] as const)(
  "a verified unlink %s removes only its owned collection scopes or restores their rollback data",
  async (outcome) => {
    const owned = ["bgg-collection", API, "owner", "snapshot", ""];
    const common = [
      "bgg-collection",
      API,
      "owner",
      "other-snapshot",
      "",
      "subject",
      "all",
      false,
      "snapshot",
    ];
    const subject = [
      "bgg-collection",
      API,
      "owner",
      "subject-snapshot",
      "",
      "subject",
      "all",
      false,
      undefined,
    ];
    const picker = ["bgg-picker", API, "owner", "", false, true, "snapshot"];
    const catalog = ["bgg-picker", API, "owner", "chess", true, false, null];
    const foreign = ["bgg-collection", API, "other", "snapshot", ""];
    const otherApi = ["bgg-collection", "https://other.test", "owner", "snapshot", ""];
    const cached = { pages: [{ items: [], nextCursor: null }], pageParams: [""] };
    const f = setup({
      seed(client) {
        for (const key of [owned, common, subject, picker, catalog, foreign, otherApi])
          client.setQueryData(key, cached);
      },
    });
    let finish: (response: Response) => void = () => {};
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    vi.stubGlobal("fetch", fetcher);
    let completion: Promise<unknown>;
    act(() => {
      completion = f.h.result.current.unlink.mutateAsync().catch((error: unknown) => error);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(f.h.result.current.account.data).toEqual({ active: null, pending: null });
    for (const key of [owned, common, picker]) expect(f.client.getQueryData(key)).toBe(cached);
    await act(async () => {
      finish(
        outcome === "success"
          ? Response.json({ active: null, pending: null })
          : Response.json({ error: "REFUSED" }, { status: 409 }),
      );
      await completion;
    });
    await waitFor(() => expect(f.h.result.current.busy).toBe(false));
    for (const key of [owned, common, picker])
      expect(f.client.getQueryData(key)).toBe(outcome === "success" ? undefined : cached);
    for (const key of [subject, catalog, foreign, otherApi])
      expect(f.client.getQueryData(key)).toBe(cached);
    expect(f.h.result.current.account.data).toEqual(
      outcome === "success" ? { active: null, pending: null } : linked,
    );
    expect(f.feedback.onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith("disconnect_bgg");
    expect(f.feedback.onError).toHaveBeenCalledTimes(outcome === "failure" ? 1 : 0);
  },
);

it.each([5000, 12000] as const)(
  "schedules silent pending synchronization at the actual retry boundary %sms",
  async (delay) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const now = Date.now();
    const data: BggAccountResponse = {
      active: null,
      pending: {
        ...identity,
        status: "syncing",
        nextAttemptAt: delay === 5000 ? null : new Date(now + delay).toISOString(),
        error: null,
      },
    };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      return Response.json({ active: null, pending: null });
    });
    vi.stubGlobal("fetch", fetcher);
    const f = setup({ data, enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delay - 1);
    });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(f.h.result.current.account.data).toEqual({ active: null, pending: null });
    expect(f.feedback.onOptimisticUpdate).not.toHaveBeenCalled();
    expect(f.feedback.onError).not.toHaveBeenCalled();
    f.h.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it.each(["link", "sync", "unlink"] as const)(
  "ignores late %s success and error callbacks after an account owner is purged",
  async (action) => {
    for (const status of [200, 409]) {
      let finish: (response: Response) => void = () => {};
      const fetcher = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetcher);
      const f = setup();
      let done: Promise<unknown>;
      act(() => {
        const current = f.h.result.current;
        done = (
          action === "link"
            ? current.link.mutateAsync("alice")
            : action === "sync"
              ? current.sync.mutateAsync(false)
              : current.unlink.mutateAsync()
        ).catch((error: unknown) => error);
      });
      await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      act(() => clearSessionQueryCache(f.client));
      f.h.rerender({ userId: "next-owner" });
      const nextKey = ["bgg-account", API, "next-owner"];
      f.client.setQueryData(nextKey, linked);
      await act(async () => {
        finish(
          status === 200
            ? Response.json({ active: null, pending: null })
            : Response.json({ error: "REFUSED" }, { status }),
        );
        await done;
      });
      expect(f.client.getQueryData(nextKey)).toEqual(linked);
      expect(f.client.getQueryData(f.key)).toBeUndefined();
      expect(f.feedback.onError).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledOnce();
      f.h.unmount();
    }
  },
);
