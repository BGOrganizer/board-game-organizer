import { afterEach, beforeEach, expect, it } from "vitest";
import { createQueryClient } from "../../../../query/src/query-client";
import { useAppStore } from "../../../../store/src";

const originalStore = useAppStore.getState();
const scope = "https://api.example.test|user-a";
const otherApi = "https://other-api.example.test|user-a";
const otherUser = "https://api.example.test|user-b";

beforeEach(() => useAppStore.setState(originalStore, true));
afterEach(() => useAppStore.setState(originalStore, true));

it("creates separate Query caches with the application freshness, retention and retry defaults", async () => {
  const first = createQueryClient();
  const second = createQueryClient();
  try {
    expect(first).not.toBe(second);
    expect(first.getQueryCache()).not.toBe(second.getQueryCache());
    expect(first.getMutationCache()).not.toBe(second.getMutationCache());
    expect(first.getDefaultOptions().queries).toEqual({
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
    });
    const queryKey = ["workspace-state", "https://api.example.test", "user-a"];
    first.setQueryData(queryKey, { name: "First owner" });
    expect(second.getQueryData(queryKey)).toBeUndefined();
    await second.fetchQuery({ queryKey, queryFn: async () => ({ name: "Second owner" }) });
    expect(first.getQueryData(queryKey)).toEqual({ name: "First owner" });
    expect(second.getQueryData(queryKey)).toEqual({ name: "Second owner" });
    first.clear();
    expect(first.getQueryData(queryKey)).toBeUndefined();
    expect(second.getQueryData(queryKey)).toEqual({ name: "Second owner" });
  } finally {
    first.clear();
    second.clear();
  }
});

it("initializes all combined slices and changes the theme without replacing their state or actions", () => {
  expect(useAppStore.getState()).toMatchObject({
    count: 0,
    themePreference: "system",
    profileViews: {},
    communityViews: {},
    pendingUser: null,
    pendingGame: null,
    pendingLocation: null,
  });
  for (const theme of ["light", "dark", "system"] as const) {
    useAppStore.getState().setThemePreference(theme);
    expect(useAppStore.getState().themePreference).toBe(theme);
    expect(useAppStore.getState().increment).toBe(originalStore.increment);
    expect(useAppStore.getState().clearPending).toBe(originalStore.clearPending);
  }
});

it("updates and resets the counter while retaining unrelated UI selections", () => {
  useAppStore.getState().setThemePreference("dark");
  useAppStore.getState().setProfileView(scope, { tab: "collection" });
  useAppStore.getState().increment();
  expect(useAppStore.getState().count).toBe(1);
  useAppStore.getState().decrement();
  expect(useAppStore.getState().count).toBe(0);
  useAppStore.getState().incrementBy(7);
  expect(useAppStore.getState().count).toBe(7);
  useAppStore.getState().incrementBy(-9);
  expect(useAppStore.getState().count).toBe(-2);
  useAppStore.getState().reset();
  expect(useAppStore.getState().count).toBe(0);
  expect(useAppStore.getState().themePreference).toBe("dark");
  expect(useAppStore.getState().profileViews[scope]?.tab).toBe("collection");
});

it("merges scoped profile and community patches and clears account views without clearing theme or counter", () => {
  const store = useAppStore.getState();
  store.setThemePreference("light");
  store.incrementBy(3);
  store.setProfileView(scope, { tab: "player", gameId: 7 });
  expect(useAppStore.getState().profileViews[scope]).toEqual({
    tab: "player",
    gameId: 7,
    activityKind: "",
  });
  store.setProfileView(scope, { activityKind: "game-result" });
  store.setProfileView(otherApi, { tab: "collection" });
  store.setProfileView(otherUser, {});
  expect(useAppStore.getState().profileViews).toEqual({
    [scope]: { tab: "player", gameId: 7, activityKind: "game-result" },
    [otherApi]: { tab: "collection", gameId: null, activityKind: "" },
    [otherUser]: { tab: "activity", gameId: null, activityKind: "" },
  });
  store.setCommunityView(scope, { network: "friends" });
  expect(useAppStore.getState().communityViews[scope]).toEqual({
    tab: "activity",
    network: "friends",
    activityKind: "",
  });
  store.setCommunityView(scope, { tab: "market", activityKind: "collection" });
  store.setCommunityView(otherApi, { network: "following" });
  store.setCommunityView(otherUser, {});
  expect(useAppStore.getState().communityViews).toEqual({
    [scope]: { tab: "market", network: "friends", activityKind: "collection" },
    [otherApi]: { tab: "activity", network: "following", activityKind: "" },
    [otherUser]: { tab: "activity", network: "all", activityKind: "" },
  });
  store.clearProfileViews();
  expect(useAppStore.getState()).toMatchObject({
    profileViews: {},
    communityViews: {},
    themePreference: "light",
    count: 3,
  });
});

it("transfers picker selections by slot and clears them together while preserving UI state", () => {
  const store = useAppStore.getState();
  const user = {
    id: "selected-user",
    name: "Selected user",
    username: "selected",
    email: null,
    avatarUrl: null,
  };
  const game = { id: 7, name: "Selected game", imageUrl: null, year: 2024, average: 8, rank: 12 };
  const location = {
    id: "selected-location",
    name: "Selected location",
    address: "Test address",
    longitude: 12,
    latitude: 42,
  };
  store.incrementBy(4);
  store.setThemePreference("dark");
  store.setProfileView(scope, { tab: "player" });
  store.setCommunityView(scope, { network: "following" });
  store.setPendingUser("player-slot", user);
  store.setPendingGame("game-slot", game);
  store.setPendingLocation("location-slot", location);
  expect(useAppStore.getState()).toMatchObject({
    pendingUser: { slotId: "player-slot", user },
    pendingGame: { slotId: "game-slot", game },
    pendingLocation: { slotId: "location-slot", location },
  });
  store.setPendingUser("replacement-slot", { ...user, id: "replacement-user" });
  expect(useAppStore.getState().pendingUser).toEqual({
    slotId: "replacement-slot",
    user: { ...user, id: "replacement-user" },
  });
  expect(useAppStore.getState().pendingGame).toEqual({ slotId: "game-slot", game });
  store.clearPending();
  expect(useAppStore.getState()).toMatchObject({
    pendingUser: null,
    pendingGame: null,
    pendingLocation: null,
    count: 4,
    themePreference: "dark",
    profileViews: { [scope]: { tab: "player", gameId: null, activityKind: "" } },
    communityViews: { [scope]: { tab: "activity", network: "following", activityKind: "" } },
  });
});
