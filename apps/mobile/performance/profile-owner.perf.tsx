import { URL } from "node:url";
import type {
  BggAccountResponse,
  BggCollectionItem,
  BggCollectionResponse,
  ProfileRatingHistory,
  ProfileView,
} from "@board-game-organizer/schemas";
import {
  bggAccountQuery,
  bggCollectionQuery,
  profileActivitiesQuery,
  profileViewKeys,
  profileViewQuery,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileScreen from "@/app/profile";
import UserProfileScreen from "@/app/user/[userId]/index";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const API = "https://profile-owner-perf.test";
const OWNER = "profile-owner";
const boundary = vi.hoisted(() => ({
  token: vi.fn(async () => "fixture-profile-owner"),
  signOut: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "profile-owner",
    sessionId: "profile-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.token,
    signOut: boundary.signOut,
  }),
  useUser: () => ({
    isLoaded: true,
    user: {
      id: "profile-owner",
      createdAt: new Date("2020-02-03T12:00:00.000Z"),
      unsafeMetadata: { mobileNumber: "fixture phone" },
    },
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: "https://profile-owner-perf.test",
        sentryEnvironment: "development",
      },
    },
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push, replace: boundary.replace }),
  useLocalSearchParams: () => ({ userId: OWNER }),
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: {
    GRANTED: "granted",
    DENIED: "denied",
    UNDETERMINED: "undetermined",
  },
  getPermissionsAsync: vi.fn(async () => ({
    status: "denied",
    canAskAgain: false,
  })),
}));

// Whole, actual Profile owner: installed React/RN/HeroUI, shared hooks, Query,
// real session adapter and retained panels. Only provider/HTTP ports controlled.
// Reassure samples React commits; this does not measure native GPU/layout/FPS.
const options = {
  apiUrl: API,
  userId: OWNER,
  getToken: boundary.token,
  enabled: true,
};
const viewKey = JSON.stringify([API, OWNER, OWNER]);
const counts = { withoutExpansions: 1, withExpansions: 2, wishlist: 1 };
const chess = { id: 1, name: "Chess benchmark", imageUrl: null };
const collection: BggCollectionItem[] = [
  {
    ...chess,
    source: "collection",
    year: 1850,
    rank: 1,
    average: 8,
    userRating: 8.5,
    isExpansion: false,
    wishlist: false,
  },
  {
    id: 2,
    name: "Expansion benchmark",
    imageUrl: null,
    source: "collection",
    year: 2020,
    rank: 2,
    userRating: null,
    isExpansion: true,
    wishlist: true,
  },
];
let client: QueryClient;
let profile: ProfileView;
let account: BggAccountResponse;
let profileStatus: number;
let requests: { path: string; method: string; authorization: string | null }[];
let unexpected: string[];
const queryKey = (snapshot: string, query = "", types: "all" | "games" = "all") =>
  bggCollectionQuery({
    ...options,
    snapshot,
    subjectId: OWNER,
    query,
    types,
    wishlist: false,
  }).queryKey;
