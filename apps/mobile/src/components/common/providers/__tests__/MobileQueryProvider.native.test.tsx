import { createQueryClient } from "@board-game-organizer/query";
import { useAppStore } from "@board-game-organizer/store";
import { type QueryClient, useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createContext, useContext, useState } from "react";
import { AppState, type AppStateStatus, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMobileCache } from "@/lib/cache/mobileCacheContext";
import { type CacheStorage, createSessionPersister } from "@/lib/cache/queryPersistence";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { MobileQueryProvider } from "../MobileQueryProvider";

const API = "https://cache-fixtures.test";
const boundary = vi.hoisted(() => ({ open: vi.fn(), purge: vi.fn(), capture: vi.fn() }));
type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  active: boolean | undefined;
  userId: string | null;
  sessionId: string | null;
};
const initialAuth: AuthState = {
  isLoaded: true,
  isSignedIn: true,
  active: true,
  userId: "owner",
  sessionId: "session-owner",
};
const Auth = createContext(initialAuth);
vi.mock("@clerk/expo", () => ({
  useAuth: (options?: { treatPendingAsSignedOut?: boolean }) => {
    const auth = useContext(Auth);
    return {
      ...auth,
      isSignedIn: options?.treatPendingAsSignedOut === false ? auth.isSignedIn : auth.active,
    };
  },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://cache-fixtures.test" } } },
}));
vi.mock("@sentry/react-native", () => ({ captureException: boundary.capture }));
// Only the encrypted native-storage adapter is controlled. The provider,
// QueryClient, scope policy, serializer, persister and restore implementation are real.
vi.mock("@/lib/cache/mobileQueryStorage", () => ({
  openMobileQueryStorage: boundary.open,
  purgeMobileQueryStorage: boundary.purge,
}));

let client: QueryClient;
let cache: ReturnType<typeof useMobileCache>;
let values: Map<string, string>;
let storage: CacheStorage;
const key = (owner = "owner") => ["groups", API, owner, "detail", "group-fixture"];
function Probe() {
  client = useQueryClient();
  cache = useMobileCache();
  const restoring = useIsRestoring();
  return <Text>{restoring ? "Restoring owned cache" : "Cache lifecycle ready"}</Text>;
}
function Fixture({ auth = initialAuth, start }: { auth?: AuthState; start?: number }) {
  const [startedAt] = useState(Date.now);
  return (
    <NativeTestProviders>
      <Auth value={auth}>
        <MobileQueryProvider startedAt={start ?? startedAt}>
          <Probe />
        </MobileQueryProvider>
      </Auth>
    </NativeTestProviders>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  values = new Map();
  storage = {
    getString: (name) => values.get(name),
    set: vi.fn((name, value) => {
      values.set(name, value);
    }),
    remove: vi.fn((name) => values.delete(name)),
  };
  boundary.open.mockReset().mockResolvedValue(storage);
  boundary.purge.mockReset().mockResolvedValue(undefined);
  useAppStore.getState().clearPending();
});
afterEach(async () => {
  await act(() => client?.clear());
  useAppStore.getState().clearPending();
  vi.restoreAllMocks();
});
const ready = () => screen.findByText("Cache lifecycle ready");

it("does not open private storage before both restored and active authentication settle", async () => {
  const view = await render(<Fixture auth={{ ...initialAuth, isLoaded: false }} />);
  expect(screen.getByText("Restoring owned cache")).toBeOnTheScreen();
  expect(boundary.open).not.toHaveBeenCalled();
  await view.rerender(<Fixture auth={{ ...initialAuth, active: false }} />);
  expect(screen.getByText("Restoring owned cache")).toBeOnTheScreen();
  expect(boundary.open).not.toHaveBeenCalled();
  await view.rerender(<Fixture />);
  await ready();
  expect(boundary.open).toHaveBeenCalledWith(
    { apiUrl: API, userId: "owner" },
    expect.any(Function),
  );
});

