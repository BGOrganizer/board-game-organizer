// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  eventId,
  groupRecord,
  optionId,
  plannedEvent,
  plannedTable,
  tableId,
} from "@/test-fixtures/eventRecords";
import { messages } from "../../../../messages/en";
import { isRecordResultOperation, RecordResults, readRecordDetail } from "./RecordResults";
import { WidgetNavigation } from "./WidgetNavigation";

const openLink = vi.fn(async () => ({}));
const callServerTool = vi.fn();
const app = {
  openLink,
  callServerTool,
  getHostContext: () => ({ displayMode: "inline" }),
} as unknown as App;
const i18n = setupI18n({ locale: "en", messages: { en: messages } });
const pages = <T,>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });
const renderResult = (operation: string, data: unknown, input?: unknown) =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RecordResults
          app={app}
          operation={operation}
          data={data}
          input={input}
          viewerUserId="host-user"
          renderGameRow={(game) => <p>{game.name}</p>}
        />
      </QueryClientProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });
  openLink.mockResolvedValue({});
  callServerTool.mockReset();
});
afterEach(() => {
  cleanup();
  openLink.mockClear();
});

it("reuses the event artwork, facts and control popovers with only the host handling navigation", async () => {
  const event = { ...plannedEvent, groupId: optionId, groupName: "Friday group" };
  const view = renderResult("list_events", pages([event]), { query: { groupId: optionId } });
  expect(view.container.querySelector('[data-artwork-kind="events"]')).toBeTruthy();
  expect(screen.getByText("Friday group")).toBeTruthy();
  expect(screen.getByText("1 Table")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Private event" }));
  expect(await screen.findByText(/Participation is limited/)).toBeTruthy();
  expect(openLink).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Open event: Friday games" }));
  await waitFor(() =>
    expect(openLink).toHaveBeenCalledWith({
      url: expect.stringMatching(new RegExp(`/events/${eventId}\\?fromGroup=${optionId}$`)),
    }),
  );
});

it("preserves event parameters and filters while fetching and merging authored table pages", async () => {
  const updated = { ...plannedTable, name: "Updated table", seatedCount: 1 };
  const other = { ...plannedTable, id: optionId, name: "Second table", order: 1 };
  callServerTool.mockResolvedValue({
    structuredContent: {
      operation: "list_event_tables",
      data: pages([updated, other], "next"),
    },
  });
  renderResult("list_event_tables", pages([plannedTable], "next"), {
    params: { eventId },
    query: { query: "table", limit: 10, cursor: "old" },
  });
  expect(screen.getByText("0/4 participants")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more tables" }));
  expect(await screen.findByRole("button", { name: "Open table: Table #2" })).toBeTruthy();
  expect(screen.getByText("1/4 participant")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open table: First table" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more tables" })).toBeNull();
  expect(callServerTool).toHaveBeenCalledWith(
    {
      name: "list_event_tables",
      arguments: { params: { eventId }, query: { query: "table", limit: 10, cursor: "next" } },
    },
    { signal: expect.any(AbortSignal) },
  );
  fireEvent.click(screen.getByRole("button", { name: "Open table: Table #1" }));
  await waitFor(() =>
    expect(openLink).toHaveBeenCalledWith({
      url: expect.stringMatching(
        new RegExp(`/events/${eventId}/tables/[^?]+\\?fromEvent=${eventId}$`),
      ),
    }),
  );
});