function seedCollection(snapshot: string, items = collection) {
  for (const query of ["", "Chess"])
    for (const types of ["all", "games"] as const) {
      const page: BggCollectionResponse = {
        snapshot,
        counts,
        items: items.filter(
          (item) => item.name.includes(query) && (types !== "games" || !item.isExpansion),
        ),
        nextCursor: null,
      };
      client.setQueryData(queryKey(snapshot, query, types), {
        pages: [page],
        pageParams: [""],
      });
    }
}
function resetRun() {
  vi.clearAllMocks();
  requests = [];
  unexpected = [];
  profileStatus = 200;
  useAppStore.getState().clearProfileViews();
  useAppStore.getState().setProfileView(viewKey, { gameId: 1 });
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  profile = {
    id: OWNER,
    name: "Benchmark profile owner",
    username: OWNER,
    avatarUrl: null,
    social: { friends: 2, followers: 3, following: 4 },
    player: { gamesPlayed: 12, gamesWon: 4, winRate: 33.33 },
    collection: { snapshot: "snapshot-one", counts },
  };
  account = {
    active: {
      id: 17,
      username: "private-bgg-benchmark",
      avatarUrl: null,
      snapshot: "snapshot-one",
      syncedAt: "2025-01-01T12:00:00.000Z",
      counts,
    },
    pending: null,
  };
  const rating: ProfileRatingHistory = {
    game: chess,
    rating: 33.25,
    delta: 1.5,
    stats: { gamesPlayed: 12, gamesWon: 4, winRate: 33.33 },
    points: [
      { ordinal: 1, rating: 31.75, delta: 0.5 },
      { ordinal: 2, rating: 33.25, delta: 1.5 },
    ],
    nextCursor: null,
  };
  client.setQueryData(profileViewQuery(options, OWNER).queryKey, profile);
  client.setQueryData(bggAccountQuery(options).queryKey, account);
  client.setQueryData(profileActivitiesQuery(options, OWNER, undefined, 5).queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData([...profileViewKeys.root(options), "games", OWNER, ""], {
    pages: [{ items: [chess], nextCursor: null }],
    pageParams: [0],
  });
  client.setQueryData([...profileViewKeys.root(options), "rating", OWNER, 1], {
    pages: [rating],
    pageParams: [undefined],
  });
  seedCollection("snapshot-one");
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      const authorization = new Headers(init?.headers).get("Authorization");
      requests.push({ path: url.pathname, method, authorization });
      if (
        url.origin === API &&
        method === "GET" &&
        authorization === "Bearer fixture-profile-owner" &&
        url.pathname === `/api/profiles/${OWNER}`
      ) {
        return Response.json(profileStatus === 200 ? profile : { error: "PROFILE_NOT_FOUND" }, {
          status: profileStatus,
        });
      }
      unexpected.push(`${method} ${url}`);
      throw new Error(
        "Unexpected profile benchmark request: all non-explicit reads must hit their owned cache",
      );
    }),
  );
});
afterEach(() => {
  client?.clear();
  useAppStore.getState().clearProfileViews();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Root({ direct = false }: { direct?: boolean }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        {direct ? <UserProfileScreen /> : <ProfileScreen />}
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function tab(name: "activity" | "player" | "collection") {
  await userEvent.setup().press(screen.getByTestId(`top-tab-${name}`));
  expect(screen.getByTestId(`top-tab-${name}`)).toBeSelected();
  expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
}
async function draft(value: string) {
  await userEvent.setup().press(screen.getByRole("button", { name: "Change BGG username" }));
  await fireEvent.changeText(screen.getByTestId("profile-bgg-username"), value);
  await userEvent.setup().press(screen.getByTestId("confirmation-cancel"));
}
async function expectDraft(value: string) {
  await userEvent.setup().press(screen.getByRole("button", { name: "Change BGG username" }));
  expect(screen.getByTestId("profile-bgg-username")).toHaveDisplayValue(value);
  await userEvent.setup().press(screen.getByTestId("confirmation-cancel"));
}
function assertNoWrites() {
  expect(unexpected).toEqual([]);
  expect(requests.every((request) => request.method === "GET")).toBe(true);
  expect(boundary.signOut).not.toHaveBeenCalled();
}

it("actual Profile: cached Activity Player Collection entry and reentry preserve independent drafts without HTTP", async () => {
  const result = await measureRenders(<Root direct />, {
    beforeEach: resetRun,
    afterEach: () => {
      assertNoWrites();
      client.clear();
      useAppStore.getState().clearProfileViews();
    },
    scenario: async () => {
      expect(screen.getByText("No activities yet")).toBeVisible();
      await draft("activity draft");
      await tab("player");
      expect(screen.getByTestId("rating-game-select-trigger")).toBeVisible();
      expect(screen.getByText("Current rating: 33.25")).toBeVisible();
      await draft("player draft");
      await tab("collection");
      const filter = screen.getByTestId("profile-collection-filter");
      await fireEvent.changeText(filter, "Chess");
      await userEvent.setup().press(screen.getByTestId("list-filter-expansions"));
      await waitFor(() =>
        expect(
          client
            .getQueryCache()
            .find({
              queryKey: queryKey("snapshot-one", "Chess", "games"),
              exact: true,
            })
            ?.getObserversCount(),
        ).toBe(1),
      );
      expect(screen.getByText("Chess benchmark")).toBeVisible();
      expect(screen.getByTestId("list-filter-expansions")).not.toBeSelected();
      await tab("activity");
      await expectDraft("activity draft");
      await tab("player");
      await expectDraft("player draft");
      expect(screen.getByText("Current rating: 33.25")).toBeVisible();
      await tab("collection");
      expect(screen.getByTestId("profile-collection-filter")).toBe(filter);
      expect(filter).toHaveDisplayValue("Chess");
      expect(screen.getByTestId("list-filter-expansions")).not.toBeSelected();
      expect(
        client
          .getQueryCache()
          .find({ queryKey: bggAccountQuery(options).queryKey, exact: true })
          ?.getObserversCount(),
      ).toBe(1);
      expect(requests).toEqual([]);
      assertNoWrites();
    },
  });
  // Parent calibrates this ID from two observed runs; never guess a budget.
  assertRenderMeasurement(result);
});

it("actual Profile: authoritative profile and BGG publication receipts refresh retained panels and evict the old Collection draft", async () => {
  const result = await measureRenders(<Root />, {
    beforeEach: resetRun,
    afterEach: () => {
      assertNoWrites();
      client.clear();
      useAppStore.getState().clearProfileViews();
    },
    scenario: async () => {
      await tab("collection");
      const previous = screen.getByTestId("profile-collection-filter");
      await fireEvent.changeText(previous, "Chess");
      const nextGame: BggCollectionItem = {
        ...collection[0],
        id: 55,
        name: "Azul new publication",
      };
      profile = {
        ...profile,
        name: "Authoritative profile receipt",
        player: { gamesPlayed: 77, gamesWon: 44, winRate: 75 },
        collection: { snapshot: "snapshot-two", counts },
      };
      if (!account.active) throw new Error("Expected linked benchmark BGG account");
      account = {
        ...account,
        active: { ...account.active, snapshot: "snapshot-two" },
      };
      await act(() => {
        seedCollection("snapshot-two", [nextGame]);
        client.setQueryData(bggAccountQuery(options).queryKey, account);
        client.setQueryData(profileViewQuery(options, OWNER).queryKey, profile);
      });
      expect(await screen.findByText("Azul new publication")).toBeVisible();
      expect(screen.getByText("Authoritative profile receipt")).toBeVisible();
      expect(previous).not.toBeOnTheScreen();
      expect(screen.getByTestId("profile-collection-filter")).toHaveDisplayValue("");
      const current = screen.getByTestId("profile-collection-filter");
      await tab("player");
      expect(screen.getByText("75%")).toBeVisible();
      expect(screen.getByText("77")).toBeVisible();
      expect(screen.getByText("Current rating: 33.25")).toBeVisible();
      await tab("collection");
      expect(screen.getByTestId("profile-collection-filter")).toBe(current);
      expect(screen.getByText("Azul new publication")).toBeVisible();
      expect(requests).toEqual([]);
      assertNoWrites();
    },
  });
  assertRenderMeasurement(result);
});

it("actual Profile: a denied authoritative refresh evicts visited private Collection content while logout remains available", async () => {
  const result = await measureRenders(<Root />, {
    beforeEach: resetRun,
    afterEach: () => {
      assertNoWrites();
      client.clear();
      useAppStore.getState().clearProfileViews();
    },
    scenario: async () => {
      await tab("collection");
      const previous = screen.getByTestId("profile-collection-filter");
      expect(screen.getByText("Chess benchmark")).toBeVisible();
      profileStatus = 403;
      await act(() =>
        client.invalidateQueries({
          queryKey: profileViewQuery(options, OWNER).queryKey,
          exact: true,
        }),
      );
      expect(await screen.findByText("Profile unavailable")).toBeVisible();
      expect(previous).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId("top-tab-collection", {
          includeHiddenElements: true,
        }),
      ).toBeNull();
      expect(screen.queryByText("Chess benchmark", { includeHiddenElements: true })).toBeNull();
      expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeVisible();
      expect(requests).toEqual([
        {
          path: `/api/profiles/${OWNER}`,
          method: "GET",
          authorization: "Bearer fixture-profile-owner",
        },
      ]);
      assertNoWrites();
    },
  });
  assertRenderMeasurement(result);
});