it("restores actual serialized owned data and persists authoritative updates and removals", async () => {
  const seed = createQueryClient();
  seed.setQueryData(key(), { id: "group-fixture", name: "Saved group" });
  createSessionPersister(seed, { apiUrl: API, userId: "owner" }, storage, vi.fn()).flush();
  seed.clear();
  await render(<Fixture />);
  await ready();
  expect(client.getQueryData(key())).toEqual({ id: "group-fixture", name: "Saved group" });
  expect(client.getQueryState(key())?.isInvalidated).toBe(true);
  await act(() => client.setQueryData(key(), { id: "group-fixture", name: "Server update" }));
  await waitFor(() => expect(values.get("queries")).toContain("Server update"));
  await act(() => client.removeQueries({ queryKey: key(), exact: true }));
  await waitFor(() => expect(values.get("queries")).not.toContain("Server update"));
});

it("clears RAM and pending private selections on an owner change and rejects a late old storage open", async () => {
  let finish: (value: CacheStorage) => void = () => {};
  boundary.open.mockImplementationOnce(
    () =>
      new Promise<CacheStorage>((resolve) => {
        finish = resolve;
      }),
  );
  const oldStorage = { ...storage, set: vi.fn() };
  const view = await render(<Fixture />);
  await act(() => client.setQueryData(key(), { name: "Old account data" }));
  useAppStore
    .getState()
    .setPendingGame("slot", { id: 1, name: "Old account selection", imageUrl: null, year: null });
  await view.rerender(
    <Fixture auth={{ ...initialAuth, userId: "replacement", sessionId: "session-replacement" }} />,
  );
  await ready();
  expect(client.getQueryData(key())).toBeUndefined();
  expect(useAppStore.getState().pendingGame).toBeNull();
  expect(boundary.purge).toHaveBeenCalledOnce();
  await act(() => finish(oldStorage));
  expect(oldStorage.set).not.toHaveBeenCalled();
  expect(boundary.open.mock.calls[0][1]()).toBe(false);
  expect(boundary.open.mock.calls[1][1]()).toBe(true);
});

it("does not restore data explicitly removed while its asynchronous disk open was pending", async () => {
  const seed = createQueryClient();
  seed.setQueryData(key(), { name: "Removed while restoring" });
  createSessionPersister(seed, { apiUrl: API, userId: "owner" }, storage, vi.fn()).flush();
  seed.clear();
  let finish: (value: CacheStorage) => void = () => {};
  boundary.open.mockImplementationOnce(
    () =>
      new Promise<CacheStorage>((resolve) => {
        finish = resolve;
      }),
  );
  await render(<Fixture />);
  await act(() => {
    client.setQueryData(key(), { name: "Temporary RAM entry" });
    client.removeQueries({ queryKey: key(), exact: true });
    finish(storage);
  });
  await ready();
  expect(client.getQueryData(key())).toBeUndefined();
});

it("bounds startup waiting even if the native key store never resolves", async () => {
  boundary.open.mockReturnValue(new Promise<CacheStorage>(() => {}));
  await render(<Fixture start={Date.now() - 6000} />);
  await ready();
  expect(cache.restoring).toBe(false);
});

it("purges a settled signed-out session without opening an account store", async () => {
  await render(<Fixture auth={{ ...initialAuth, isSignedIn: false, active: false }} />);
  await ready();
  expect(boundary.purge).toHaveBeenCalledOnce();
  expect(boundary.open).not.toHaveBeenCalled();
});

it("keeps RAM usable after storage failure and reports only a redacted error once", async () => {
  boundary.open.mockRejectedValue(new Error("private native path and account data"));
  await render(<Fixture />);
  await ready();
  expect(
    screen.getByText("Local storage is unavailable. Data will be refreshed online."),
  ).toBeOnTheScreen();
  expect(boundary.capture).toHaveBeenCalledExactlyOnceWith(
    new Error("Mobile query storage unavailable"),
    { tags: { operation: "cache.persistence" } },
  );
  await act(() => client.setQueryData(key(), { name: "RAM still available" }));
  expect(client.getQueryData(key())).toEqual({ name: "RAM still available" });
});

