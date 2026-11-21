import type { TableGuestVotes } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventGuestVoteEditor } from "../EventGuestVoteEditor";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://table-guests.test",
    userId: "owner",
    enabled: true,
    getToken: async () => "fresh-manager-token",
  }),
}));

const registrationId = "58246a08-f6cf-4ea8-a7cb-a571ae83dfba";
const path = `/api/events/${plannedEvent.id}/tables/${plannedTable.id}/guests/${registrationId}`;
const table = {
  ...plannedTable,
  canManage: true,
  games: [...plannedTable.games, { gameId: 2 }],
  gamesDetail: [...plannedTable.gamesDetail, { id: 2, name: "Azul", imageUrl: null, year: null }],
};
const close = vi.fn();
const hidden = { includeHiddenElements: true };

function fixture() {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NativeTestProviders>
        <EventGuestVoteEditor
          name="Guest Alice"
          registrationId={registrationId}
          table={table}
          onClose={close}
        />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  close.mockClear();
});

it("loads guest votes and submits the changed ballots only on Vote for the selected guest", async () => {
  const initial: TableGuestVotes = {
    guestName: "Guest Alice",
    dateVotes: {},
    locationVotes: {},
    gameVotes: {},
  };
  let votes = initial;
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: string, init?: RequestInit) => {
      const url = new URL(value);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fresh-manager-token");
      if (url.pathname === path) return Response.json(votes);
      if (url.pathname === `${path}/votes` && init?.method === "POST") {
        const input = JSON.parse(String(init.body));
        calls.push(input);
        votes = { ...votes, gameVotes: { "1": "YES" } };
        return Response.json(votes);
      }
      if (url.pathname === `/api/events/${plannedEvent.id}`)
        return Response.json({ ...plannedEvent, canManage: true });
      throw new Error(`Unexpected request: ${url.pathname}`);
    }),
  );
  await render(fixture());
  expect(await screen.findByText("Guest Alice", hidden)).toBeOnTheScreen();
  const vote = await screen.findByRole("button", { name: "Chess: Yes", ...hidden });
  const submit = screen.getByRole("button", { name: "Vote", ...hidden });
  expect(submit).toBeDisabled();
  expect(screen.getByRole("button", { name: "Chess: No", ...hidden })).toBeDisabled();
  expect(screen.queryByRole("tab", { name: "Dates", ...hidden })).toBeNull();
  await fireEvent.press(vote);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Chess: Yes", ...hidden })).toBeSelected(),
  );
  expect(screen.getByRole("button", { name: "Azul: No", ...hidden })).toBeEnabled();
  expect(calls).toEqual([]);
  expect(close).not.toHaveBeenCalled();
  await fireEvent.press(submit);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(calls).toEqual([{ votes: [{ kind: "game", tableId: table.id, gameId: 1, vote: "YES" }] }]);
});

it("stops at the current event authority check when guest proxy permission is revoked", async () => {
  const fetch = vi.fn(async () => Response.json({ ...plannedEvent, canManage: false }));
  vi.stubGlobal("fetch", fetch);
  await render(fixture());
  expect(await screen.findByText("Could not load guest votes", hidden)).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Chess: Yes", ...hidden })).toBeNull();
  expect(fetch.mock.calls).toHaveLength(1);
});

it("discards unanswered and staged votes on closing after switching between top tabs", async () => {
  const event = {
    ...plannedEvent,
    canManage: true,
    dates: [...plannedEvent.dates, { ...plannedEvent.dates[0], id: "date-two", day: "2030-06-06" }],
    locations: [
      ...plannedEvent.locations,
      { ...plannedEvent.locations[0], id: "place-two", name: "Another venue" },
    ],
  };
  const fetcher = vi.fn(async (value: string) => {
    const url = new URL(value);
    return Response.json(
      url.pathname === path
        ? { guestName: "Guest Alice", dateVotes: {}, locationVotes: {}, gameVotes: {} }
        : event,
    );
  });
  vi.stubGlobal("fetch", fetcher);
  await render(fixture());
  expect(await screen.findByRole("tab", { name: "Dates", ...hidden })).toBeSelected();
  await fireEvent.press(screen.getByRole("tab", { name: "Locations", ...hidden }));
  expect(screen.getByText("Another venue", hidden)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("tab", { name: "Games", ...hidden }));
  await fireEvent.press(screen.getByRole("button", { name: "Chess: Yes", ...hidden }));
  expect(screen.getByRole("button", { name: "Chess: Yes", ...hidden })).toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Close", ...hidden }));
  expect(close).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls).toHaveLength(2);
});
