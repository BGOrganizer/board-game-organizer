import type {
  BggAccountResponse,
  BggPickerItem,
  BggPickerResponse,
} from "@board-game-organizer/schemas";
import { bggAccountQuery, bggPickerQuery } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { measureNativeList, measureNativeListCells } from "@/test/nativeListGeometry";
import GamePicker from "../GamePicker";

const API = "https://game-picker-fixtures.test";
const boundary = vi.hoisted(() => ({
  userId: "owner" as string | null,
  back: vi.fn(),
  token: "fixture-owner-token",
  params: { slotId: "game-slot", exclude: "" as string | undefined },
  getToken: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: boundary.userId,
    sessionId: boundary.userId ? `session-${boundary.userId}` : null,
    isLoaded: true,
    isSignedIn: Boolean(boundary.userId),
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: boundary.back }),
  useLocalSearchParams: () => boundary.params,
  // Router owns placement; render the application's actual back control from
  // the public screen-options slot so its action can be exercised in Node.
  Stack: {
    Screen: ({ options }: { options: { headerLeft?: () => ReactNode } }) =>
      options.headerLeft?.() ?? null,
  },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://game-picker-fixtures.test" } } },
}));

let client: QueryClient;
let account: BggAccountResponse;
let accountStatus: number;
let pickerStatus: number;
let pickerCode: string;
let page: BggPickerResponse;
let nextPage: BggPickerResponse;
let pending: Promise<Response> | undefined;
const requests: URL[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const game = (id: number, source: BggPickerItem["source"] = "search"): BggPickerItem => ({
  id,
  name: `Strategy game ${id}`,
  imageUrl: null,
  year: 2020,
  average: 8.5,
  rank: id,
  source,
});
const linked: BggAccountResponse = {
  active: {
    id: 1,
    username: "fixture-player",
    avatarUrl: null,
    snapshot: "snapshot-one",
    syncedAt: "2030-01-01T00:00:00.000Z",
  },
  pending: null,
};
const options = () => ({ apiUrl: API, userId: boundary.userId, getToken: boundary.getToken });

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.getState().clearPending();
  boundary.userId = "owner";
  boundary.token = "fixture-owner-token";
  boundary.getToken.mockImplementation(async () => boundary.token);
  boundary.params = { slotId: "game-slot", exclude: "" };
  account = { active: null, pending: null };
  accountStatus = 200;
  pickerStatus = 200;
  pickerCode = "Fixture search unavailable";
  page = { items: [game(1), game(2)], nextCursor: null, sourceEpoch: "source-one" };
  nextPage = { items: [game(3)], nextCursor: null, sourceEpoch: "source-one" };
  pending = undefined;
  requests.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      if (url.pathname === "/api/bgg/account")
        return json(
          accountStatus === 200 ? account : { error: "Fixture account unavailable" },
          accountStatus,
        );
      if (url.pathname !== "/api/bgg/picker")
        throw new Error(`Unexpected fixture path: ${url.pathname}`);
      requests.push(url);
      return (
        pending ??
        json(
          pickerStatus === 200
            ? url.searchParams.has("cursor")
              ? nextPage
              : page
            : { error: pickerCode },
          pickerStatus,
        )
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  useAppStore.getState().clearPending();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Fixture(props: ComponentProps<typeof GamePicker> = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <GamePicker {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function search(value = "Strategy") {
  await fireEvent.changeText(screen.getByTestId("game-search-input"), value);
  await waitFor(() => expect(requests.at(-1)?.searchParams.get("query")).toBe(value.trim()));
}
async function select(id = 1) {
  await userEvent
    .setup()
    .press(await screen.findByRole("button", { name: `Select: Strategy game ${id}` }));
}
function pickerScroll() {
  const matches = screen.container.queryAll(
    (node) =>
      typeof node.props.onScroll === "function" &&
      typeof node.props.onAccessibilityAction === "function" &&
      node.props.accessibilityActions?.some(
        (action: { name: string }) => action.name === "increment",
      ),
  );
  if (matches.length !== 1)
    throw new Error("Expected one actual native game-list accessibility host");
  return matches[0];
}

it("does not discover the catalog until four characters and debounces/clears the actual search field", async () => {
  await render(<Fixture />);
  await fireEvent.changeText(screen.getByTestId("game-search-input"), "Str");
  expect(requests).toHaveLength(0);
  expect(screen.queryByText("No games found")).toBeNull();
  await search("  Strategy  ");
  expect(await screen.findByText("Strategy game 1")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("collection")).toBe("0");
  expect(requests.at(-1)?.searchParams.get("search")).toBe("1");
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear search" }));
  await waitFor(() => expect(screen.queryByText("Strategy game 1")).toBeNull());
  expect(screen.getByTestId("game-search-input")).toHaveDisplayValue("");
  expect(screen.queryByText("No games found")).toBeNull();
});

it("dispatches one inline selection with canonical metadata and does not mutate the standalone result slot", async () => {
  const onSelect = vi.fn(),
    onClose = vi.fn();
  await render(<Fixture onSelect={onSelect} onClose={onClose} excludeIds={[2]} />);
  await search();
  await select();
  await select();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(page.items[0]);
  expect(screen.queryByText("Strategy game 2")).toBeNull();
  expect(useAppStore.getState().pendingGame).toBeNull();
  expect(boundary.back).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("stores standalone results without optional server-only fields and respects route exclusions", async () => {
  boundary.params.exclude = "2";
  await render(<Fixture />);
  await search();
  await select();
  expect(useAppStore.getState().pendingGame).toEqual({
    slotId: "game-slot",
    game: { id: 1, name: "Strategy game 1", imageUrl: null, year: 2020, average: 8.5, rank: 1 },
  });
  expect(boundary.back).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Select: Strategy game 2" })).toBeNull();
});

it("uses an owned collection without catalog minimum and can switch deliberately to catalog search", async () => {
  account = linked;
  page = { ...page, items: [game(1, "collection")] };
  await render(<Fixture />);
  expect(await screen.findByText("Strategy game 1")).toBeVisible();
  const collection = screen.getByRole("button", { name: "Collection" });
  expect(collection).toBeSelected();
  expect(requests.at(-1)?.searchParams.get("collection")).toBe("1");
  expect(requests.at(-1)?.searchParams.get("query")).toBe("");
  await userEvent.setup().press(collection);
  await waitFor(() => expect(screen.queryByText("Strategy game 1")).toBeNull());
  expect(collection).not.toBeSelected();
  await search("Catalog");
  expect(requests.at(-1)?.searchParams.get("collection")).toBe("0");
  expect(requests.at(-1)?.searchParams.get("search")).toBe("1");
});

it("composes participant and proposal scopes through real source-filter controls", async () => {
  await render(
    <Fixture
      tableScope={{ eventId: "event-one", tableId: "table-one", groupId: "group-one" }}
      proposalScope={{ eventId: "proposal-event", tableId: "proposal-table" }}
    />,
  );
  const participants = screen.getByRole("button", { name: "Participants' collections" });
  expect(participants).not.toBeSelected();
  await userEvent.setup().press(participants);
  expect(await screen.findByText("Strategy game 1")).toBeVisible();
  expect(participants).toBeSelected();
  expect(Object.fromEntries(requests.at(-1)?.searchParams ?? [])).toMatchObject({
    participants: "1",
    search: "0",
    participantEventId: "event-one",
    participantTableId: "table-one",
    proposalEventId: "proposal-event",
    proposalTableId: "proposal-table",
  });
  await userEvent.setup().press(participants);
  await waitFor(() => expect(screen.queryByText("Strategy game 1")).toBeNull());
});

it("keeps genuine empty results distinct from pending reads and recovers both account and picker failures explicitly", async () => {
  accountStatus = 503;
  await render(<Fixture />);
  expect(await screen.findByRole("button", { name: "Search failed. Retry" })).toBeVisible();
  accountStatus = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Search failed. Retry" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Search failed. Retry" })).toBeNull(),
  );
  pickerStatus = 503;
  await search();
  expect(await screen.findByRole("button", { name: "Search failed. Retry" })).toBeVisible();
  expect(screen.queryByText("No games found")).toBeNull();
  pickerStatus = 200;
  page = { ...page, items: [] };
  await userEvent.setup().press(screen.getByRole("button", { name: "Search failed. Retry" }));
  expect(await screen.findByText("No games found")).toBeVisible();
});

it("does not publish an empty state while a real catalog request is pending", async () => {
  let finish: (response: Response) => void = () => {};
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await search();
  expect(screen.queryByText("No games found")).toBeNull();
  expect(screen.queryByRole("button", { name: "Select: Strategy game 1" })).toBeNull();
  await act(() => finish(json(page)));
  expect(await screen.findByText("Strategy game 1")).toBeVisible();
});

it.each([
  { status: 403, error: "Forbidden" },
  { status: 409, error: "BGG_PICKER_CHANGED" },
])(
  "revokes cached game selection after the canonical picker becomes unavailable ($status)",
  async ({ status, error }) => {
    const onSelect = vi.fn();
    await render(<Fixture onSelect={onSelect} />);
    await search();
    await screen.findByText("Strategy game 1");
    pickerStatus = status;
    pickerCode = error;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["bgg-picker", API, "owner"] });
    });
    expect(await screen.findByRole("button", { name: "Search failed. Retry" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Select: Strategy game 1" })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  },
);

it("reveals bounded cached windows through the real list accessibility action without refetching canonical pages", async () => {
  account = linked;
  client.setQueryData(bggAccountQuery(options()).queryKey, account);
  const key = bggPickerQuery({
    ...options(),
    query: "",
    collection: true,
    snapshot: "snapshot-one",
  }).queryKey;
  const cached = {
    pages: [
      {
        items: Array.from({ length: 10 }, (_, index) => game(index + 1, "collection")),
        nextCursor: null,
      },
    ],
    pageParams: [""],
  };
  client.setQueryData(key, cached);
  await render(<Fixture />);
  expect(screen.getByText("Strategy game 1")).toBeVisible();
  expect(screen.queryByText("Strategy game 9")).toBeNull();
  // Capture the native host while it offers increment. Once the last cached
  // window is revealed, removing that accessibility action is correct.
  const list = pickerScroll();
  await fireEvent(list, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
  expect(screen.queryByText("Strategy game 9")).toBeNull();
  expect(requests).toHaveLength(0);
  await fireEvent(list, "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  await measureNativeList(list, { contentHeight: 1200 });
  await measureNativeListCells(list);
  await userEvent.setup().scrollTo(list, {
    y: 700,
    contentSize: { width: 390, height: 1200 },
    layoutMeasurement: { width: 390, height: 500 },
  });
  expect(await screen.findByText("Strategy game 9")).toBeVisible();
  expect(requests).toHaveLength(0);
  expect(client.getQueryData(key)).toBe(cached);
});

it("loads the next canonical page only when the accessible user action asks and retries that failed page", async () => {
  page = { ...page, nextCursor: "page-two" };
  await render(<Fixture />);
  await search();
  await screen.findByText("Strategy game 1");
  expect(requests).toHaveLength(1);
  pickerStatus = 503;
  await fireEvent(pickerScroll(), "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  expect(await screen.findByRole("button", { name: "Search failed. Retry" })).toBeVisible();
  expect(screen.getByText("Strategy game 1")).toBeVisible();
  pickerStatus = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Search failed. Retry" }));
  expect(await screen.findByText("Strategy game 3")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("cursor")).toBe("page-two");
});

it("removes the previous account's collection immediately when the authenticated owner changes", async () => {
  account = linked;
  const view = await render(<Fixture />);
  await screen.findByText("Strategy game 1");
  boundary.userId = "other-owner";
  account = { active: null, pending: null };
  await view.rerender(<Fixture />);
  expect(screen.queryByText("Strategy game 1")).toBeNull();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Collection" })).toBeNull());
  expect(useAppStore.getState().pendingGame).toBeNull();
});

function cachedPicker(
  pageCount: number,
  {
    query = "",
    collection = true,
    snapshot = "snapshot-one",
    sourceEpoch = "source-one",
    start = 1,
  } = {},
) {
  const key = bggPickerQuery({ ...options(), query, collection, snapshot }).queryKey;
  const data: InfiniteData<BggPickerResponse, string> = {
    pages: Array.from({ length: pageCount }, (_, index) => ({
      items: Array.from({ length: 25 }, (_, offset) =>
        game(start + index * 25 + offset, collection ? "collection" : "search"),
      ),
      sourceEpoch,
      nextCursor: index + 1 === pageCount ? null : `retained-${index + 1}`,
    })),
    pageParams: Array.from({ length: pageCount }, (_, index) => (index ? `retained-${index}` : "")),
  };
  const stored = client.setQueryData(key, data);
  if (!stored) throw new Error("Expected the canonical picker cache receipt");
  return { key, data: stored };
}
function ownedCollection() {
  account = linked;
  client.setQueryData(bggAccountQuery(options()).queryKey, account);
}
const increment = { nativeEvent: { actionName: "increment" } };
const queuedBottomScroll = {
  timeStamp: 1000,
  nativeEvent: {
    contentSize: { width: 390, height: 2400 },
    layoutMeasurement: { width: 390, height: 500 },
    contentOffset: { x: 0, y: 1900 },
    zoomScale: 1,
  },
};
function mountedChoices() {
  return screen.queryAllByRole("button", { name: /^Select: Strategy game / });
}
async function showSecondChunk() {
  const list = pickerScroll();
  await fireEvent.scroll(list, {
    ...queuedBottomScroll,
    nativeEvent: { ...queuedBottomScroll.nativeEvent, contentOffset: { x: 0, y: 0 } },
  });
  // Coalesce two native accessibility events delivered before the React commit.
  const deliver = list.props.onAccessibilityAction;
  await act(() => {
    deliver(increment);
    deliver(increment);
  });
  await measureNativeList(list, { contentHeight: 2400 });
  await measureNativeListCells(list);
  // Lay out the genuine virtualized window away from its end; do not invent a
  // second end gesture just to mount the rows revealed by accessibility.
  await userEvent.setup().scrollTo(list, {
    y: 100,
    contentSize: { width: 390, height: 2400 },
    layoutMeasurement: { width: 390, height: 500 },
  });
  await waitFor(() => expect(mountedChoices()).toHaveLength(16));
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
}
async function observeCachedSearch(query: string) {
  await fireEvent.changeText(screen.getByTestId("game-search-input"), query);
  await waitFor(() => {
    const key = bggPickerQuery({
      ...options(),
      query,
      collection: true,
      snapshot: "snapshot-one",
    }).queryKey;
    expect(
      client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount(),
    ).toBeGreaterThan(0);
  });
}

it.each([1, 10, 40])(
  "reenters %s retained canonical pages with eight real rows and reveals only one requested chunk",
  async (pageCount) => {
    ownedCollection();
    const cached = cachedPicker(pageCount);
    const first = await render(<Fixture />);
    expect(mountedChoices()).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Select: Strategy game 1" })).toHaveStyle({
      minWidth: 44,
      minHeight: 44,
    });
    const list = pickerScroll();
    await measureNativeList(list, { contentHeight: 2400 });
    await measureNativeListCells(list);
    await fireEvent.scroll(list, queuedBottomScroll);
    expect(mountedChoices()).toHaveLength(8);
    expect(screen.queryByText("Strategy game 9")).toBeNull();
    await showSecondChunk();
    expect(screen.getByRole("button", { name: "Select: Strategy game 16" })).toBeOnTheScreen();
    expect(screen.queryByText("Strategy game 17")).toBeNull();
    expect(client.getQueryData(cached.key)).toBe(cached.data);
    expect(cached.data.pages).toHaveLength(pageCount);
    await first.unmount();
    await render(<Fixture />);
    expect(mountedChoices()).toHaveLength(8);
    expect(screen.queryByText("Strategy game 9")).toBeNull();
    expect(client.getQueryData(cached.key)).toBe(cached.data);
    expect(requests).toHaveLength(0);
  },
);

it("does not mistake an excluded first cached page for empty and offers genuine accessible progress", async () => {
  ownedCollection();
  const cached = cachedPicker(2);
  const firstPageIds = cached.data.pages[0].items.map((item) => item.id);
  const view = await render(<Fixture excludeIds={firstPageIds} />);
  const searchHost = screen.getByTestId("game-search-input");
  expect(mountedChoices()).toHaveLength(0);
  expect(screen.queryByText("No games found")).toBeNull();
  for (let chunk = 0; chunk < 4; chunk++) {
    await fireEvent(pickerScroll(), "accessibilityAction", increment);
    expect(screen.queryByText("No games found")).toBeNull();
  }
  expect(await screen.findByText("Strategy game 26")).toBeVisible();
  expect(screen.getByTestId("game-search-input")).toBe(searchHost);
  await view.rerender(
    <Fixture
      excludeIds={cached.data.pages.flatMap((entry) => entry.items.map((item) => item.id))}
    />,
  );
  for (let chunk = 0; chunk < 3; chunk++)
    await fireEvent(pickerScroll(), "accessibilityAction", increment);
  expect(await screen.findByText("No games found")).toBeVisible();
  expect(mountedChoices()).toHaveLength(0);
  expect(screen.getByTestId("game-search-input")).toBe(searchHost);
  expect(client.getQueryData(cached.key)).toBe(cached.data);
  expect(requests).toHaveLength(0);
});

it.each(["snapshot", "filter", "search", "sourceEpoch"] as const)(
  "resets a revealed real list after %s changes while retaining search and rejecting queued old host events",
  async (change) => {
    ownedCollection();
    cachedPicker(2);
    const initial = cachedPicker(2, { query: "Strategy" });
    const onSelect = vi.fn();
    await render(<Fixture onSelect={onSelect} />);
    await observeCachedSearch("Strategy");
    const searchHost = screen.getByTestId("game-search-input");
    await showSecondChunk();
    const oldList = pickerScroll();
    // Native event delivery may retain the old public ScrollView callbacks.
    // Capture the real SDK ports, never an extracted application/hook function.
    const oldIncrement = oldList.props.onAccessibilityAction;
    const oldScroll = oldList.props.onScroll;
    const freshOptions = {
      query: change === "search" ? "Different" : "Strategy",
      snapshot: change === "snapshot" ? "snapshot-two" : "snapshot-one",
      collection: change !== "filter",
      sourceEpoch: change === "sourceEpoch" ? "source-two" : "source-one",
      start: 101,
    };
    let fresh!: ReturnType<typeof cachedPicker>;
    await act(() => {
      fresh = cachedPicker(2, freshOptions);
      if (change === "snapshot") {
        if (!account.active) throw new Error("Expected the owned linked collection");
        account = { ...account, active: { ...account.active, snapshot: "snapshot-two" } };
        client.setQueryData(bggAccountQuery(options()).queryKey, account);
      }
    });
    if (change === "filter")
      await userEvent.setup().press(screen.getByRole("button", { name: "Collection" }));
    if (change === "search") {
      await fireEvent.changeText(searchHost, "Different");
    }
    await screen.findByText("Strategy game 101");
    expect(mountedChoices()).toHaveLength(8);
    expect(screen.queryByText("Strategy game 9")).toBeNull();
    expect(screen.getByTestId("game-search-input")).toBe(searchHost);
    expect(searchHost).toHaveDisplayValue(change === "search" ? "Different" : "Strategy");
    await act(() => {
      oldIncrement(increment);
      oldScroll(queuedBottomScroll);
    });
    expect(mountedChoices()).toHaveLength(8);
    expect(screen.queryByText("Strategy game 109")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(client.getQueryData(fresh.key)).toBe(fresh.data);
    if (change !== "sourceEpoch") expect(client.getQueryData(initial.key)).toBe(initial.data);
    expect(requests).toHaveLength(0);
    await select(101);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(fresh.data.pages[0].items[0]);
  },
);

it("disconnects pending native accessibility and scroll delivery after actual unmount without expanding or fetching cached data", async () => {
  ownedCollection();
  const cached = cachedPicker(2);
  const onSelect = vi.fn();
  const view = await render(<Fixture onSelect={onSelect} />);
  await showSecondChunk();
  const list = pickerScroll();
  const oldIncrement = list.props.onAccessibilityAction;
  const oldScroll = list.props.onScroll;
  await view.unmount();
  await act(() => {
    oldIncrement(increment);
    oldScroll(queuedBottomScroll);
  });
  expect(onSelect).not.toHaveBeenCalled();
  expect(requests).toHaveLength(0);
  expect(boundary.back).not.toHaveBeenCalled();
  expect(useAppStore.getState().pendingGame).toBeNull();
  expect(client.getQueryData(cached.key)).toBe(cached.data);
  await render(<Fixture onSelect={onSelect} />);
  expect(mountedChoices()).toHaveLength(8);
  expect(screen.queryByText("Strategy game 9")).toBeNull();
});

it("makes all returned catalog choices selectable when the standalone route has no exclusions", async () => {
  boundary.params.exclude = undefined;
  await render(<Fixture />);
  await search();
  expect(await screen.findByRole("button", { name: "Select: Strategy game 1" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Select: Strategy game 2" })).toBeEnabled();
  await select(2);
  expect(boundary.back).toHaveBeenCalledOnce();
});
