import type { ScorePlayer, TableScoreInput } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventResults } from "../EventResults";

const m = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));
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
  const header = document.createElement("header");
  header.id = "page-header-actions";
  document.body.append(header);
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
afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById("page-header-actions")?.remove();
});
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
it("uses only app-header Back for selected/loading editors and route Back for the list", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit scores: First table" }));
  await screen.findByRole("heading", { name: "Register Table Result" });
  const back = screen.getByRole("button", { name: "Back" });
  expect(document.getElementById("page-header-actions")?.contains(back)).toBe(true);
  expect(screen.queryByRole("button", { name: "Back to tables" })).toBeNull();
  fireEvent.click(back);
  await screen.findByRole("heading", { name: "Register Tables Results" });
  expect(m.back).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(m.back).toHaveBeenCalledOnce();
});
it("requires scores for every included frozen table, then posts one atomic finalization after explicit consent", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: "Register Tables Results" })).not.toBeNull();
  const finalize = await screen.findByRole("button", { name: "Finalize event" });
  expect(finalize.querySelector("svg.lucide-flag")).not.toBeNull();
  expect((finalize as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Tables list: Field help" }));
  expect(
    await screen.findByText(
      "Record results for every table to finalize the event. Finalization is irreversible. All-ND tables do not change ratings or statistics.",
    ),
  ).not.toBeNull();
  expect(screen.queryByRole("img", { name: "Scores ready" })).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(await screen.findByRole("button", { name: "Edit scores: First table" }));
  expect(await screen.findByRole("heading", { name: "Register Table Result" })).not.toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Draft all ND" }));
  expect(await screen.findByRole("heading", { name: "Register Tables Results" })).not.toBeNull();
  const badge = screen.getByRole("img", { name: "Scores ready" });
  expect(badge.className).toContain("bottom-0");
  expect(badge.className).toContain("right-0");
  expect(badge.className).toContain("text-success");
  expect(badge.parentElement?.querySelector("img")).not.toBeNull();
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Finalize event" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  expect(screen.getByRole("dialog").textContent).toContain("immutable together");
  expect(
    within(screen.getByRole("dialog"))
      .getByRole("button", { name: "Finalize event" })
      .querySelector("svg.lucide-flag"),
  ).not.toBeNull();
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
it("keeps each Table draft when switching screens and cannot finalize before every frozen Table has results", async () => {
  const secondId = "77777777-7777-4777-8777-777777777777";
  const first = {
      ...plannedTable,
      eventStatus: "CONFIRMED",
      confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: plannedEvent.createdAt },
    },
    second = { ...first, id: secondId, name: "Second table" };
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/tables?"))
      return new Response(JSON.stringify({ items: [first, second], nextCursor: null }));
    if (url.endsWith(`/tables/${secondId}`)) return new Response(JSON.stringify(second));
    if (url.includes(`/tables/${secondId}/seats?`))
      return new Response(
        JSON.stringify({
          items: [seat("owner"), { ...seat("guest"), id: secondId }],
          nextCursor: null,
        }),
      );
    return original(url, init);
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit scores: First table" }));
  fireEvent.click(await screen.findByRole("button", { name: "Draft all ND" }));
  expect(await screen.findAllByRole("img", { name: "Scores ready" })).toHaveLength(1);
  expect(
    (screen.getByRole("button", { name: "Finalize event" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Edit scores: Second table" }));
  fireEvent.click(await screen.findByRole("button", { name: "Draft all ND" }));
  expect(await screen.findAllByRole("img", { name: "Scores ready" })).toHaveLength(2);
  expect(
    (screen.getByRole("button", { name: "Finalize event" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Finalize event" }),
  );
  await waitFor(() => expect(m.replace).toHaveBeenCalled());
  const post = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(
    JSON.parse(String(post[1]?.body)).results.map((row: { tableId: string }) => row.tableId),
  ).toEqual([tableId, secondId]);
});
it.each([403, 503])(
  "keeps a selected Table read failure observable (%s) and never edits denied cached player data",
  async (status) => {
    const original = fetcher.getMockImplementation()!;
    let broken = true;
    fetcher.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith(`/tables/${tableId}`) && broken
        ? Promise.resolve(new Response("{}", { status }))
        : original(url, init),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit scores: First table" }));
    expect(await screen.findByText("Could not load table")).not.toBeNull();
    if (status === 403) expect(screen.queryByRole("button", { name: "Draft all ND" })).toBeNull();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Draft all ND" })).not.toBeNull();
  },
);
it("preserves draft scores and a retryable error when finalization cannot be verified", async () => {
  fail = true;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit scores: First table" }));
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
