// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { Widget } from "./Widget";

const host = vi.hoisted(() => {
  const bridge = {
    ontoolinput: (_input: unknown) => {},
    ontoolresult: (_result: unknown) => {},
    ontoolcancelled: () => {},
    onteardown: async () => ({}),
    onhostcontextchanged: (_context: unknown) => {},
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    openLink: vi.fn(async () => ({})),
    getHostContext: vi.fn(() => ({
      locale: "en",
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline"],
    })),
    requestDisplayMode: vi.fn(async () => ({ mode: "fullscreen" })),
    callServerTool: vi.fn(),
  };
  return bridge;
});

vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: vi.fn(function App() {
    return host;
  }),
}));

const firstTableId = "46d59b46-969b-4b03-99a8-525d1e96d222";
const secondTableId = "8d8015c1-2797-4188-a8d1-5358faa9c9d1";
const eventId = "fd82f631-a33c-49db-adba-dc63526ecaf6";
const groupId = "70f48c08-821b-4e1a-9ee6-9efa2e3afe19";
const historyTable = (id: string, name: string) => ({
  ...plannedTable,
  id,
  eventId,
  name,
  eventName: "Game night",
  eventStatus: "TERMINATED" as const,
  confirmed: { gameId: 1, startsAt: "2026-11-23T02:00:00.000Z", playerIds: ["owner", "player"] },
});
const response = (operation: string, data: unknown) => ({ structuredContent: { operation, data } });

