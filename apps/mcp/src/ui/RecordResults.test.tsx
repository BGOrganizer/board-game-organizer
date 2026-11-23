// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  eventId,
  groupRecord,
  optionId,
  plannedEvent,
  plannedTable,
} from "@/test-fixtures/eventRecords";
import { messages } from "../../../../messages/en";
import { isRecordResultOperation, RecordResults } from "./RecordResults";

const openLink = vi.fn(async () => ({}));
const callServerTool = vi.fn();
const app = { openLink, callServerTool } as unknown as App;
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
  const updated = { ...plannedTable, name: "Updated table" };
  const other = { ...plannedTable, id: optionId, name: "Second table" };
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
  expect(await screen.findByRole("button", { name: "Open table: Second table" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open table: First table" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more tables" })).toBeNull();
  expect(callServerTool).toHaveBeenCalledWith(
    {
      name: "list_event_tables",
      arguments: { params: { eventId }, query: { query: "table", limit: 10, cursor: "next" } },
    },
    { signal: expect.any(AbortSignal) },
  );
  fireEvent.click(screen.getByRole("button", { name: "Open table: Updated table" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
  expect(await screen.findByText("Chess")).toBeTruthy();
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
