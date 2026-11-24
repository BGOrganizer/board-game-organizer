// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, tableId } from "@/test-fixtures/eventRecords";
import { RosterResults } from "./RosterResults";

const operation = "list_table_seats";
const i18n = setupI18n({ locale: "en" });
const openLink = vi.fn<App["openLink"]>();
const callServerTool = vi.fn<App["callServerTool"]>();
const app = { callServerTool, openLink } as unknown as App;
const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
const input = { params: { eventId, tableId }, query: { limit: 10 } };

function show(items: unknown[], nextCursor: string | null = null) {
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <RosterResults
          app={app}
          operation={operation}
          data={{ items, nextCursor }}
          input={input}
          viewerUserId="viewer"
        />
      </QueryClientProvider>
    </I18nProvider>,
  );
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

it("renders only an available identity and never opens the current user or a guest as a profile", async () => {
  show([
    {
      id: "own-row",
      userId: "viewer",
      name: "Viewer",
      username: "me",
      status: "ACCEPTED",
      position: "SEATED",
    },
    { id: "unknown-row", userId: "unknown", name: null, position: "WAITING", status: "ACCEPTED" },
    { id: "guest-row", name: null, kind: "GUEST" },
  ]);
  expect(screen.getByRole("heading", { name: "Participants" })).toBeVisible();
  expect(screen.getByText("@me")).toBeVisible();
  expect(screen.queryByRole("button", { name: "@me" })).toBeNull();
  expect(screen.getByRole("button", { name: "Username unavailable" })).toBeVisible();
  expect(screen.getByText("Player on the waiting list")).toBeVisible();
  expect(screen.getAllByText("Guest").length).toBeGreaterThan(0);
  const guest = screen.getByRole("button", { name: "Guest" });
  expect(guest).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(guest);
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "An organizer can vote on their behalf.",
  );
  expect(openLink).not.toHaveBeenCalled();
});

it("reports host refusal and failure on opening a profile and recovers on the same role action", async () => {
  openLink
    .mockRejectedValueOnce(new Error("Link rejected"))
    .mockResolvedValueOnce({ isError: true })
    .mockResolvedValueOnce({});
  show([{ id: "another-user", name: "Avery", username: "avery" }]);
  const profile = screen.getByRole("button", { name: "@avery" });
  fireEvent.click(profile);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load profile");
  fireEvent.click(profile);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load profile");
  fireEvent.click(profile);
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(openLink).toHaveBeenCalledTimes(3);
  expect(openLink).toHaveBeenLastCalledWith({
    url: expect.stringMatching(/\/profiles\/another-user$/),
  });
});

it("retries an invalid roster page with the same scoped cursor and does not duplicate the participant", async () => {
  callServerTool
    .mockResolvedValueOnce({
      content: [],
      structuredContent: {
        operation,
        data: { items: [{ name: "Missing identity" }], nextCursor: null },
      },
    })
    .mockResolvedValueOnce({
      content: [],
      structuredContent: {
        operation,
        data: {
          items: [{ userId: "player", name: "Avery", username: "updated" }],
          nextCursor: "next",
        },
      },
    });
  show([{ userId: "player", name: "Avery", username: "avery" }], "next");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load participants");
  expect(screen.getByText("@avery")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("@updated")).toBeVisible();
  expect(screen.queryByText("@avery")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(callServerTool).toHaveBeenCalledTimes(2);
  for (const call of callServerTool.mock.calls) {
    expect(call).toEqual([
      { name: operation, arguments: { ...input, query: { ...input.query, cursor: "next" } } },
      { signal: expect.any(AbortSignal) },
    ]);
  }
});
