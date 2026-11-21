import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventGuestVoteEditor } from "../EventGuestVoteEditor";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://guest-votes.test",
    userId: "owner",
    getToken: async () => "manager",
  }),
}));
afterEach(() => vi.unstubAllGlobals());

it("switches through the guest preference tabs and saves only a chosen game ballot", async () => {
  const table = {
    ...plannedTable,
    canManage: true,
    games: [...plannedTable.games, { gameId: 2 }],
    gamesDetail: [...plannedTable.gamesDetail, { id: 2, name: "Azul", year: null, imageUrl: null }],
  };
  const event = {
    ...plannedEvent,
    canManage: true,
    dates: [...plannedEvent.dates, { id: "second-date", day: "2030-06-05" }],
    locations: [
      ...plannedEvent.locations,
      { ...plannedEvent.locations[0], id: "second-venue", name: "Another venue" },
    ],
  };
  const votes = { guestName: "Guest Alice", dateVotes: {}, locationVotes: {}, gameVotes: {} };
  const changes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const pathname = new URL(input).pathname;
      if (pathname.endsWith("/guests/guest-entry/votes") && init?.method === "POST") {
        changes.push(JSON.parse(String(init.body)));
        Object.assign(votes.gameVotes, { "1": "YES" });
      } else if (pathname === `/api/events/${event.id}`) {
        return Response.json(event);
      }
      return Response.json(votes);
    }),
  );
  const close = vi.fn();
  renderWithI18n(
    <EventGuestVoteEditor
      name="Guest Alice"
      registrationId="guest-entry"
      table={table}
      onClose={close}
    />,
  );
  const sheet = within(await screen.findByRole("dialog", { name: "Edit guest votes" }));
  expect(await sheet.findByRole("tab", { name: "Dates", selected: true })).toBeVisible();
  fireEvent.click(sheet.getByRole("tab", { name: "Locations" }));
  expect(sheet.getByText("Another venue")).toBeVisible();
  fireEvent.click(sheet.getByRole("tab", { name: "Games" }));
  expect(sheet.getByRole("button", { name: "Chess: No" })).toBeDisabled();
  fireEvent.click(sheet.getByRole("button", { name: "Chess: Yes" }));
  expect(await sheet.findByRole("button", { name: "Chess: Yes", pressed: true })).toBeVisible();
  expect(changes).toEqual([{ kind: "game", tableId: table.id, gameId: 1, vote: "YES" }]);
  fireEvent.click(sheet.getByRole("button", { name: "Done" }));
  expect(close).toHaveBeenCalledOnce();
});
