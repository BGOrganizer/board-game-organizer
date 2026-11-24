import type {
  BggAccountResponse,
  BggCollectionItem,
  BggCollectionResponse,
  ProfileView,
} from "@board-game-organizer/schemas";
import { bggAccountQuery, profileViewQuery } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { createContext, useContext, useMemo } from "react";
import { Keyboard } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileCacheContext } from "@/lib/cache/mobileCacheContext";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";
import { version } from "../../../../package.json";
import { Profile } from "../Profile";

const API = "https://profile-fixtures.test";
const OTHER_API = "https://other-profile-fixtures.test";
const counts = { withoutExpansions: 1, withExpansions: 2, wishlist: 1 };
const boundary = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  cacheSignOut: vi.fn(async (work: () => Promise<void>) => work()),
  push: vi.fn(),
  replace: vi.fn(),
  clerkLoaded: true,
  profileStatus: new Map<string, number>(),
  accountStatus: new Map<string, number>(),
  pendingProfiles: new Map<string, Promise<Response>>(),
}));
type Api = { apiUrl: string; userId: string; getToken: () => Promise<string>; enabled: boolean };
const ApiContext = createContext<Api>({
  apiUrl: API,
  userId: "owner",
  getToken: async () => "fixture-owner",
  enabled: true,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => useContext(ApiContext) }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ userId: useContext(ApiContext).userId, signOut: boundary.signOut }),
  useUser: () => ({
    isLoaded: boundary.clerkLoaded,
    user: { id: useContext(ApiContext).userId, createdAt: new Date("2020-02-03T12:00:00.000Z") },
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push, replace: boundary.replace }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { sentryEnvironment: "development" } } },
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
}));

function record(subject: string): ProfileView {
  return {
    id: subject,
    name: `Profile ${subject}`,
    username: subject,
    avatarUrl: null,
    social: { friends: 2, followers: 3, following: 4 },
    player: { gamesPlayed: 4, gamesWon: 1, winRate: 25 },
    collection: { snapshot: `snapshot-${subject}`, counts },
  };
}
function account(owner: string): BggAccountResponse {
  return {
    active: {
      id: 17,
      username: `private-bgg-${owner}`,
      avatarUrl: null,
      snapshot: `snapshot-${owner}`,
      syncedAt: "2025-01-01T12:00:00.000Z",
      counts,
    },
    pending: null,
  };
}
const collection: BggCollectionItem[] = [
  {
    id: 1,
    name: "Chess collection",
    year: 1850,
    imageUrl: null,
    rank: 1,
    source: "collection",
    userRating: 8,
    isExpansion: false,
    wishlist: false,
  },
  {
    id: 2,
    name: "Chess expansion",
    year: 2020,
    imageUrl: null,
    rank: 2,
    source: "collection",
    userRating: null,
    isExpansion: true,
    wishlist: true,
  },
];
const rankedGame = { id: 1, name: "Chess ranked", imageUrl: null };
let client: QueryClient;
const profiles = new Map<string, ProfileView>();
const accounts = new Map<string, BggAccountResponse>();
const options = (owner = "owner", apiUrl = API) => ({
  apiUrl,
  userId: owner,
  getToken: async () => `fixture-${owner}`,
});

