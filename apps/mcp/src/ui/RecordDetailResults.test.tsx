// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { RecordDetailResults } from "./RecordDetailResults";
import type { RecordResultRow } from "./RecordResults";

const i18n = setupI18n({ locale: "en" });
const viewerUserId = "viewer";
const callServerTool = vi.fn<App["callServerTool"]>();
const openLink = vi.fn<App["openLink"]>();
const app = { callServerTool, openLink } as unknown as App;
const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

function show(row: RecordResultRow, initialTab?: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <RecordDetailResults
          app={app}
          row={row}
          initialTab={initialTab}
          viewerUserId={viewerUserId}
        />
      </QueryClientProvider>
    </I18nProvider>,
  );
}
function result(operation: string, data: unknown, viewer = viewerUserId) {
  return { content: [], structuredContent: { operation, data }, _meta: { viewerUserId: viewer } };
}

beforeEach(() => {
  callServerTool.mockReset();
  openLink.mockReset();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it("rejects a different viewer's pending group roster and loads the current viewer on explicit retry", async () => {
  const pending = Promise.withResolvers<Awaited<ReturnType<App["callServerTool"]>>>();
  const operation = "list_group_members";
  callServerTool.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(
    result(operation, {
      items: [
        {
          userId: "visible",
          name: "Visible current member",
          username: "current_member",
          isAdmin: true,
        },
      ],
      nextCursor: null,
    }),
  );
  show({ kind: "group", data: groupRecord }, "members");
  expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByLabelText("Loading…")).toBeVisible();
  pending.resolve(
    result(
      operation,
      {
        items: [{ userId: "private", name: "Private", username: "wrong_account" }],
        nextCursor: null,
      },
      "different-viewer",
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  expect(screen.queryByText("@wrong_account")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("@current_member")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(callServerTool).toHaveBeenCalledTimes(2);
  for (const call of callServerTool.mock.calls) {
    expect(call).toEqual([
      { name: operation, arguments: { params: { groupId: groupRecord.id } } },
      { signal: expect.any(AbortSignal) },
    ]);
  }
});

it("requests the selected group's own event list before browsing its available event cards", async () => {
  callServerTool.mockResolvedValueOnce(
    result("list_events", {
      items: [{ ...plannedEvent, groupId: groupRecord.id, groupName: groupRecord.name }],
      nextCursor: null,
    }),
  );
  show({ kind: "group", data: groupRecord });
  expect(callServerTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Events" }));
  expect(await screen.findByRole("button", { name: "Open event: Friday games" })).toBeVisible();
  expect(callServerTool).toHaveBeenCalledExactlyOnceWith(
    { name: "list_events", arguments: { query: { groupId: groupRecord.id } } },
    { signal: expect.any(AbortSignal) },
  );
});

it("does not fetch public readonly participants and restricts an ordinary member to the standard roster", async () => {
  const event = { ...plannedEvent, groupId: groupRecord.id, canManage: false };
  const publicView = show(
    { kind: "event", data: { ...event, visibility: "PUBLIC", readOnly: true } },
    "participants",
  );
  expect(screen.getByText(/Public event. Group membership/)).toBeVisible();
  expect(callServerTool).not.toHaveBeenCalled();
  publicView.unmount();
  callServerTool.mockResolvedValueOnce(
    result("list_event_participants", { items: [], nextCursor: null }),
  );
  show({ kind: "event", data: event }, "participants");
  expect(await screen.findByText("No participants yet")).toBeVisible();
  expect(callServerTool).toHaveBeenCalledExactlyOnceWith(
    { name: "list_event_participants", arguments: { params: { eventId } } },
    { signal: expect.any(AbortSignal) },
  );
});

it("explains proposal eligibility with multiple games and uses the group link fallback name", async () => {
  const table = {
    ...plannedTable,
    groupId: groupRecord.id,
    allowParticipantGames: true,
    games: [...plannedTable.games, { gameId: 2 }],
    gamesDetail: [...plannedTable.gamesDetail, { id: 2, name: "Root", imageUrl: null, year: 2018 }],
  };
  openLink.mockResolvedValueOnce({});
  show({ kind: "table", data: table }, "results");
  expect(screen.queryByRole("tab", { name: "Results" })).toBeNull();
  expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("button", { name: "Table details help" }));
  expect(await screen.findByText(/Players seated at this table can propose/)).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  expect(openLink).toHaveBeenCalledExactlyOnceWith({
    url: expect.stringMatching(new RegExp(`/groups/${groupRecord.id}$`)),
  });
});

it("shows an excluded table without reading its rankings", () => {
  show({ kind: "table", data: { ...plannedTable, eventStatus: "CONFIRMED" } }, "results");
  expect(screen.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Excluded from confirmation");
  expect(callServerTool).not.toHaveBeenCalled();
});