it.each(["pending", "throw", "reject"] as const)(
  "runs Clerk logout even when native purge is %s",
  async (failure) => {
    await render(<Fixture />);
    await ready();
    await act(() => client.setQueryData(key(), { name: "Private cached value" }));
    if (failure === "pending") boundary.purge.mockReturnValue(new Promise<void>(() => {}));
    if (failure === "throw")
      boundary.purge.mockImplementation(() => {
        throw new Error("native failure");
      });
    if (failure === "reject") boundary.purge.mockRejectedValue(new Error("native failure"));
    const writes = vi.mocked(storage.set).mock.calls.length;
    useAppStore.getState().setPendingGame("slot", {
      id: 1,
      name: "Private logout selection",
      imageUrl: null,
      year: null,
    });
    const work = vi.fn(async () => {
      expect(client.getQueryData(key())).toBeUndefined();
      expect(useAppStore.getState().pendingGame).toBeNull();
      client.setQueryData(key(), { name: "Late result while Clerk signs out" });
      await Promise.resolve();
      expect(vi.mocked(storage.set).mock.calls.length).toBe(writes);
    });
    await act(() => cache.signOut(work));
    expect(work).toHaveBeenCalledOnce();
    await ready();
    expect(cache.restoring).toBe(false);
    if (failure !== "pending") expect(boundary.capture).toHaveBeenCalledOnce();
  },
);