function seed(owner = "owner", apiUrl = API, subject = owner, includeProfile = true) {
  const profile = profiles.get(subject) ?? record(subject);
  profiles.set(subject, profile);
  const bgg = accounts.get(owner) ?? account(owner);
  accounts.set(owner, bgg);
  if (includeProfile)
    client.setQueryData(profileViewQuery(options(owner, apiUrl), subject).queryKey, profile);
  client.setQueryData(bggAccountQuery(options(owner, apiUrl)).queryKey, bgg);
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  await installNativePopoverMeasurements();
  vi.clearAllMocks();
  boundary.clerkLoaded = true;
  boundary.profileStatus.clear();
  boundary.accountStatus.clear();
  boundary.pendingProfiles.clear();
  profiles.clear();
  accounts.clear();
  useAppStore.getState().clearProfileViews();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubEnv("EXPO_PUBLIC_APP_PRERELEASE", "true");
  vi.stubEnv("EXPO_PUBLIC_BUILD_SHA", "0123456789abcdef0123456789abcdef01234567");
  // Real Query hooks and application components run unchanged. Only HTTP is a
  // deterministic service boundary; no provider or production data is touched.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (![API, OTHER_API].includes(url.origin))
        throw new Error(`Unexpected fixture origin: ${url.origin}`);
      const owner =
        new Headers(init?.headers).get("authorization")?.replace("Bearer fixture-", "") ?? "owner";
      const match = url.pathname.match(/^\/api\/profiles\/([^/]+)(?:\/(.*))?$/);
      if (match) {
        const subject = decodeURIComponent(match[1]),
          tail = match[2];
        if (!tail) {
          const pending = boundary.pendingProfiles.get(subject);
          if (pending) return pending;
          const status = boundary.profileStatus.get(subject) ?? 200;
          return status === 200
            ? json(profiles.get(subject) ?? record(subject))
            : json(
                { error: status === 404 ? "PROFILE_NOT_FOUND" : "Fixture read failure" },
                status,
              );
        }
        if (tail === "activities") return json({ items: [], nextCursor: null });
        if (tail === "games")
          return json({
            items: rankedGame.name
              .toLowerCase()
              .includes((url.searchParams.get("query") ?? "").toLowerCase())
              ? [rankedGame]
              : [],
            nextCursor: null,
          });
        if (tail === "games/1")
          return json({
            game: rankedGame,
            rating: 33,
            delta: 1,
            stats: { gamesPlayed: 4, gamesWon: 1, winRate: 25 },
            points: [],
            nextCursor: null,
          });
      }
      if (url.pathname === "/api/bgg/account" && (init?.method ?? "GET") === "GET") {
        const status = boundary.accountStatus.get(owner) ?? 200;
        return status === 200
          ? json(accounts.get(owner) ?? account(owner))
          : json({ error: "Fixture BGG account access denied" }, status);
      }
      if (url.pathname === "/api/bgg/collection") {
        const query = (url.searchParams.get("query") ?? "").toLowerCase();
        const types = url.searchParams.get("types") ?? "all";
        const items = collection.filter(
          (item) =>
            item.name.toLowerCase().includes(query) &&
            (types === "all" ||
              (types === "games" && !item.isExpansion) ||
              (types === "expansions" && item.isExpansion)) &&
            (url.searchParams.get("wishlist") !== "true" || item.wishlist),
        );
        const page: BggCollectionResponse = {
          snapshot: url.searchParams.get("snapshot") ?? "",
          counts,
          items,
          nextCursor: null,
        };
        return json(page);
      }
      throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  useAppStore.getState().clearProfileViews();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function Fixture({
  owner = "owner",
  apiUrl = API,
  subject,
}: {
  owner?: string;
  apiUrl?: string;
  subject?: string;
}) {
  const api = useMemo(
    () => ({ apiUrl, userId: owner, enabled: true, getToken: async () => `fixture-${owner}` }),
    [apiUrl, owner],
  );
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <ApiContext value={api}>
          <MobileCacheContext value={{ restoring: false, signOut: boundary.cacheSignOut }}>
            <Profile userId={subject} />
          </MobileCacheContext>
        </ApiContext>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function select(tab: string) {
  await userEvent.setup().press(screen.getByTestId(`top-tab-${tab}`));
  expect(screen.getByTestId(`top-tab-${tab}`)).toBeSelected();
  expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
}
function scrollAncestors(node: ReturnType<typeof screen.getByText>) {
  const hosts: (typeof node)[] = [];
  let parent = node.parent;
  while (parent) {
    if (typeof parent.props.onScroll === "function") hosts.push(parent);
    parent = parent.parent;
  }
  return hosts;
}

it("retains independent native Activity/Player/Collection viewports and local collection filters", async () => {
  seed();
  const dismiss = vi.spyOn(Keyboard, "dismiss");
  await render(<Fixture />);
  const activity = await screen.findByText("No activities yet");
  const activityScroll = scrollAncestors(activity);
  expect(activityScroll).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeEnabled();
  await select("player");
  const player = screen.getByText("OpenSkill statistics");
  await userEvent.setup().press(screen.getByTestId("top-tab-player"));
  expect(dismiss).toHaveBeenCalledOnce();
  expect(scrollAncestors(player)).toHaveLength(1);
  expect(screen.queryByText("No activities yet")).toBeNull();
  await select("collection");
  const filter = screen.getByTestId("profile-collection-filter");
  expect(scrollAncestors(filter)).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
  await fireEvent.changeText(filter, "Chess");
  await userEvent.setup().press(screen.getByTestId("list-filter-expansions"));
  expect(screen.getByTestId("list-filter-expansions")).not.toBeSelected();
  await waitFor(() => expect(screen.getByText("Chess collection")).toBeVisible());
  expect(screen.queryByText("Chess expansion")).toBeNull();
  await select("activity");
  expect(screen.getByText("No activities yet")).toBe(activity);
  expect(scrollAncestors(activity)[0]).toBe(activityScroll[0]);
  await select("player");
  expect(screen.getByText("OpenSkill statistics")).toBe(player);
  await select("collection");
  expect(screen.getByTestId("profile-collection-filter")).toBe(filter);
  expect(filter).toHaveDisplayValue("Chess");
  expect(screen.getByTestId("list-filter-expansions")).not.toBeSelected();
  expect(
    client.getQueryCache().findAll({ queryKey: bggAccountQuery(options()).queryKey, exact: true }),
  ).toHaveLength(1);
  expect(dismiss).toHaveBeenCalledTimes(5);
});

it("retains the Player selector's search draft and selected game through tab handoffs at the callback boundary", async () => {
  seed();
  await render(<Fixture />);
  await select("player");
  await positionMeasuredSelect(screen.getByTestId("rating-game-select-trigger"));
  // Select's flattened opacity is a stale native-animation snapshot in this
  // renderer; invoke real callbacks without claiming physical tappability.
  await fireEvent.changeText(
    screen.getByLabelText("Filter games", { includeHiddenElements: true }),
    "Chess",
  );
  const choice = await screen.findByRole("option", {
    name: rankedGame.name,
    includeHiddenElements: true,
  });
  await fireEvent.press(choice);
  await waitFor(() => expect(screen.queryByTestId("rating-game-select-popover")).toBeNull());
  expect(screen.getByTestId("rating-game-select-trigger")).toHaveTextContent(rankedGame.name);
  await select("activity");
  await select("player");
  expect(screen.getByTestId("rating-game-select-trigger")).toHaveTextContent(rankedGame.name);
  await positionMeasuredSelect(screen.getByTestId("rating-game-select-trigger"));
  expect(screen.getByLabelText("Filter games", { includeHiddenElements: true })).toHaveDisplayValue(
    "Chess",
  );
});

it("retains each visited profile header's BGG draft without creating separate account workflows", async () => {
  seed();
  await render(<Fixture />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Change BGG username" }));
  await fireEvent.changeText(screen.getByTestId("profile-bgg-username"), "activity-draft");
  await userEvent.setup().press(screen.getByTestId("confirmation-cancel"));
  await select("player");
  await userEvent.setup().press(screen.getByRole("button", { name: "Change BGG username" }));
  expect(screen.getByTestId("profile-bgg-username")).toHaveDisplayValue("private-bgg-owner");
  await fireEvent.changeText(screen.getByTestId("profile-bgg-username"), "player-draft");
  await userEvent.setup().press(screen.getByTestId("confirmation-cancel"));
  await select("activity");
  await userEvent.setup().press(screen.getByRole("button", { name: "Change BGG username" }));
  expect(screen.getByTestId("profile-bgg-username")).toHaveDisplayValue("activity-draft");
  await userEvent.setup().press(screen.getByTestId("confirmation-cancel"));
  await select("player");
  await userEvent.setup().press(screen.getByRole("button", { name: "Change BGG username" }));
  expect(screen.getByTestId("profile-bgg-username")).toHaveDisplayValue("player-draft");
  const accountQueries = client
    .getQueryCache()
    .findAll({ queryKey: bggAccountQuery(options()).queryKey, exact: true });
  expect(accountQueries).toHaveLength(1);
  expect(accountQueries[0].getObserversCount()).toBe(1);
  expect(
    vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
  ).toBe(true);
});

it("shows authoritative profile cache changes immediately without recreating the visited viewport", async () => {
  seed();
  await render(<Fixture />);
  const activity = await screen.findByText("No activities yet");
  const identity = screen.getByText("Profile owner");
  await act(() =>
    client.setQueryData(profileViewQuery(options(), "owner").queryKey, {
      ...record("owner"),
      name: "Updated profile",
      social: { friends: 9, followers: 3, following: 4 },
    }),
  );
  await waitFor(() => expect(screen.getByText("Updated profile")).toBeVisible());
  expect(screen.getByText("Updated profile")).toBe(identity);
  expect(screen.getByText("9")).toBeVisible();
  expect(screen.getByText("No activities yet")).toBe(activity);
  await select("player");
  expect(screen.getByText("Updated profile")).toBeVisible();
  expect(screen.getByText("25%")).toBeVisible();
});

it("evicts a collection's draft on publication changes or unlink and falls back to Activities", async () => {
  seed();
  await render(<Fixture />);
  await select("collection");
  const first = screen.getByTestId("profile-collection-filter");
  await fireEvent.changeText(first, "old draft");
  const updated = account("owner");
  if (!updated.active) throw new Error("Expected the linked fixture account");
  updated.active.snapshot = "new-publication";
  accounts.set("owner", updated);
  await act(() => {
    client.setQueryData(bggAccountQuery(options()).queryKey, updated);
    client.setQueryData(profileViewQuery(options(), "owner").queryKey, {
      ...record("owner"),
      collection: { snapshot: "new-publication", counts },
    });
  });
  await waitFor(() => expect(first).not.toBeOnTheScreen());
  expect(screen.getByTestId("profile-collection-filter")).toHaveDisplayValue("");
  const published = screen.getByTestId("profile-collection-filter");
  accounts.set("owner", { active: null, pending: null });
  await act(() => {
    client.setQueryData(bggAccountQuery(options()).queryKey, { active: null, pending: null });
    client.setQueryData(profileViewQuery(options(), "owner").queryKey, {
      ...record("owner"),
      collection: null,
    });
  });
  await waitFor(() => expect(screen.queryByTestId("top-tab-collection")).toBeNull());
  expect(published).not.toBeOnTheScreen();
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  expect(await screen.findByText("No activities yet")).toBeVisible();
});

it("replaces private retained content for another account/API and exposes only public subject metadata", async () => {
  seed();
  const view = await render(<Fixture />);
  await select("collection");
  const oldFilter = screen.getByTestId("profile-collection-filter");
  await fireEvent.changeText(oldFilter, "old owner draft");
  seed("other");
  await view.rerender(<Fixture owner="other" />);
  expect(await screen.findByText("Profile other")).toBeVisible();
  expect(oldFilter).not.toBeOnTheScreen();
  expect(screen.queryByText("Profile owner", { includeHiddenElements: true })).toBeNull();
  await select("collection");
  expect(screen.getByTestId("profile-collection-filter")).toHaveDisplayValue("");
  const otherFilter = screen.getByTestId("profile-collection-filter");
  seed("other", OTHER_API);
  await view.rerender(<Fixture owner="other" apiUrl={OTHER_API} />);
  expect(await screen.findByText("Profile other")).toBeVisible();
  expect(otherFilter).not.toBeOnTheScreen();
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  seed("other", OTHER_API, "subject");
  await view.rerender(<Fixture owner="other" apiUrl={OTHER_API} subject="subject" />);
  expect(await screen.findByText("Profile subject")).toBeVisible();
  expect(otherFilter).not.toBeOnTheScreen();
  expect(screen.queryByTestId("profile-joined-at")).toBeNull();
  expect(screen.queryByTestId("profile-version")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sync collection" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
  expect(screen.queryByText("private-bgg-other", { includeHiddenElements: true })).toBeNull();
  await select("collection");
  expect(screen.getByTestId("profile-collection-filter")).toHaveDisplayValue("");
  expect(screen.getByTestId("list-filter-common")).toBeEnabled();
});

it("keeps loading and retryable profile errors observable while logout stays available", async () => {
  seed("owner", API, "owner", false);
  let complete: (response: Response) => void = () => {};
  boundary.pendingProfiles.set(
    "owner",
    new Promise<Response>((resolve) => {
      complete = resolve;
    }),
  );
  await render(<Fixture />);
  expect(screen.queryByText("Profile owner")).toBeNull();
  expect(screen.queryByTestId("top-tab-activity")).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeEnabled();
  await act(() => {
    boundary.pendingProfiles.delete("owner");
    complete(json(record("owner")));
  });
  expect(await screen.findByText("Profile owner")).toBeVisible();
  boundary.profileStatus.set("owner", 503);
  await act(async () => {
    await client.refetchQueries({
      queryKey: profileViewQuery(options(), "owner").queryKey,
      exact: true,
    });
  });
  expect(await screen.findByText("Could not load profile")).toBeVisible();
  expect(screen.getByText("Profile owner")).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeEnabled();
  boundary.profileStatus.set("owner", 200);
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText("Could not load profile")).toBeNull());
});

it("removes retained private content on an authoritative denial and leaves owner logout reachable", async () => {
  seed();
  await render(<Fixture />);
  await select("collection");
  const filter = screen.getByTestId("profile-collection-filter");
  boundary.profileStatus.set("owner", 404);
  await act(async () => {
    await client.refetchQueries({
      queryKey: profileViewQuery(options(), "owner").queryKey,
      exact: true,
    });
  });
  expect(await screen.findByText("Profile unavailable")).toBeVisible();
  expect(filter).not.toBeOnTheScreen();
  expect(screen.queryByText("Profile owner", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId("top-tab-collection")).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeEnabled();
});

it("uses authenticated Clerk creation metadata and running bundle version in both owner footers", async () => {
  seed();
  const view = await render(<Fixture />);
  const date = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
    new Date("2020-02-03T12:00:00.000Z"),
  );
  expect(within(screen.getByTestId("profile-joined-at")).getByText(date)).toBeVisible();
  expect(screen.getByTestId("profile-version")).toHaveTextContent(`Version: ${version}+0123456`);
  await select("player");
  expect(screen.getByTestId("profile-version")).toHaveTextContent(`Version: ${version}+0123456`);
  boundary.clerkLoaded = false;
  await view.rerender(<Fixture />);
  expect(within(screen.getByTestId("profile-joined-at")).queryByText(date)).toBeNull();
  boundary.clerkLoaded = true;
  await view.rerender(<Fixture />);
  expect(within(screen.getByTestId("profile-joined-at")).getByText(date)).toBeVisible();
});

it("requires explicit logout confirmation and delegates signout through the native cache boundary", async () => {
  seed();
  await render(<Fixture />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Sign out of your account" }));
  expect(boundary.signOut).not.toHaveBeenCalled();
  expect(screen.getByText("You will need to sign in again to access your account.")).toBeVisible();
  await userEvent.setup().press(screen.getByTestId("confirmation-cancel"));
  expect(boundary.signOut).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Sign out of your account" }));
  await userEvent.setup().press(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(boundary.replace).toHaveBeenCalledWith("/"));
  expect(boundary.cacheSignOut).toHaveBeenCalledOnce();
  expect(boundary.signOut).toHaveBeenCalledOnce();
  expect(boundary.cacheSignOut.mock.invocationCallOrder[0]).toBeLessThan(
    boundary.signOut.mock.invocationCallOrder[0],
  );
  expect(useAppStore.getState().profileViews).toEqual({});
});

it("normalizes a foreign unpublished collection's stale selected tab without reading a private account or collection", async () => {
  const subject = "unpublished-subject";
  profiles.set(subject, { ...record(subject), collection: null });
  seed("owner", API, subject);
  const ownAccountKey = bggAccountQuery(options()).queryKey;
  const preservedAccount = client.getQueryData(ownAccountKey);
  const viewKey = JSON.stringify([API, "owner", subject]);
  useAppStore.getState().setProfileView(viewKey, { tab: "collection" });
  await render(<Fixture subject={subject} />);
  expect(await screen.findByText(`Profile ${subject}`)).toBeVisible();
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  expect(screen.queryByTestId("top-tab-collection")).toBeNull();
  expect(
    screen.queryByTestId("profile-collection-filter", { includeHiddenElements: true }),
  ).toBeNull();
  expect(screen.queryByText("private-bgg-owner", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId("profile-joined-at")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls.every(([input]) => !String(input).includes("/api/bgg/"))).toBe(true);
  expect(client.getQueryData(ownAccountKey)).toBe(preservedAccount);
  expect(boundary.signOut).not.toHaveBeenCalled();
});

it("evicts a foreign collection on authoritative denial and returns to Activities after an unpublished reauthorization", async () => {
  const subject = "published-subject";
  seed();
  const ownProfileKey = profileViewQuery(options(), "owner").queryKey;
  const preservedOwner = client.getQueryData(ownProfileKey);
  seed("owner", API, subject);
  await render(<Fixture subject={subject} />);
  await select("collection");
  const oldFilter = screen.getByTestId("profile-collection-filter");
  await fireEvent.changeText(oldFilter, "old publication draft");
  boundary.profileStatus.set(subject, 403);
  await act(() =>
    client.refetchQueries({ queryKey: profileViewQuery(options(), subject).queryKey, exact: true }),
  );
  expect(await screen.findByText("Profile unavailable")).toBeVisible();
  expect(oldFilter).not.toBeOnTheScreen();
  expect(screen.queryByText(`Profile ${subject}`, { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId("top-tab-collection", { includeHiddenElements: true })).toBeNull();
  expect(client.getQueryData(ownProfileKey)).toBe(preservedOwner);
  boundary.profileStatus.delete(subject);
  profiles.set(subject, { ...record(subject), collection: null });
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(`Profile ${subject}`)).toBeVisible();
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  expect(screen.queryByTestId("top-tab-collection", { includeHiddenElements: true })).toBeNull();
  expect(
    screen.queryByTestId("profile-collection-filter", { includeHiddenElements: true }),
  ).toBeNull();
  expect(client.getQueryData(ownProfileKey)).toBe(preservedOwner);
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(
    true,
  );
  expect(boundary.signOut).not.toHaveBeenCalled();
});

it("removes the owner's Collection affordance on BGG-account denial while preserving independently authorized profile and logout", async () => {
  seed();
  const profileKey = profileViewQuery(options(), "owner").queryKey;
  const preservedProfile = client.getQueryData(profileKey);
  await render(<Fixture />);
  await select("collection");
  const oldFilter = screen.getByTestId("profile-collection-filter");
  boundary.accountStatus.set("owner", 403);
  await act(() =>
    client.refetchQueries({ queryKey: bggAccountQuery(options()).queryKey, exact: true }),
  );
  await waitFor(() => expect(screen.queryByTestId("top-tab-collection")).toBeNull());
  expect(oldFilter).not.toBeOnTheScreen();
  expect(
    screen.queryByTestId("profile-collection-filter", { includeHiddenElements: true }),
  ).toBeNull();
  expect(screen.getByTestId("top-tab-activity")).toBeSelected();
  expect(screen.getByText("Profile owner", { exact: true })).toBeVisible();
  expect(screen.queryByText("private-bgg-owner", { includeHiddenElements: true })).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeEnabled();
  expect(client.getQueryData(profileKey)).toBe(preservedProfile);
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(
    true,
  );
  expect(boundary.signOut).not.toHaveBeenCalled();
});

it.each([
  { username: "recent-player", label: "recent-player" },
  { username: null, label: "Unknown" },
])(
  "shows a safe $label identity and no fabricated win rate for an incomplete profile",
  async ({ username, label }) => {
    const subject = "new-profile";
    profiles.set(subject, {
      ...record(subject),
      name: "",
      username,
      player: { gamesPlayed: 0, gamesWon: 0, winRate: null },
      collection: null,
    });
    seed("owner", API, subject);
    await render(<Fixture subject={subject} />);
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.queryByTestId("top-tab-collection")).toBeNull();
    await select("player");
    expect(screen.getByText("Win percentage")).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
    expect(screen.queryByText("0%")).toBeNull();
  },
);

it("keeps a foreign published collection usable when the viewer's own BGG comparison is denied", async () => {
  const subject = "published-owner";
  seed("owner", API, subject);
  boundary.accountStatus.set("owner", 403);
  await render(<Fixture subject={subject} />);
  await act(async () => {
    await client.refetchQueries({ queryKey: bggAccountQuery(options()).queryKey, exact: true });
  });
  await select("collection");
  expect(await screen.findByText("Chess collection")).toBeVisible();
  expect(screen.queryByText("private-bgg-owner")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
  const collectionReads = vi
    .mocked(fetch)
    .mock.calls.map(([value]) => new URL(String(value)))
    .filter((url) => url.pathname === "/api/bgg/collection");
  expect(collectionReads).not.toHaveLength(0);
  expect(
    collectionReads.every((url) => url.searchParams.get("snapshot") === `snapshot-${subject}`),
  ).toBe(true);
});

it("shows sign-out failure and permits a fresh explicit login boundary request", async () => {
  const user = userEvent.setup();
  seed();
  boundary.signOut.mockRejectedValueOnce(new Error("Local Clerk session could not be ended"));
  await render(<Fixture />);
  await user.press(screen.getByRole("button", { name: "Sign out of your account" }));
  await user.press(screen.getByRole("button", { name: "Sign out" }));
  const failure = "Could not sign out. Try again.";
  expect(await screen.findByText(failure)).toBeVisible();
  expect(boundary.replace).not.toHaveBeenCalled();
  expect(boundary.cacheSignOut).toHaveBeenCalledOnce();
  expect(boundary.signOut).toHaveBeenCalledOnce();

  await user.press(screen.getByRole("button", { name: "Sign out of your account" }));
  await user.press(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(boundary.replace).toHaveBeenCalledExactlyOnceWith("/"));
  expect(boundary.cacheSignOut).toHaveBeenCalledTimes(2);
  expect(boundary.signOut).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(failure)).toBeNull();
});
