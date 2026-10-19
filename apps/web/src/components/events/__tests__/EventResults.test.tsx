import type { ScorePlayer, TableScoreInput } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventResults } from "../EventResults";

const m = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("../TableScoreEditor", () => ({
  TableScoreEditor: ({
    players,
    onSubmit,
  }: {
    players: ScorePlayer[];
    onSubmit: (value: TableScoreInput) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({
          lowerWins: false,
          entries: players.map((p) => ({ userId: p.id, score: null })),
          tieBreaks: [],
        })
      }
    >
      Draft all ND
    </button>
  ),
}));
let fail = false,
  fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fail = false;
  const event = {
      ...plannedEvent,
      status: "CONFIRMED",
      canFinalize: true,
      canEdit: false,
      canRegister: false,
    },
    table = {
      ...plannedTable,
      eventStatus: "CONFIRMED",
      confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    };
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return fail
        ? new Response('{"error":"EVENT_CHANGED"}', { status: 409 })
        : new Response(
            JSON.stringify({ ...event, status: "TERMINATED", canFinalize: false, version: 2 }),
          );
    return new Response(
      JSON.stringify(
        url.includes("/seats?")
          ? { items: [seat("owner"), { ...seat("guest"), id: tableId }], nextCursor: null }
          : url.includes("/tables?")
            ? { items: [table], nextCursor: null }
            : url.includes(`/tables/${tableId}`)
              ? table
              : event,
      ),
    );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  renderWithI18n(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <EventResults eventId={eventId} />
    </QueryClientProvider>,
  );
}
it("requires scores for every included frozen table, then posts one atomic finalization after explicit consent", async () => {
  mount();
  expect(
    ((await screen.findByRole("button", { name: "Finalize event" })) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(await screen.findByRole("button", { name: "Edit scores" }));
  fireEvent.click(await screen.findByRole("button", { name: "Draft all ND" }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Finalize event" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  expect(screen.getByRole("dialog").textContent).toContain("immutable together");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Finalize event" }),
  );
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith(`/events/${eventId}`));
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
    version: 1,
    results: [
      {
        tableId,
        lowerWins: false,
        entries: [
          { userId: "owner", score: null },
          { userId: "guest", score: null },
        ],
        tieBreaks: [],
      },
    ],
  });
});
it("preserves draft scores and a retryable error when finalization cannot be verified", async () => {
  fail = true;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit scores" }));
  fireEvent.click(await screen.findByRole("button", { name: "Draft all ND" }));
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Finalize event" }),
  );
  expect(
    await screen.findByText(
      "Could not verify event finalization. Refresh the event before retrying.",
    ),
  ).not.toBeNull();
  expect(screen.getByRole("dialog")).not.toBeNull();
  expect(m.replace).not.toHaveBeenCalled();
});
