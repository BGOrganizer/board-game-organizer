import { URL } from "node:url";
import type {
  BggCollectionCounts,
  BggCollectionItem,
  BggCollectionResponse,
} from "@board-game-organizer/schemas";
import { bggCollectionQuery, profileViewKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { type ComponentProps, createContext, useContext } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { ProfileCollection } from "../ProfileCollection";

const API = "https://collection-fixtures.test";
const boundary = vi.hoisted(() => ({ token: vi.fn() }));
const OwnerContext = createContext("owner");
vi.mock("@clerk/expo", () => ({
  useAuth: () => {
    const owner = useContext(OwnerContext);
    return {
      userId: owner,
      sessionId: `session-${owner}`,
      isLoaded: true,
      isSignedIn: true,
      getToken: () => boundary.token(owner),
    };
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://collection-fixtures.test" } },
  },
}));

type Props = ComponentProps<typeof ProfileCollection>;
const counts: BggCollectionCounts = {
  withoutExpansions: 120,
  withExpansions: 240,
  wishlist: 60,
};
const game = (id: number, patch: Partial<BggCollectionItem> = {}): BggCollectionItem => ({
  id,
  name: `Collection game ${id}`,
  imageUrl: null,
  year: 2020,
  average: 8,
  rank: id,
  source: "collection",
  userRating: id === 2 ? null : 8.5,
  isExpansion: id === 2,
  wishlist: id === 2,
  ...patch,
});
const page = (snapshot = "snapshot-one", items = [game(1), game(2)]): BggCollectionResponse => ({
  snapshot,
  items,
  counts,
  nextCursor: null,
});
let client: QueryClient;
let first: BggCollectionResponse;
let next: BggCollectionResponse;
let requests: URL[];
let requestOwners: string[];
let unexpected: string[];
let firstStatus: number;
let nextStatus: number;
let gate: Promise<void> | undefined;
let nextGate: Promise<void> | undefined;
let releases: (() => void)[];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  releases.push(resolve);
  return { promise, resolve };
}
function options(patch: Partial<Parameters<typeof bggCollectionQuery>[0]> = {}) {
  return {
    apiUrl: API,
    userId: "owner",
    subjectId: "owner",
    snapshot: "snapshot-one",
    query: "",
    types: "all" as const,
    wishlist: false,
    getToken: async () => "fixture-owner",
    ...patch,
  };
}
function Fixture({ props, owner = "owner" }: { props: Props; owner?: string }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <OwnerContext value={owner}>
          <ProfileCollection {...props} />
        </OwnerContext>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function fixture(patch: Partial<Props> = {}) {
  let props: Props = {
    snapshot: "snapshot-one",
    subjectId: "owner",
    header: <Text>Collection source</Text>,
    ...patch,
  };
  const view = await render(<Fixture props={props} />);
  return {
    ...view,
    update: async (next: Partial<Props>, owner = "owner") => {
      props = { ...props, ...next };
      await view.rerender(<Fixture props={props} owner={owner} />);
    },
  };
}
function nativeList() {
  const matches = screen.container.queryAll(
    (node) =>
      typeof node.props.onScroll === "function" &&
      typeof node.props.onScrollBeginDrag === "function",
  );
  if (matches.length !== 1)
    throw new Error("Expected one actual native collection SectionList scroll host");
  return matches[0];
}
function accessibilityList() {
  const matches = screen.container.queryAll(
    (node) =>
      typeof node.props.onAccessibilityAction === "function" &&
      node.props.accessibilityActions?.some(
        (action: { name: string }) => action.name === "increment",
      ),
  );
  if (matches.length !== 1)
    throw new Error("Expected the public native collection increment action host");
  return matches[0];
}
async function toggle(key: string) {
  await userEvent.setup().press(screen.getByTestId(`list-filter-${key}`));
}
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  first = page();
  next = page("snapshot-one", [game(9)]);
  requests = [];
  requestOwners = [];
  unexpected = [];
  releases = [];
  firstStatus = 200;
  nextStatus = 200;
  gate = undefined;
  nextGate = undefined;
  boundary.token.mockReset().mockImplementation(async (owner: string) => `fixture-${owner}`);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const authorization = new Headers(init?.headers).get("Authorization");
      if (
        url.origin !== API ||
        url.pathname !== "/api/bgg/collection" ||
        !authorization?.startsWith("Bearer fixture-")
      ) {
        unexpected.push(`${init?.method ?? "GET"} ${url}`);
        throw new Error("Unexpected collection boundary request");
      }
      requests.push(url);
      requestOwners.push(authorization);
      const cursor = url.searchParams.get("cursor");
      const status = cursor ? nextStatus : firstStatus;
      const data = cursor ? next : first;
      await (cursor ? nextGate : gate);
      if (init?.signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      const types = url.searchParams.get("types");
      const query = url.searchParams.get("query")?.toLowerCase() ?? "";
      const items = data.items.filter(
        (item) =>
          types !== "none" &&
          (types !== "games" || !item.isExpansion) &&
          (types !== "expansions" || item.isExpansion) &&
          (!url.searchParams.has("wishlist") || item.wishlist) &&
          item.name.toLowerCase().includes(query),
      );
      return Response.json(
        status === 200
          ? { ...data, items }
          : {
              error: status === 403 ? "PROFILE_NOT_FOUND" : "COLLECTION_UNAVAILABLE",
            },
        { status },
      );
    }),
  );
});
afterEach(async () => {
  await cleanup();
  for (const release of releases) release();
  await client.cancelQueries();
  client.clear();
  expect(unexpected).toEqual([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Real ProfileCollection/InputSectionList/filters/cards and actual shared hooks,
// Query/cache/session adapter. Only Clerk/HTTP plus missing Yoga geometry are
// controlled. No retained-profile/root or native timing claim follows.
it("renders authoritative counts and both scored/unrated game facts without exposing a common filter on its owner", async () => {
  await fixture({
    counts: { withoutExpansions: 999, withExpansions: 999, wishlist: 999 },
  });
  expect(await screen.findByText("Collection game 1")).toBeOnTheScreen();
  expect(screen.getByText("120")).toBeOnTheScreen();
  expect(screen.getByText("240")).toBeOnTheScreen();
  expect(screen.getByText("60")).toBeOnTheScreen();
  expect(screen.queryByText("999")).toBeNull();
  expect(screen.getByLabelText("Personal BGG rating: 8.5")).toBeOnTheScreen();
  expect(screen.getByLabelText("Personal BGG rating: N/A")).toBeOnTheScreen();
  expect(screen.queryByTestId("list-filter-common")).toBeNull();
  expect(requestOwners).toEqual(["Bearer fixture-owner"]);
});

it("uses known counts while an actual initial page is pending, without rendering an empty success", async () => {
  const pending = deferred();
  gate = pending.promise;
  await fixture({ counts });
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(screen.getByText("120")).toBeOnTheScreen();
  expect(screen.queryByText("No games found")).toBeNull();
  await act(() => pending.resolve());
  expect(await screen.findByText("Collection game 1")).toBeOnTheScreen();
});

it.each(["owner", "other"])(
  "does not fabricate collection counts for a legacy %s snapshot",
  async (subjectId) => {
    first = { ...first, counts: null };
    await fixture({ subjectId });
    await screen.findByText("Collection game 1");
    expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(3);
    const hint = "Synchronize again to include expansions and collection counts.";
    if (subjectId === "owner") expect(screen.getByText(hint)).toBeOnTheScreen();
    else expect(screen.queryByText(hint)).toBeNull();
  },
);

it("retains known legacy counts without requesting an unnecessary re-sync", async () => {
  first = { ...first, counts: null };
  await fixture({ counts });
  await screen.findByText("Collection game 1");
  expect(screen.getByText("120")).toBeOnTheScreen();
  expect(
    screen.queryByText("Synchronize again to include expansions and collection counts."),
  ).toBeNull();
  expect(requests).toHaveLength(1);
});

it("shows an empty success only after an authoritative empty exhausted page", async () => {
  first = page("snapshot-one", []);
  await fixture();
  expect(await screen.findByText("No games found")).toBeOnTheScreen();
  expect(screen.queryByText("Could not load collection")).toBeNull();
});

it("keeps initial read failures observable and retries through the real action", async () => {
  firstStatus = 503;
  await fixture();
  expect(await screen.findByText("Could not load collection")).toBeOnTheScreen();
  expect(screen.queryByText("No games found")).toBeNull();
  firstStatus = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Collection game 1")).toBeOnTheScreen();
  expect(screen.queryByText("Could not load collection")).toBeNull();
});

it("preserves usable cached rows and counts during a failed background refresh", async () => {
  await fixture();
  await screen.findByText("Collection game 1");
  const retained = screen.getByText("Collection game 1");
  firstStatus = 503;
  await act(() =>
    client.invalidateQueries({
      queryKey: bggCollectionQuery(options()).queryKey,
    }),
  );
  expect(await screen.findByText("Could not load collection")).toBeOnTheScreen();
  expect(screen.getByText("Collection game 1")).toBe(retained);
  expect(screen.getByText("120")).toBeOnTheScreen();
  expect(screen.queryByText("No games found")).toBeNull();
});

it("revokes denied cached rows and counts for only the authorized viewer/subject scope", async () => {
  const unrelatedKey = bggCollectionQuery(options({ subjectId: "unrelated" })).queryKey;
  client.setQueryData(unrelatedKey, {
    pages: [page("snapshot-one", [game(44)])],
    pageParams: [""],
  });
  await fixture();
  await screen.findByText("Collection game 1");
  firstStatus = 403;
  await act(() =>
    client.invalidateQueries({
      queryKey: bggCollectionQuery(options()).queryKey,
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load collection")).toBeOnTheScreen();
  expect(screen.queryByText("Collection game 1", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText("120")).toBeNull();
  await waitFor(() =>
    expect(client.getQueryData(bggCollectionQuery(options()).queryKey)).toBeNull(),
  );
  expect(client.getQueryData(unrelatedKey)).toEqual({
    pages: [page("snapshot-one", [game(44)])],
    pageParams: [""],
  });
});

it("rejects a mismatched publication receipt and invalidates its inactive owner/profile sources", async () => {
  const accountKey = ["bgg-account", API, "owner"];
  const profileKey = profileViewKeys.view(options(), "owner");
  client.setQueryData(accountKey, {
    active: { snapshot: "snapshot-one" },
    pending: null,
  });
  client.setQueryData(profileKey, { id: "owner" });
  first = page("unexpected-publication", [game(77)]);
  await fixture();
  expect(await screen.findByText("Could not load collection")).toBeOnTheScreen();
  expect(screen.queryByText("Collection game 77")).toBeNull();
  await waitFor(() => expect(client.getQueryState(accountKey)?.isInvalidated).toBe(true));
  expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true);
  expect(requests).toHaveLength(1);
});

it("uses the complete games/expansions/none/wishlist filter matrix through actual HeroUI actions", async () => {
  await fixture();
  await screen.findByText("Collection game 1");
  expect(requests.at(-1)?.searchParams.get("types")).toBe("all");
  await toggle("expansions");
  await waitFor(() => expect(requests.at(-1)?.searchParams.get("types")).toBe("games"));
  await toggle("games");
  await waitFor(() => expect(requests.at(-1)?.searchParams.get("types")).toBe("none"));
  await toggle("expansions");
  await waitFor(() => expect(requests.at(-1)?.searchParams.get("types")).toBe("expansions"));
  await toggle("wishlist");
  await waitFor(() => expect(requests.at(-1)?.searchParams.get("wishlist")).toBe("true"));
  expect(requests.at(-1)?.searchParams.get("types")).toBe("all");
  expect(screen.getByTestId("list-filter-wishlist")).toBeSelected();
});

it("debounces a one-character collection filter and clears it without catalog discovery", async () => {
  await fixture();
  await screen.findByText("Collection game 1");
  const before = requests.length;
  await fireEvent.changeText(screen.getByTestId("profile-collection-filter"), "  x  ");
  expect(requests).toHaveLength(before);
  await waitFor(() => expect(requests.at(-1)?.searchParams.get("query")).toBe("x"));
  expect(screen.getByTestId("profile-collection-filter")).toHaveDisplayValue("  x  ");
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear search" }));
  await waitFor(() =>
    expect(screen.getByTestId("profile-collection-filter")).toHaveDisplayValue(""),
  );
});

it("disables common games without a published viewer collection and performs no common read", async () => {
  await fixture({ subjectId: "other" });
  await screen.findByText("Collection game 1");
  expect(screen.getByTestId("list-filter-common")).toBeDisabled();
  expect(
    screen.getByText("Synchronize your BGG collection to find games in common."),
  ).toBeOnTheScreen();
  await toggle("common");
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get("subjectId")).toBe("other");
  expect(requests[0].searchParams.has("commonSnapshot")).toBe(false);
});

it("scopes common games to both published snapshots and removes that filter when viewer publication disappears", async () => {
  const f = await fixture({ subjectId: "other", viewerSnapshot: "viewer-one" });
  await screen.findByText("Collection game 1");
  await toggle("common");
  await waitFor(() =>
    expect(requests.at(-1)?.searchParams.get("commonSnapshot")).toBe("viewer-one"),
  );
  expect(screen.getByTestId("list-filter-common")).toBeSelected();
  await f.update({ viewerSnapshot: undefined });
  expect(screen.getByTestId("list-filter-common")).toBeDisabled();
  expect(screen.getByTestId("list-filter-common")).not.toBeSelected();
  const key = bggCollectionQuery(
    options({ subjectId: "other", commonSnapshot: undefined }),
  ).queryKey;
  expect(client.getQueryData(key)).toBeDefined();
});

it("reveals retained pages before requesting another page and leaves canonical cached pages intact", async () => {
  const cachedFirst = {
    ...page(
      "snapshot-one",
      Array.from({ length: 8 }, (_, index) => game(index + 1)),
    ),
    nextCursor: "page-two",
  };
  const cachedSecond = page("snapshot-one", [game(9)]);
  const cached = {
    pages: [cachedFirst, cachedSecond],
    pageParams: ["", "page-two"],
  };
  const key = bggCollectionQuery(options()).queryKey;
  client.setQueryData(key, cached);
  await fixture();
  expect(await screen.findByText("Collection game 1")).toBeOnTheScreen();
  expect(screen.queryByText("Collection game 9")).toBeNull();
  await scrollNativeListToEnd(nativeList(), 1500);
  await scrollNativeListToEnd(nativeList(), 1600);
  expect(await screen.findByText("Collection game 9")).toBeOnTheScreen();
  expect(requests).toEqual([]);
  expect(client.getQueryData(key)).toBe(cached);
});

it("coalesces duplicate native gestures while the next page is pending", async () => {
  first = {
    ...page(
      "snapshot-one",
      Array.from({ length: 8 }, (_, index) => game(index + 1)),
    ),
    nextCursor: "page-two",
  };
  const pending = deferred();
  nextGate = pending.promise;
  await fixture();
  await screen.findByText("Collection game 1");
  await scrollNativeListToEnd(nativeList(), 1500);
  await waitFor(() =>
    expect(requests.filter((url) => url.searchParams.get("cursor") === "page-two")).toHaveLength(1),
  );
  await scrollNativeListToEnd(nativeList(), 1500);
  expect(requests.filter((url) => url.searchParams.get("cursor") === "page-two")).toHaveLength(1);
  await act(() => pending.resolve());
  await scrollNativeListToEnd(nativeList(), 1600);
  expect(await screen.findByText("Collection game 9")).toBeOnTheScreen();
});

it("allows explicit native increment actions but ignores unrelated accessibility actions", async () => {
  first = { ...first, nextCursor: "page-two" };
  await fixture();
  await screen.findByText("Collection game 1");
  await fireEvent(accessibilityList(), "accessibilityAction", {
    nativeEvent: { actionName: "decrement" },
  });
  expect(requests).toHaveLength(1);
  await fireEvent(accessibilityList(), "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests.at(-1)?.searchParams.get("cursor")).toBe("page-two");
});

it("rejects a late old-snapshot receipt after the actual owner props move to a new publication", async () => {
  const old = deferred();
  gate = old.promise;
  const f = await fixture();
  await waitFor(() => expect(requests).toHaveLength(1));
  gate = undefined;
  first = page("snapshot-two", [game(55)]);
  await f.update({ snapshot: "snapshot-two" });
  expect(await screen.findByText("Collection game 55")).toBeOnTheScreen();
  await act(() => old.resolve());
  expect(screen.queryByText("Collection game 1", { includeHiddenElements: true })).toBeNull();
  expect(requests.map((url) => url.searchParams.get("snapshot"))).toEqual([
    "snapshot-one",
    "snapshot-two",
  ]);
});

it.each([
  { count: 0, description: "an authoritative empty collection" },
  { count: 2, description: "a small populated collection" },
])(
  "keeps one native section owner and sticky keyboard-safe filters for $description",
  async ({ count }) => {
    first = page(
      "snapshot-one",
      Array.from({ length: count }, (_, index) => game(index + 1)),
    );
    await fixture();
    if (count) await screen.findByText("Collection game 1");
    else await screen.findByText("No games found");
    const list = nativeList();
    expect(list).toHaveProp("keyboardShouldPersistTaps", "handled");
    expect(list).toHaveProp("stickyHeaderIndices", [1]);
    const filter = screen.getByTestId("profile-collection-filter");
    expect(filter).toHaveDisplayValue("");
    expect(list.queryAll((node) => node === filter)).toHaveLength(1);
    const header = screen.getByText("Collection source");
    expect(list.queryAll((node) => node === header)).toHaveLength(1);
    const state = screen.getByText(count ? "Collection game 1" : "No games found");
    expect(list.queryAll((node) => node === state)).toHaveLength(1);
    expect(screen.queryByText("Collection game 3")).toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe("/api/bgg/collection");
    expect(requests[0].searchParams.get("snapshot")).toBe("snapshot-one");
    expect(nativeList()).toBe(list);
    // Public host configuration is tested here; physical sticking and keyboard
    // gesture behavior require device acceptance, not a simulated Yoga engine.
  },
);