beforeEach(() => {
  Element.prototype.getAnimations ??= () => [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  host.callServerTool.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function open(operation: string, data: unknown, input?: unknown) {
  const view = render(<Widget />);
  await waitFor(() => expect(host.connect).toHaveBeenCalledTimes(1));
  act(() => {
    host.ontoolinput({ arguments: input });
    host.ontoolresult(response(operation, data));
  });
  return view;
}

it("browses a table inside the widget and returns to the same filtered, paged history", async () => {
  const first = { ...historyTable(firstTableId, "Hegemony"), groupName: "Dice Club", groupId };
  const query = { section: "mine", query: "night", limit: 10 };
  const second = historyTable(secondTableId, "Ark Nova");
  host.callServerTool
    .mockResolvedValueOnce(
      response("list_table_history", { items: [first, second], nextCursor: null }),
    )
    .mockResolvedValueOnce(response("get_table", first));
  await open("list_table_history", { items: [first], nextCursor: "cursor" }, { query });
  expect(screen.getByText("Hegemony")).toBeTruthy();
  expect(screen.getByText("Dice Club")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Tables" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more tables" }));
  expect(await screen.findByText("Ark Nova")).toBeTruthy();
  expect(screen.getAllByText("Hegemony")).toHaveLength(1);
  expect(host.callServerTool).toHaveBeenCalledWith(
    { name: "list_table_history", arguments: { query: { ...query, cursor: "cursor" } } },
    { signal: expect.any(AbortSignal) },
  );
  expect(screen.queryByRole("button", { name: "Load more tables" })).toBeNull();
  const trigger = screen.getByRole("button", { name: "Open table: Hegemony" });
  host.getHostContext.mockReturnValueOnce({
    locale: "en",
    theme: "light",
    displayMode: "inline",
    availableDisplayModes: ["inline", "fullscreen"],
  });
  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole("heading", { name: "Hegemony" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Results" })).toBeVisible();
  expect(host.requestDisplayMode).toHaveBeenNthCalledWith(1, { mode: "fullscreen" });
  expect(screen.getByText("Ark Nova")).not.toBeVisible();
  expect(host.callServerTool).toHaveBeenLastCalledWith(
    { name: "get_table", arguments: { params: { eventId, tableId: firstTableId } } },
    { signal: expect.any(AbortSignal) },
  );
  expect(host.openLink).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("Ark Nova")).toBeVisible();
  expect(trigger).toHaveFocus();
  expect(host.requestDisplayMode).toHaveBeenNthCalledWith(2, { mode: "inline" });
  expect(host.callServerTool).toHaveBeenCalledTimes(2);
});

it("follows an event to its tables and their group, keeping every section in the widget", async () => {
  const event = { ...plannedEvent, id: eventId, groupId, groupName: "Dice Club" };
  const table = { ...historyTable(firstTableId, "Hegemony"), groupId, groupName: "Dice Club" };
  host.callServerTool
    .mockResolvedValueOnce(response("get_event", event))
    .mockResolvedValueOnce(response("list_event_tables", { items: [table], nextCursor: null }))
    .mockResolvedValueOnce(response("get_table", table))
    .mockResolvedValueOnce(response("get_group", { ...groupRecord, id: groupId }));
  await open("list_events", { items: [event], nextCursor: null });
  fireEvent.click(screen.getByRole("button", { name: `Open event: ${event.name}` }));
  fireEvent.click(await screen.findByRole("tab", { name: "Tables" }));
  const openTable = await screen.findByRole("button", { name: "Open table: Hegemony" });
  openTable.focus();
  fireEvent.click(openTable);
  fireEvent.click(await screen.findByRole("button", { name: "Dice Club" }));
  expect(await screen.findByRole("heading", { name: groupRecord.name })).toBeVisible();
  expect(screen.getByRole("tablist", { name: "Group sections" })).toBeVisible();
  expect(host.callServerTool.mock.calls.map(([call]) => call)).toEqual([
    { name: "get_event", arguments: { params: { eventId } } },
    { name: "list_event_tables", arguments: { params: { eventId } } },
    { name: "get_table", arguments: { params: { eventId, tableId: firstTableId } } },
    { name: "get_group", arguments: { params: { groupId } } },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("heading", { name: "Hegemony" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("tab", { name: "Tables" })).toHaveAttribute("aria-selected", "true");
  expect(openTable).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("heading", { name: "Events" })).toBeVisible();
  expect(host.openLink).not.toHaveBeenCalled();
}, 15_000);

it("loads permitted group tabs on demand and retries a failed panel without leaving the detail", async () => {
  host.callServerTool
    .mockResolvedValueOnce({ isError: true, structuredContent: { status: 403 } })
    .mockResolvedValueOnce(response("list_group_members", { items: [], nextCursor: null }))
    .mockResolvedValueOnce(
      response("list_group_leaderboard", { games: [], players: [], nextCursor: null }),
    );
  await open("get_group", {
    ...groupRecord,
    id: groupId,
    canViewMembers: true,
    canViewEvents: false,
    canViewRankings: true,
  });
  expect(host.callServerTool).not.toHaveBeenCalled();
  expect(screen.queryByRole("tab", { name: "Events" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No participants yet")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Rankings" }));
  await waitFor(() =>
    expect(host.callServerTool).toHaveBeenLastCalledWith(
      { name: "list_group_leaderboard", arguments: { params: { groupId } } },
      { signal: expect.any(AbortSignal) },
    ),
  );
  expect(screen.getByRole("heading", { name: groupRecord.name })).toBeVisible();
});

it("loads event participants for the current view and keeps private projections scoped", async () => {
  host.callServerTool.mockResolvedValueOnce(
    response("list_event_participants", { items: [], nextCursor: null }),
  );
  await open("get_event", { ...plannedEvent, id: eventId, canManage: true });
  fireEvent.click(screen.getByRole("tab", { name: "Participants" }));
  expect(await screen.findByText("No participants yet")).toBeVisible();
  expect(host.callServerTool).toHaveBeenCalledWith(
    {
      name: "list_event_participants",
      arguments: { params: { eventId }, query: { view: "review" } },
    },
    { signal: expect.any(AbortSignal) },
  );
  act(() =>
    host.ontoolresult(
      response("get_event", { ...plannedEvent, personalAccessOnly: true, readOnly: true }),
    ),
  );
  expect(screen.queryByRole("tab", { name: "Participants" })).not.toBeInTheDocument();
  expect(
    screen.getByText("Personal access to your table. Group details are hidden."),
  ).toBeVisible();
});

it("switches between a table's authorized participants and confirmed results", async () => {
  const table = { ...historyTable(firstTableId, "Hegemony"), eventStatus: "CONFIRMED" };
  host.callServerTool
    .mockResolvedValueOnce(response("list_table_seats", { items: [], nextCursor: null }))
    .mockResolvedValueOnce(
      response("list_table_leaderboard", {
        gameId: 1,
        scope: "GLOBAL",
        items: [],
        nextCursor: null,
      }),
    );
  await open("get_table", table);
  fireEvent.click(screen.getByRole("tab", { name: "Participants" }));
  expect(await screen.findByText("No participants yet")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Results" }));
  await waitFor(() =>
    expect(host.callServerTool).toHaveBeenLastCalledWith(
      { name: "list_table_leaderboard", arguments: { params: { eventId, tableId: firstTableId } } },
      { signal: expect.any(AbortSignal) },
    ),
  );
  act(() =>
    host.ontoolresult(
      response("get_table", { ...table, eventStatus: "TERMINATED", sharedResultsOnly: true }),
    ),
  );
  expect(screen.queryByRole("tab", { name: "Participants" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Results" }));
  expect(await screen.findByRole("heading", { name: "Chess" })).toBeVisible();
});

it("shows an empty history, then applies the host language and theme", async () => {
  await open("list_table_history", { items: [], nextCursor: null });
  expect(screen.getByText("No tables found")).toBeTruthy();
  act(() => host.onhostcontextchanged({ locale: "it-IT", theme: "dark" }));
  expect(document.documentElement.lang).toBe("it");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.queryByText("No tables found")).toBeNull();
});

it("opens a group draft without writing and retries the same request after the user submits", async () => {
  host.callServerTool
    .mockResolvedValueOnce({ isError: true, content: [], structuredContent: { status: 400 } })
    .mockResolvedValueOnce(response("create_group", { id: groupId, name: "Friday games" }));
  await open("prepare_group_creation", {});
  const submit = screen.getByRole<HTMLButtonElement>("button", { name: "Create group" });
  expect(submit.disabled).toBe(true);
  expect(host.callServerTool).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), {
    target: { value: "Friday games" },
  });
  fireEvent.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not create group");
  fireEvent.click(submit);
  expect(await screen.findByText("Group created")).toBeTruthy();
  expect(host.callServerTool).toHaveBeenCalledTimes(2);
  expect(host.callServerTool.mock.calls[0]).toEqual(host.callServerTool.mock.calls[1]);
  expect(host.callServerTool.mock.calls[0]?.[0]).toMatchObject({
    name: "create_group",
    arguments: {
      body: {
        type: "PRIVATE",
        name: "Friday games",
        invitedUserIds: [],
        clientRequestId: expect.any(String),
      },
    },
  });
  expect(screen.getByRole("button", { name: "Open group" })).toBeTruthy();
});

it("requires a logo and canonical venue before a public group can be saved", async () => {
  await open("prepare_group_creation", { type: "PUBLIC", name: "Public club" });
  expect(
    screen.getByText(
      "Public groups require a logo, verified venue and approval. Group type cannot be changed.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create group" }).disabled).toBe(
    true,
  );
  expect(host.callServerTool).not.toHaveBeenCalled();
});

it("renders an account-safe overview of structured output from another BGO feature", async () => {
  await open("list_group_rankings", {
    players: [{ name: "Player", username: "player", gamesWon: 3, email: "private@example.com" }],
    games: [],
  });
  expect(screen.getByRole("heading", { name: "Rankings" })).toBeTruthy();
  expect(screen.getByText("@player")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.queryByText("private@example.com")).toBeNull();
});

it("uploads a bounded logo and chooses a verified provider venue before creating a public group", async () => {
  const assetId = "630553c1-45fe-4851-bf2f-8ba157b52a63";
  const address = "Via Roma 10, Roma, Italia";
  const location = {
    id: "address.003",
    address,
    longitude: 12.5,
    latitude: 41.9,
    timeZone: "Europe/Rome",
  };
  const upload = new File(["logo"], "group.png", { type: "image/png" });
  vi.spyOn(upload, "slice").mockReturnValue({
    arrayBuffer: async () => new Uint8Array([108, 111, 103, 111]).buffer,
  } as Blob);
  host.callServerTool
    .mockResolvedValueOnce(response("search_locations", { items: [location] }))
    .mockResolvedValueOnce(response("start_group_logo", { id: assetId }))
    .mockResolvedValueOnce(response("upload_group_logo_chunk", {}))
    .mockResolvedValueOnce(response("complete_group_logo", { id: assetId }))
    .mockResolvedValueOnce(
      response("create_group", { id: groupId, name: "Public club", reviewStatus: "PENDING" }),
    );
  const view = await open("prepare_group_creation", { name: "Public club", type: "PUBLIC" });
  fireEvent.change(screen.getByRole("textbox", { name: "Group venue" }), {
    target: { value: "Via Roma" },
  });
  fireEvent.click(await screen.findByRole("button", { name: address }));
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: "Club venue" },
  });
  const file = view.container.querySelector('input[type="file"]');
  if (!file) throw new Error("Missing logo file input");
  fireEvent.change(file, { target: { files: [upload] } });
  expect(await screen.findByText("group.png")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
  expect(await screen.findByText("Pending")).toBeTruthy();
  expect(host.callServerTool).toHaveBeenNthCalledWith(
    3,
    {
      name: "upload_group_logo_chunk",
      arguments: { params: { assetId }, body: { offset: 0, base64: "bG9nbw==" } },
    },
    expect.anything(),
  );
  expect(host.callServerTool).toHaveBeenLastCalledWith(
    {
      name: "create_group",
      arguments: {
        body: {
          clientRequestId: expect.any(String),
          type: "PUBLIC",
          name: "Public club",
          invitedUserIds: [],
          logoAssetId: assetId,
          location: {
            ...location,
            name: "Club venue",
            id: expect.stringMatching(/^[a-f0-9-]{36}$/),
          },
        },
      },
    },
    expect.anything(),
  );
});

it("retries an interrupted history page and stops when the cursor no longer advances", async () => {
  const item = historyTable(firstTableId, "Hegemony");
  host.callServerTool
    .mockRejectedValueOnce(new Error("host disconnected"))
    .mockResolvedValueOnce(
      response("list_table_history", { items: [item], nextCursor: "page-two" }),
    );
  await open("list_table_history", { items: [item], nextCursor: "page-two" });
  fireEvent.click(screen.getByRole("button", { name: "Load more tables" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load tables");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Load more tables" })).toBeNull(),
  );
  expect(screen.getAllByText("Hegemony")).toHaveLength(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps the history reusable after the user backs out of an unsuccessful table read", async () => {
  host.callServerTool.mockResolvedValueOnce({ isError: true, structuredContent: { status: 403 } });
  await open("list_table_history", {
    items: [historyTable(firstTableId, "Hegemony")],
    nextCursor: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Open table: Hegemony" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("Hegemony")).toBeVisible();
});

it("cancels a pending destination on Back and ignores a late tool response", async () => {
  const { promise, resolve } = Promise.withResolvers<ReturnType<typeof response>>();
  host.callServerTool.mockReturnValueOnce(promise);
  await open("list_table_history", {
    items: [historyTable(firstTableId, "Hegemony")],
    nextCursor: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Open table: Hegemony" }));
  expect(screen.getByLabelText("Loading…")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(host.callServerTool.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => resolve(response("get_table", historyTable(firstTableId, "Hegemony"))));
  expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
  expect(screen.queryByRole("tablist", { name: "Table sections" })).toBeNull();
});

it("drops prior views if navigation returns data from a different viewer", async () => {
  await open("list_table_history", { items: [], nextCursor: null });
  act(() =>
    host.ontoolresult({
      ...response("list_table_history", {
        items: [historyTable(firstTableId, "Private table")],
        nextCursor: null,
      }),
      _meta: { viewerUserId: "user_old" },
    }),
  );
  host.callServerTool.mockResolvedValueOnce({
    ...response("get_table", historyTable(firstTableId, "Authorized table")),
    _meta: { viewerUserId: "user_new" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open table: Private table" }));
  expect(await screen.findByText("Authorized table")).toBeVisible();
  expect(screen.queryByText("Private table")).toBeNull();
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
});

it("shows a cancelled tool error instead of leaving the widget on its loading state", async () => {
  render(<Widget />);
  await waitFor(() => expect(host.connect).toHaveBeenCalledTimes(1));
  act(() => host.ontoolcancelled());
  expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
});

it("offers retry when venue search fails and shows a separate empty result", async () => {
  host.callServerTool
    .mockRejectedValueOnce(new Error("provider offline"))
    .mockResolvedValueOnce(response("search_locations", { items: [] }));
  await open("prepare_group_creation", { type: "PUBLIC", name: "Public club" });
  fireEvent.change(screen.getByRole("textbox", { name: "Group venue" }), {
    target: { value: "Via Roma" },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No addresses found")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.queryByText("No addresses found")).toBeNull();
});

it("rejects non-image uploads before contacting BGO", async () => {
  await open("prepare_group_creation", { name: "Friday games" });
  fireEvent.change(screen.getByLabelText("Group logo"), {
    target: { files: [new File(["text"], "invalid.txt", { type: "text/plain" })] },
  });
  expect(await screen.findByText("Could not upload logo")).toBeVisible();
  expect(host.callServerTool).not.toHaveBeenCalled();
});

it("renders suitable summaries for event data, empty lists and action receipts", async () => {
  await open("list_event_proposals", {
    items: [
      { name: "Game night", status: "CONFIRMED", groupName: "Dice Club" },
      { status: "ARCHIVED", username: "@guest", description: "Historical result" },
    ],
  });
  expect(screen.getByRole("heading", { name: "Events" })).toBeVisible();
  expect(screen.getByText("Confirmed")).toBeVisible();
  expect(screen.getByText("Dice Club")).toBeVisible();
  expect(screen.getByText("@guest")).toBeVisible();
  expect(screen.queryByText("ARCHIVED")).toBeNull();
  act(() =>
    host.ontoolresult(
      response("list_notifications", { notifications: [], unreadCount: 0, nextCursor: null }),
    ),
  );
  expect(screen.getByText("No notifications yet")).toBeVisible();
  act(() => host.ontoolresult(response("delete_favorite_location", null)));
  expect(screen.getByText("Operation completed")).toBeVisible();
  act(() => host.ontoolresult(response("claim_invite", "Invitation claimed")));
  expect(screen.getByText("Invitation claimed")).toBeVisible();
});

it("recovers after an invalid result and renders a group created directly by a tool call", async () => {
  render(<Widget />);
  await waitFor(() => expect(host.connect).toHaveBeenCalledTimes(1));
  act(() => host.ontoolresult({ structuredContent: { operation: "create_group" } }));
  expect(screen.getByRole("alert")).toBeVisible();
  act(() => host.ontoolresult(response("create_group", { id: groupId, name: "Friday games" })));
  expect(screen.getByText("Group created")).toBeVisible();
  expect(screen.getByRole("button", { name: "Open group" })).toBeVisible();
  act(() => host.ontoolresult(response("create_group", { name: "Friday games" })));
  expect(screen.getByText("Friday games")).toBeVisible();
  expect(screen.queryByText("Group created")).toBeNull();
});

it("reports a host connection failure rather than waiting indefinitely for a result", async () => {
  host.connect.mockRejectedValueOnce(new Error("incompatible host"));
  render(<Widget />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
});

it("keeps a group creation with an uncertain result from being submitted twice", async () => {
  host.callServerTool.mockRejectedValueOnce(new Error("host did not receive a receipt"));
  await open("prepare_group_creation", { name: "Friday games" });
  const create = screen.getByRole("button", { name: "Create group" });
  fireEvent.click(create);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check your groups before trying again",
  );
  expect(create).toBeDisabled();
  expect(screen.getByRole("button", { name: "Groups" })).toBeVisible();
  expect(host.callServerTool).toHaveBeenCalledTimes(1);
});

it("uses BGO game rows, metadata popovers and attribution for collection results", async () => {
  const game = {
    id: 1,
    name: "Hegemony",
    imageUrl: null,
    year: 2023,
    average: 8.4,
    rank: 12,
    categories: ["Economic"],
  };
  const args = { query: { snapshot: "collection-snapshot", query: "hege", limit: 20 } };
  host.callServerTool.mockResolvedValueOnce(
    response("list_bgg_collection", {
      items: [{ ...game, id: 2, name: "Ark Nova" }],
      nextCursor: null,
    }),
  );
  await open("list_bgg_collection", { items: [game], nextCursor: "more" }, args);
  fireEvent.click(screen.getByRole("button", { name: "Game information: Hegemony" }));
  const category = await screen.findByText("Economic");
  expect(category).toBeVisible();
  expect(screen.getByText("#12")).toBeVisible();
  fireEvent.keyDown(category, { key: "Escape" });
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Ark Nova")).toBeVisible();
  expect(host.callServerTool).toHaveBeenLastCalledWith(
    { name: "list_bgg_collection", arguments: { query: { ...args.query, cursor: "more" } } },
    expect.anything(),
  );
  fireEvent.click(screen.getByRole("link", { name: "Powered by BGG — open BoardGameGeek" }));
  await waitFor(() =>
    expect(host.openLink).toHaveBeenCalledWith({ url: "https://boardgamegeek.com" }),
  );
});

it("renders the game detail tool and reports malformed game-list data", async () => {
  await open("get_bgg_games", { id: 2, name: "Hegemony", imageUrl: null, year: 2023 });
  expect(screen.getByRole("button", { name: "Game information: Hegemony" })).toBeVisible();
  act(() => host.ontoolresult(response("search_bgg_games", { items: [] })));
  expect(screen.getByText("No games found")).toBeVisible();
  act(() => host.ontoolresult(response("search_bgg_games", { items: [{}] })));
  expect(screen.getByRole("alert")).toBeVisible();
});

it("reuses BGO location rows for search and a verified saved favorite", async () => {
  const location = {
    id: groupId,
    name: "Dice Club",
    address: "Via Roma 10, Roma, Italia",
    longitude: 12.5,
    latitude: 41.9,
    timeZone: "Europe/Rome",
  };
  await open("search_locations", {
    items: [{ id: "provider.address", address: location.address }],
  });
  expect(screen.getByRole("heading", { name: "Locations" })).toBeVisible();
  expect(screen.getAllByText(/Via Roma 10/).length).toBeGreaterThan(0);
  act(() =>
    host.ontoolresult(response("save_favorite_location", { item: { key: "place", location } })),
  );
  expect(screen.getByText("Dice Club")).toBeVisible();
  act(() => host.ontoolresult(response("search_locations", { items: [] })));
  expect(screen.getByText("No addresses found")).toBeVisible();
});

it("shows the real BGO invite link card and copies the link after a click", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const link = "https://api.example.test/invite/abc-def";
  await open("create_invite", { link });
  expect(screen.getByText(link)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(await screen.findByRole("button", { name: "Copied!" })).toBeVisible();
  expect(writeText).toHaveBeenCalledWith(link);
});

it("batches visible BGG metadata and reuses the original badge retry action", async () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    },
  );
  const games = [
    { id: 1, name: "Hegemony", imageUrl: null, year: 2023 },
    { id: 2, name: "Azul", imageUrl: null, year: 2017 },
  ];
  host.callServerTool
    .mockRejectedValueOnce(Error("catalog offline"))
    .mockResolvedValueOnce(
      response("get_bgg_games", { items: [{ ...games[0], categories: ["Economic"] }] }),
    );
  await open("search_bgg_games", { items: games });
  fireEvent.click(screen.getByRole("button", { name: "Game information: Hegemony" }));
  expect(await screen.findByText("Could not load game information")).toBeVisible();
  expect(host.callServerTool).toHaveBeenNthCalledWith(
    1,
    { name: "get_bgg_games", arguments: { query: { ids: "1,2" } } },
    expect.anything(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Economic")).toBeVisible();
  expect(host.callServerTool).toHaveBeenNthCalledWith(
    2,
    { name: "get_bgg_games", arguments: { query: { ids: "1" } } },
    expect.anything(),
  );
});

it("shows temporary favorite location paging feedback and preserves results on failure", async () => {
  const place = {
    id: groupId,
    name: "Dice Club",
    address: "Via Roma 10",
    longitude: 12.5,
    latitude: 41.9,
    timeZone: "Europe/Rome",
  };
  let reject: (error: Error) => void = () => {};
  host.callServerTool
    .mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValueOnce(response("list_favorite_locations", { items: [], nextCursor: null }));
  await open(
    "list_favorite_locations",
    { items: [{ key: "place", location: place }], nextCursor: "next" },
    { query: { limit: 10 } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(host.callServerTool).toHaveBeenCalledWith(
      { name: "list_favorite_locations", arguments: { query: { limit: 10, cursor: "next" } } },
      expect.anything(),
    ),
  );
  expect(screen.getByLabelText("Loading…")).toBeInTheDocument();
  act(() => reject(Error("host offline")));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByText("Dice Club")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  act(() => host.ontoolresult(response("search_locations", { items: [{ address: 5 }] })));
  expect(screen.getByRole("alert")).toBeVisible();
});

it("reports an unavailable BoardGameGeek link without hiding the search result", async () => {
  host.openLink.mockRejectedValueOnce(Error("host refused attribution link"));
  await open("search_bgg_games", { items: [{ id: 2, name: "Azul", imageUrl: null, year: 2017 }] });
  fireEvent.click(screen.getByRole("link", { name: "Powered by BGG — open BoardGameGeek" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByText("Azul")).toBeVisible();
});

it("opens the saved group inside the widget after retrying an unsuccessful read", async () => {
  host.callServerTool
    .mockResolvedValueOnce({ isError: true })
    .mockResolvedValueOnce(
      response("get_group", { ...groupRecord, id: groupId, name: "Dice Club" }),
    );
  await open("create_group", { id: groupId, name: "Dice Club" });
  fireEvent.click(screen.getByRole("button", { name: "Open group" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Dice Club" });
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(host.callServerTool).toHaveBeenCalledTimes(2);
  expect(host.openLink).not.toHaveBeenCalled();
});

it("replaces an account's result when the host switches viewer and stops processing after teardown", async () => {
  await open("list_table_history", { items: [], nextCursor: null });
  act(() =>
    host.ontoolresult({
      ...response("list_table_history", {
        items: [historyTable(firstTableId, "Private table")],
        nextCursor: null,
      }),
      _meta: { viewerUserId: "first" },
    }),
  );
  expect(screen.getByText("Private table")).toBeVisible();
  act(() =>
    host.ontoolresult({
      ...response("list_table_history", { items: [], nextCursor: null }),
      _meta: { viewerUserId: "other" },
    }),
  );
  expect(screen.queryByText("Private table")).toBeNull();
  expect(screen.getByText("No tables found")).toBeVisible();
  await act(async () => {
    await host.onteardown();
  });
  act(() => {
    host.ontoolcancelled();
    host.ontoolresult(
      response("list_table_history", {
        items: [historyTable(firstTableId, "Stale table")],
        nextCursor: null,
      }),
    );
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Stale table")).toBeNull();
});

it("lets the user resubmit when a requested write was stopped by the OAuth challenge", async () => {
  host.callServerTool
    .mockResolvedValueOnce({
      isError: true,
      _meta: { "mcp/www_authenticate": ['Bearer scope="bgo:write"'] },
    })
    .mockResolvedValueOnce(response("create_group", { id: groupId, name: "Friday games" }));
  await open("prepare_group_creation", { name: "Friday games" });
  const create = screen.getByRole("button", { name: "Create group" });
  fireEvent.click(create);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not create group");
  expect(create).toBeEnabled();
  fireEvent.click(create);
  expect(await screen.findByText("Group created")).toBeVisible();
});
