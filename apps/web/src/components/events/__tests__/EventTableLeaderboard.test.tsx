import { eventRecordKeys, tableLeaderboardQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableLeaderboard } from "../EventTableLeaderboard";

const m = vi.hoisted(() => ({ token: vi.fn(async () => "fresh") }));
const owner = { apiUrl: "https://api.test", userId: "owner", getToken: m.token };
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "owner", getToken: m.token }),
}));
const table = {
  ...plannedTable,
  eventStatus: "CONFIRMED" as const,
  confirmed: { gameId: 1, playerIds: ["alpha", "beta"], startsAt: "2030-06-03T18:00:00Z" },
};
const player = (userId: string) => ({
  userId,
  name: userId,
  avatarUrl: null,
  score: 35.5,
  provisional: userId === "alpha",
  gamesPlayed: 3,
  gamesWon: 1,
  nd: 1,
});
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ gameId: 1, scope: "GLOBAL", items: [player("alpha")], nextCursor: "1" }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
function mount(value = table) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <EventTableLeaderboard table={value} />
    </QueryClientProvider>,
  );
  return { client, view };
}
it("keys current ratings by API/user/Event/Table/frozen game, gates missing identity and revalidates on navigation", () => {
  const q = tableLeaderboardQuery(owner, table.eventId, table.id, 1);
  expect(q.queryKey).toEqual([
    "events",
    owner.apiUrl,
    "owner",
    "leaderboard",
    table.eventId,
    table.id,
    1,
  ]);
  expect(q.enabled).toBe(true);
  expect(q.staleTime).toBe(0);
  expect(q.gcTime).toBe(30 * 60_000);
  for (const o of [
    { ...owner, apiUrl: "" },
    { ...owner, userId: null },
    { ...owner, enabled: false },
  ])
    expect(tableLeaderboardQuery(o, table.eventId, table.id, 1).enabled).toBe(false);
  expect(tableLeaderboardQuery(owner, table.eventId, table.id).enabled).toBe(false);
  expect(tableLeaderboardQuery(owner, "", table.id, 1).enabled).toBe(false);
  expect(tableLeaderboardQuery(owner, table.eventId, "", 1).enabled).toBe(false);
  expect(
    tableLeaderboardQuery({ ...owner, userId: "other" }, table.eventId, table.id, 1).queryKey,
  ).not.toEqual(q.queryKey);
  expect(tableLeaderboardQuery(owner, table.eventId, table.id, 2).queryKey).not.toEqual(q.queryKey);
});
it("shows the frozen game/current ranking and source-pages with fresh tokens and cancellation signals", async () => {
  fetcher.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify({
          gameId: 1,
          scope: "GLOBAL",
          items: [player(url.includes("cursor=1") ? "beta" : "alpha")],
          nextCursor: url.includes("cursor=1") ? null : "1",
        }),
      ),
  );
  mount();
  expect(await screen.findByText("alpha")).not.toBeNull();
  expect(screen.getByText("Chess")).not.toBeNull();
  expect(screen.getByText("Global rating")).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Selected game" })).not.toBeNull();
  expect(screen.getByRole("img", { name: "Provisional rating" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("beta")).not.toBeNull();
  expect(screen.getByText("alpha")).not.toBeNull();
  expect(m.token).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.every(
      ([url, init]) =>
        String(url).includes(`/events/${table.eventId}/tables/${table.id}/leaderboard?`) &&
        init?.signal instanceof AbortSignal,
    ),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});
it.each([403, 503])(
  "keeps %s failures observable, not empty success, and retries",
  async (status) => {
    fetcher.mockResolvedValue(new Response("{}", { status }));
    mount();
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(screen.queryByText("No players found")).toBeNull();
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ gameId: 1, scope: "GLOBAL", items: [player("beta")], nextCursor: null }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("beta")).not.toBeNull();
  },
);
it.each([403, 503])(
  "hides private cached ratings on denial but retains usable cache on an ordinary %s failure",
  async (status) => {
    const { client } = mount();
    await screen.findByText("alpha");
    fetcher.mockResolvedValue(new Response("{}", { status }));
    await act(async () => {
      await client.invalidateQueries({
        queryKey: tableLeaderboardQuery(owner, table.eventId, table.id, 1).queryKey,
      });
    });
    await screen.findByRole("alert");
    expect(screen.queryByText("alpha") !== null).toBe(status !== 403);
  },
);
it("retries an ordinary network exception without invalidating unrelated Table snapshots", async () => {
  fetcher.mockRejectedValueOnce(new TypeError("Network unavailable"));
  mount();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("alpha")).not.toBeNull();
});
it("never stores another frozen game's response under a stale selected-game cache key", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        gameId: 99,
        scope: "GLOBAL",
        items: [player("wrong-game")],
        nextCursor: null,
      }),
    ),
  );
  const { client } = mount();
  const owned = eventRecordKeys.table(owner, table.eventId, table.id),
    foreign = eventRecordKeys.table({ ...owner, userId: "other" }, table.eventId, table.id);
  client.setQueryData(owned, table);
  client.setQueryData(foreign, table);
  await screen.findByRole("alert");
  expect(screen.queryByText("wrong-game")).toBeNull();
  expect(
    client.getQueryData(tableLeaderboardQuery(owner, table.eventId, table.id, 1).queryKey),
  ).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(client.getQueryState(owned)?.isInvalidated).toBe(true));
  expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
});
it("preserves cached rows during next-page loading/failure and retries that page without restarting pagination", async () => {
  let complete!: (value: Response) => void,
    attempts = 0;
  fetcher.mockImplementation(async (url: string) => {
    if (!url.includes("cursor=1"))
      return new Response(
        JSON.stringify({ gameId: 1, scope: "GLOBAL", items: [player("alpha")], nextCursor: "1" }),
      );
    if (++attempts === 1)
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    return new Response(
      JSON.stringify({
        gameId: 1,
        scope: "GLOBAL",
        items: [
          { ...player("beta"), name: "", avatarUrl: "https://example.test/avatar.png", score: 56 },
        ],
        nextCursor: null,
      }),
    );
  });
  mount();
  await screen.findByText("alpha");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(complete).toBeDefined());
  expect(document.querySelector(".skeleton.h-12")).not.toBeNull();
  expect(screen.getByText("alpha")).not.toBeNull();
  await act(async () => {
    complete(new Response("{}", { status: 503 }));
  });
  await screen.findByRole("alert");
  expect(screen.getByText("alpha")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("56.00")).not.toBeNull();
  expect(attempts).toBe(2);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});
it("does not fabricate rankings for excluded tables and renders an explicit authorized empty result", async () => {
  const { view } = mount({ ...table, confirmed: undefined } as unknown as typeof table);
  expect(screen.getByText("Excluded from confirmation")).not.toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ gameId: 1, scope: "GROUP", items: [], nextCursor: null })),
  );
  view.rerender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EventTableLeaderboard table={{ ...table, groupId: plannedTable.id, gamesDetail: [] }} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("No players found")).not.toBeNull();
  expect(screen.getByText("Unknown")).not.toBeNull();
  expect(screen.getByText("Group rating")).not.toBeNull();
});
