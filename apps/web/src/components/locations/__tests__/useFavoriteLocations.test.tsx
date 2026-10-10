import {
  type FavoriteLocation,
  locationFavoriteKey,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import { useFavoriteLocations } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const apiUrl = "https://api.example.com";
const location: MatchLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Game cafe",
  address: "Main Street 10",
  longitude: 12.5,
  latitude: 41.9,
};
const favorite = { key: locationFavoriteKey(location), location };
const options = { apiUrl, userId: "user_one", getToken: async () => "fresh-token" };
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
afterEach(() => vi.unstubAllGlobals());

it("paginates favorites, batches status requests and resolves a fresh token for every request", async () => {
  const all = Array.from({ length: 51 }, (_, index) => ({
    ...location,
    address: `Main Street ${index}`,
  }));
  let tokenNumber = 0;
  const getToken = vi.fn(async () => `jwt-${++tokenNumber}`);
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const params = new URL(url).searchParams;
    expect(params.get("x-vercel-protection-bypass")).toBe("bypass");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer jwt-\d+$/);
    if (params.has("keys")) {
      const keys = JSON.parse(params.get("keys") ?? "[]") as string[];
      expect(keys.length).toBeLessThanOrEqual(50);
      return Response.json({ keys });
    }
    expect(params.get("limit")).toBe("20");
    return Response.json({
      items: [favorite],
      nextCursor: params.has("cursor") ? null : "a".repeat(64),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const { wrapper } = setup();
  const { result } = renderHook(
    () =>
      useFavoriteLocations({ ...options, getToken, protectionBypass: "bypass" }, [...all, all[0]]),
    { wrapper },
  );
  await waitFor(() => expect(result.current.status.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  expect(result.current.status.data).toHaveLength(51);
  expect(result.current.isFavorite(all[50])).toBe(true);
  await act(async () => {
    await result.current.list.fetchNextPage();
  });
  await waitFor(() => expect(result.current.list.hasNextPage).toBe(false));
  expect(getToken).toHaveBeenCalledTimes(4);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(
    new Set(
      fetchMock.mock.calls.map(
        ([, init]) => (init.headers as Record<string, string>).Authorization,
      ),
    ).size,
  ).toBe(4);
});

it("bounds encoded status URLs for long Unicode addresses", async () => {
  const locations = ["甲", "乙"].map((letter) => ({ ...location, address: letter.repeat(500) }));
  const fetchMock = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    if (params.has("keys")) {
      expect(url.length).toBeLessThan(7500);
      const keys = JSON.parse(params.get("keys") ?? "[]");
      expect(keys).toHaveLength(1);
      return Response.json({ keys });
    }
    return Response.json({ items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  const { wrapper } = setup();
  const { result } = renderHook(() => useFavoriteLocations(options, locations), { wrapper });
  await waitFor(() => expect(result.current.status.isSuccess).toBe(true));
  expect(result.current.status.data).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("adds and removes optimistically, keeps unrelated cache data and uses action-specific feedback", async () => {
  let stored: FavoriteLocation[] = [];
  const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
  let release: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        if (init.method === "POST") {
          expect(JSON.parse(init.body as string)).toEqual({ location, matchId: location.id });
          stored = [favorite];
        } else {
          expect(JSON.parse(init.body as string)).toEqual({ key: favorite.key });
          stored = [];
        }
        return Response.json({ item: favorite });
      }
      return Response.json(
        _url.includes("keys=")
          ? { keys: stored.map((item) => item.key) }
          : { items: stored, nextCursor: null },
      );
    }),
  );
  const { client, wrapper } = setup();
  client.setQueryData(["favoriteLocations", apiUrl, "user_one", "other"], "keep");
  const { result } = renderHook(() => useFavoriteLocations({ ...options, feedback }, [location]), {
    wrapper,
  });
  await waitFor(() =>
    expect(result.current.status.isSuccess && result.current.list.isSuccess).toBe(true),
  );
  act(() =>
    client.setQueryData(["favoriteLocations", apiUrl, "user_one", "list"], {
      pageParams: ["", "cursor"],
      pages: [
        { items: [], nextCursor: "cursor" },
        { items: [], nextCursor: null },
      ],
    }),
  );
  let pending: Promise<unknown>;
  act(() => {
    pending = result.current.toggle.mutateAsync({
      location,
      favorite: false,
      matchId: location.id,
    });
  });
  await waitFor(() => expect(result.current.isFavorite(location)).toBe(true));
  expect(feedback.onOptimisticUpdate).toHaveBeenLastCalledWith("add_favorite_location");
  await waitFor(() => expect(release).toBeDefined());
  await act(async () => {
    release?.();
    await pending;
  });
  expect(result.current.items).toEqual([favorite]);
  release = undefined;
  act(() => {
    pending = result.current.toggle.mutateAsync({ location, favorite: true });
  });
  await waitFor(() => expect(result.current.isFavorite(location)).toBe(false));
  expect(feedback.onOptimisticUpdate).toHaveBeenLastCalledWith("remove_favorite_location");
  await waitFor(() => expect(release).toBeDefined());
  await act(async () => {
    release?.();
    await pending;
  });
  expect(result.current.items).toEqual([]);
  expect(client.getQueryData(["favoriteLocations", apiUrl, "user_one", "other"])).toBe("keep");
});

it("rolls failed adds and removals back without pretending network failure is an empty list", async () => {
  let stored: FavoriteLocation[] = [favorite];
  const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) =>
      init.method
        ? new Response("", { status: 500 })
        : Response.json(
            url.includes("keys=")
              ? { keys: stored.map((item) => item.key) }
              : { items: stored, nextCursor: null },
          ),
    ),
  );
  const { wrapper } = setup();
  const { result } = renderHook(() => useFavoriteLocations({ ...options, feedback }, [location]), {
    wrapper,
  });
  await waitFor(() =>
    expect(result.current.status.isSuccess && result.current.list.isSuccess).toBe(true),
  );
  await act(async () => {
    await expect(result.current.toggle.mutateAsync({ location, favorite: true })).rejects.toThrow(
      "HTTP 500",
    );
  });
  expect(result.current.items).toEqual([favorite]);
  expect(result.current.isFavorite(location)).toBe(true);
  expect(feedback.onError).toHaveBeenLastCalledWith(expect.any(Error), "remove_favorite_location");
  stored = [];
  await act(async () => {
    await result.current.list.refetch();
    await result.current.status.refetch();
  });
  await act(async () => {
    await expect(result.current.toggle.mutateAsync({ location, favorite: false })).rejects.toThrow(
      "HTTP 500",
    );
  });
  expect(result.current.items).toEqual([]);
  expect(feedback.onError).toHaveBeenLastCalledWith(expect.any(Error), "add_favorite_location");
});