it("renders complete saved table receipts and identifies the viewer without Clerk in the frame", async () => {
  const table = {
    ...plannedTable,
    demonstratorUserId: "host-user",
    eventStatus: "CONFIRMED" as const,
    confirmed: { startsAt: "2030-06-03T18:00:00Z", gameId: 1, playerIds: ["a", "b"] },
  };
  renderResult("save_table_result", { table, event: plannedEvent });
  fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
  expect(await screen.findByText("Demonstrator")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Board games: Chess" }));
  expect(await within(await screen.findByRole("dialog")).findByText("Chess")).toBeTruthy();
});

it("presents the actual group card and its BGO moderation path", async () => {
  const view = renderResult("get_group_moderation_review", groupRecord);
  expect(view.container.querySelector('[data-artwork-kind="groups"]')).toBeTruthy();
  expect(screen.getByText("1 Member")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open group: Friday group" }));
  await waitFor(() =>
    expect(openLink).toHaveBeenCalledWith({
      url: expect.stringMatching(new RegExp(`/moderation/${groupRecord.id}$`)),
    }),
  );
});

it("distinguishes a successful empty history from an invalid list response", () => {
  const view = renderResult("list_table_history", pages([]));
  expect(screen.getByRole("heading", { name: "History" })).toBeTruthy();
  expect(screen.getByText("No tables found")).toBeTruthy();
  view.unmount();
  renderResult("list_groups", pages([{ ...groupRecord, logo: "https://external.test/image" }]));
  expect(screen.getByRole("alert").textContent).toBe("Could not load groups");
  expect(screen.queryByText("No groups found")).toBeNull();
  expect(isRecordResultOperation("get_table")).toBe(true);
  expect(isRecordResultOperation("discover_groups")).toBe(true);
  expect(isRecordResultOperation("list_profile_games")).toBe(false);
  expect(isRecordResultOperation("constructor")).toBe(false);
});

it("preserves loaded groups after a failed page and handles a failed host link", async () => {
  callServerTool
    .mockResolvedValueOnce({ structuredContent: { operation: "list_groups", data: { items: [] } } })
    .mockResolvedValueOnce({ structuredContent: { operation: "list_groups", data: pages([]) } });
  renderResult("list_groups", pages([groupRecord], "next"));
  const groupLink = screen.getByRole("button", { name: "Open group: Friday group" });
  fireEvent.click(screen.getByRole("button", { name: "Load more groups" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not load groups");
  expect(groupLink.isConnected).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  openLink.mockRejectedValueOnce(Error("link refused"));
  fireEvent.click(groupLink);
  expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong");
});

it("removes group cards and paging controls when the server denies a later page", async () => {
  callServerTool.mockResolvedValueOnce({ isError: true, structuredContent: { status: 403 } });
  renderResult("list_groups", pages([groupRecord], "next"));
  fireEvent.click(screen.getByRole("button", { name: "Load more groups" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not load groups");
  expect(screen.queryByRole("button", { name: "Open group: Friday group" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

it("keeps non-history table sections titled Tables and rejects invalid events and tables", () => {
  const view = renderResult("list_table_history", pages([]), { query: { section: "waiting" } });
  expect(screen.getByRole("heading", { name: "Tables" })).toBeTruthy();
  view.unmount();
  for (const [operation, invalid, message] of [
    ["get_event", { ...plannedEvent, status: "UNKNOWN" }, "Could not load event"],
    ["get_table", { ...plannedTable, minPlayers: "4" }, "Could not load table"],
    ["get_group", { ...groupRecord, memberCount: null }, "Could not load group"],
  ] as const) {
    expect(readRecordDetail(operation, invalid)).toBeUndefined();
    const invalidView = renderResult(operation, invalid);
    expect(screen.getByRole("alert").textContent).toBe(message);
    invalidView.unmount();
  }
  expect(readRecordDetail("list_events", plannedEvent)).toBeUndefined();
  expect(renderResult("search_users", {}).container).toBeEmptyDOMElement();
});

it("shows a pending event page, deduplicates by ID and keeps contextual event arguments", async () => {
  const next = Promise.withResolvers<unknown>();
  const input = { query: { groupId: optionId, limit: 1 } };
  callServerTool.mockReturnValueOnce(next.promise);
  renderResult("list_events", pages([plannedEvent], "page"), input);
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByLabelText("Loading…")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open event: Friday games" })).toBeTruthy();
  next.resolve({
    structuredContent: {
      operation: "list_events",
      data: pages([
        { ...plannedEvent, name: "Renamed Friday games" },
        { ...plannedEvent, id: optionId, name: "Saturday games" },
      ]),
    },
  });
  expect(await screen.findByRole("button", { name: "Open event: Saturday games" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open event: Renamed Friday games" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open event: Friday games" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(callServerTool).toHaveBeenCalledWith(
    { name: "list_events", arguments: { query: { ...input.query, cursor: "page" } } },
    { signal: expect.any(AbortSignal) },
  );
});

it.each([
  [
    "get_event",
    { ...plannedEvent, groupId: groupRecord.id, description: "Friday schedule" },
    "Friday schedule",
    "Tables",
    "get_event",
    { params: { eventId } },
  ],
  [
    "get_table",
    { ...plannedTable, groupId: groupRecord.id },
    null,
    "Event",
    "get_event",
    { params: { eventId } },
  ],
  [
    "get_group",
    groupRecord,
    null,
    "Rankings",
    "get_group",
    { params: { groupId: groupRecord.id } },
  ],
] as const)(
  "offers internal quick links for %s without making a detail card self-navigable",
  async (operation, data, description, label, target, args) => {
    const receipt = target === "get_group" ? groupRecord : plannedEvent;
    callServerTool.mockResolvedValueOnce({
      structuredContent: { operation: target, data: receipt },
    });
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <WidgetNavigation
            app={app}
            input={{ params: { eventId, tableId } }}
            output={{ operation, data, viewerUserId: "host-user" }}
            render={(output, input) => (
              <RecordResults
                app={app}
                operation={output.operation}
                data={output.data}
                input={input}
                viewerUserId="host-user"
                renderGameRow={(game) => <p>{game.name}</p>}
              />
            )}
          />
        </QueryClientProvider>
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: /^Open (group|table|event):/ })).toBeNull();
    if (description) expect(screen.getByText(description)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(callServerTool).toHaveBeenCalledWith(
        { name: target, arguments: args },
        { signal: expect.any(AbortSignal) },
      ),
    );
    expect(await screen.findByRole("button", { name: "Back" })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(openLink).not.toHaveBeenCalled();
  },
);
