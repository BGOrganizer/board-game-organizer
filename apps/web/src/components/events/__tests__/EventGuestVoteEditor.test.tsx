import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

it("stages choices across tabs and keeps the draft after a failed submission", async () => {
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
        if (changes.length === 1) return Response.json({ error: "UNAVAILABLE" }, { status: 500 });
        Object.assign(votes.locationVotes, { "second-venue": "IF_NEEDED" });
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
  const submit = sheet.getByRole("button", { name: "Vote" });
  expect(submit).toBeDisabled();
  fireEvent.click(sheet.getByRole("tab", { name: "Locations" }));
  expect(sheet.getByText("Another venue")).toBeVisible();
  fireEvent.click(sheet.getByRole("button", { name: "Another venue: If needed" }));
  fireEvent.click(sheet.getByRole("tab", { name: "Games" }));
  expect(sheet.getByRole("button", { name: "Chess: No" })).toBeDisabled();
  fireEvent.click(sheet.getByRole("button", { name: "Chess: Yes" }));
  expect(await sheet.findByRole("button", { name: "Chess: Yes", pressed: true })).toBeVisible();
  expect(changes).toEqual([]);
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(submit);
  expect(await sheet.findByText("Could not save guest vote. Try again.")).toBeVisible();
  expect(close).not.toHaveBeenCalled();
  expect(sheet.getByRole("button", { name: "Chess: Yes", pressed: true })).toBeVisible();
  fireEvent.click(submit);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  const batch = {
    votes: [
      { kind: "location", optionId: "second-venue", vote: "IF_NEEDED" },
      { kind: "game", tableId: table.id, gameId: 1, vote: "YES" },
    ],
  };
  expect(changes).toEqual([batch, batch]);
});