it("keeps cache untouched when cancellation fails before optimistic snapshots exist", async () => {
  const fetchMock = vi.fn(async (url: string) =>
    Response.json(url.includes("keys=") ? { keys: [] } : { items: [], nextCursor: null }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { client, wrapper } = setup();
  const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
  const { result } = renderHook(() => useFavoriteLocations({ ...options, feedback }, [location]), {
    wrapper,
  });
  await waitFor(() =>
    expect(result.current.status.isSuccess && result.current.list.isSuccess).toBe(true),
  );
  vi.spyOn(client, "cancelQueries").mockRejectedValueOnce(new Error("cancel failed"));
  await act(async () => {
    await expect(result.current.toggle.mutateAsync({ location, favorite: false })).rejects.toThrow(
      "cancel failed",
    );
  });
  expect(feedback.onOptimisticUpdate).not.toHaveBeenCalled();
  expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "add_favorite_location");
  expect(result.current.items).toEqual([]);
  expect(result.current.isFavorite(location)).toBe(false);
});

it("does not share favorites across users or API origins, and disables anonymous requests", async () => {
  const fetchMock = vi.fn(async (url: string) =>
    Response.json({ items: url.startsWith(apiUrl) ? [favorite] : [], nextCursor: null }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { wrapper } = setup();
  const { result, rerender } = renderHook(
    ({ userId, apiUrl }) => useFavoriteLocations({ ...options, userId, apiUrl }),
    { initialProps: { userId: "user_one" as string | null, apiUrl }, wrapper },
  );
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  expect(result.current.isFavorite(location)).toBe(true);
  expect(result.current.isFavorite({ ...location, address: "other" })).toBe(false);
  rerender({ userId: "user_two", apiUrl: "https://other-api.example.com" });
  expect(result.current.items).toEqual([]);
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  expect(result.current.items).toEqual([]);
  const calls = fetchMock.mock.calls.length;
  rerender({ userId: null, apiUrl });
  expect(result.current.items).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});

it("surfaces missing auth and failed loading, and supports uncached optimistic mutations", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  const { wrapper } = setup();
  const { result } = renderHook(
    () => useFavoriteLocations({ ...options, getToken: async () => null }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.list.isError).toBe(true));
  expect(result.current.list.error?.message).toBe("Unauthorized");
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => {
    await expect(result.current.toggle.mutateAsync({ location, favorite: false })).rejects.toThrow(
      "Unauthorized",
    );
  });
  const other = setup();
  const second = renderHook(() => useFavoriteLocations({ ...options, feedback: {} }), {
    wrapper: other.wrapper,
  });
  await waitFor(() => expect(second.result.current.list.isError).toBe(true));
  await act(async () => {
    await expect(
      second.result.current.toggle.mutateAsync({ location, favorite: false }),
    ).rejects.toThrow("HTTP 502");
  });
});