it("propagates a failed Clerk logout while restarting the original owner's clean cache lifecycle", async () => {
  await render(<Fixture />);
  await ready();
  const error = new Error("Fixture Clerk unavailable");
  await act(async () => {
    await expect(
      cache.signOut(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
  await ready();
  expect(boundary.open).toHaveBeenCalledTimes(2);
  expect(cache.restoring).toBe(false);
});

it("flushes persistence on a native background transition and releases its subscription on unmount", async () => {
  const callbacks: ((state: AppStateStatus) => void)[] = [];
  const remove = vi.fn();
  vi.spyOn(AppState, "addEventListener").mockImplementation((_type, callback) => {
    callbacks.push(callback as (state: AppStateStatus) => void);
    return { remove };
  });
  const view = await render(<Fixture />);
  await ready();
  const writes = vi.mocked(storage.set).mock.calls.length;
  await act(() => {
    for (const callback of callbacks) callback("active");
  });
  expect(vi.mocked(storage.set).mock.calls.length).toBe(writes);
  await act(() => {
    for (const callback of callbacks) callback("background");
  });
  expect(vi.mocked(storage.set).mock.calls.length).toBeGreaterThan(writes);
  await view.unmount();
  expect(remove).toHaveBeenCalledOnce();
});

it("quarantines every unverified Clerk identity without opening or purging private storage", async () => {
  const unsettled: AuthState[] = [
    { ...initialAuth, isLoaded: false },
    { ...initialAuth, isSignedIn: undefined },
    { ...initialAuth, active: false },
    { ...initialAuth, active: undefined },
    { ...initialAuth, userId: null },
    { ...initialAuth, sessionId: null },
  ];
  const view = await render(<Fixture auth={unsettled[0]} />);
  for (const auth of unsettled) {
    await view.rerender(<Fixture auth={auth} />);
    expect(screen.getByText("Restoring owned cache")).toBeOnTheScreen();
    expect(boundary.open).not.toHaveBeenCalled();
    expect(boundary.purge).not.toHaveBeenCalled();
  }
  await view.rerender(<Fixture />);
  await ready();
  expect(boundary.open).toHaveBeenCalledExactlyOnceWith(
    { apiUrl: API, userId: "owner" },
    expect.any(Function),
  );
  expect(boundary.purge).not.toHaveBeenCalled();
});

it("revokes persistence during pending authentication but clears private RAM only on definitive logout", async () => {
  const view = await render(<Fixture />);
  await ready();
  await act(() => client.setQueryData(key(), { name: "Verified owner data" }));
  await waitFor(() => expect(values.get("queries")).toContain("Verified owner data"));
  const writes = vi.mocked(storage.set).mock.calls.length;
  const leaseIsCurrent = boundary.open.mock.calls[0][1];
  useAppStore.getState().setPendingGame("slot", {
    id: 1,
    name: "Pending private selection",
    imageUrl: null,
    year: null,
  });
  await view.rerender(<Fixture auth={{ ...initialAuth, active: undefined }} />);
  expect(screen.getByText("Restoring owned cache")).toBeOnTheScreen();
  expect(client.getQueryData(key())).toEqual({ name: "Verified owner data" });
  expect(boundary.purge).not.toHaveBeenCalled();
  expect(leaseIsCurrent()).toBe(false);
  await act(() => client.setQueryData(key(), { name: "Quarantined RAM update" }));
  expect(vi.mocked(storage.set).mock.calls.length).toBe(writes);
  expect(values.get("queries")).not.toContain("Quarantined RAM update");
  await view.rerender(<Fixture auth={{ ...initialAuth, isSignedIn: false, active: false }} />);
  await ready();
  expect(client.getQueryData(key())).toBeUndefined();
  expect(useAppStore.getState().pendingGame).toBeNull();
  expect(boundary.purge).toHaveBeenCalledOnce();
  expect(boundary.open).toHaveBeenCalledOnce();
  await act(() => client.setQueryData(key(), { name: "Late obsolete result" }));
  expect(vi.mocked(storage.set).mock.calls.length).toBe(writes);
});

it("releases the total splash deadline and preserves a newer network receipt when disk opens late", async () => {
  const seed = createQueryClient();
  seed.setQueryData(key(), { name: "Earlier disk receipt" }, { updatedAt: Date.now() - 1000 });
  createSessionPersister(seed, { apiUrl: API, userId: "owner" }, storage, vi.fn()).flush();
  seed.clear();
  let finish: (value: CacheStorage) => void = () => {};
  boundary.open.mockImplementationOnce(
    () =>
      new Promise<CacheStorage>((resolve) => {
        finish = resolve;
      }),
  );
  await render(<Fixture start={Date.now() - 6000} />);
  await ready();
  expect(client.getQueryData(key())).toBeUndefined();
  expect(values.get("queries")).toContain("Earlier disk receipt");
  await act(() => client.setQueryData(key(), { name: "Fresh authoritative network receipt" }));
  await act(() => finish(storage));
  expect(client.getQueryData(key())).toEqual({ name: "Fresh authoritative network receipt" });
  await waitFor(() =>
    expect(values.get("queries")).toContain("Fresh authoritative network receipt"),
  );
  expect(values.get("queries")).not.toContain("Earlier disk receipt");
  expect(cache.restoring).toBe(false);
  expect(boundary.capture).not.toHaveBeenCalled();
});

it("ignores a late encrypted-storage failure once a different owner is ready", async () => {
  const stale = Promise.withResolvers<CacheStorage>();
  boundary.open.mockReturnValueOnce(stale.promise);
  const view = await render(<Fixture />);
  await waitFor(() => expect(boundary.open).toHaveBeenCalledOnce());
  const replacement = { ...initialAuth, userId: "new-owner", sessionId: "new-session" };
  await view.rerender(<Fixture auth={replacement} />);
  await ready();
  await act(async () => {
    stale.reject(new Error("Retired native account storage failed"));
  });
  expect(screen.getByText("Cache lifecycle ready")).toBeOnTheScreen();
  expect(
    screen.queryByText("Local storage is unavailable. Data will be refreshed online."),
  ).toBeNull();
  expect(boundary.capture).not.toHaveBeenCalled();
  expect(boundary.open).toHaveBeenLastCalledWith(
    { apiUrl: API, userId: "new-owner" },
    expect.any(Function),
  );
  expect(client.getQueryData(key("owner"))).toBeUndefined();
});

it("keeps one redacted warning when encrypted storage fails across two consecutive sessions", async () => {
  boundary.open.mockRejectedValue(new Error("Private device details"));
  const view = await render(<Fixture />);
  await ready();
  const warning = "Local storage is unavailable. Data will be refreshed online.";
  expect(screen.getByText(warning)).toBeOnTheScreen();
  await view.rerender(<Fixture auth={{ ...initialAuth, sessionId: "refreshed-session" }} />);
  await waitFor(() => expect(boundary.open).toHaveBeenCalledTimes(2));
  await ready();
  expect(screen.getAllByText(warning)).toHaveLength(1);
  expect(boundary.capture).toHaveBeenCalledExactlyOnceWith(
    new Error("Mobile query storage unavailable"),
    { tags: { operation: "cache.persistence" } },
  );
});
