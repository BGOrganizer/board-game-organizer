import {
  clearSessionQueryCache,
  eventRecordKeys,
  type ScorePlayer,
  type TableScoreInput,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventResults } from "../EventResults";

const m = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  scorePlayers: vi.fn(),
  feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => m }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
    feedback: m.feedback,
  }),
}));
vi.mock("../TableScoreEditor", () => ({
  TableScoreEditor: ({
    players,
    initial,
    busy,
    onSubmit,
  }: {
    players: ScorePlayer[];
    initial?: TableScoreInput;
    busy: boolean;
    onSubmit: (value: TableScoreInput) => void;
  }) => {
    m.scorePlayers(players);
    return (
      <>
        <p data-testid="saved-input">{JSON.stringify(initial ?? null)}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit({
              lowerWins: false,
              entries: players.map((p) => ({ userId: p.id, score: null })),
              tieBreaks: [],
            })
          }
        >
          Save all ND
        </button>
      </>
    );
  },
}));
let fail: boolean,
  fetcher: ReturnType<typeof vi.fn>,
  event: typeof plannedEvent,
  table: typeof plannedTable;
beforeEach(() => {
  vi.clearAllMocks();
  const header = document.createElement("header");
  header.id = "page-header-actions";
  document.body.append(header);
  fail = false;
  event = {
    ...plannedEvent,
    status: "CONFIRMED",
    canFinalize: true,
    canEdit: false,
    canRegister: false,
    resultsReady: false,
  };
  table = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    eventVersion: 1,
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  };
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      if (fail) return Response.json({ error: "EVENT_CHANGED" }, { status: 409 });
      const { version, ...resultDraft } = JSON.parse(String(init.body));
      event = { ...event, version: version + 1, resultsReady: true };
      table = {
        ...table,
        resultDraft,
        eventVersion: version + 1,
        updatedAt: "2030-06-02T10:00:00Z",
      };
      return Response.json({ event, table });
    }
    return Response.json(
      url.includes("/seats?")
        ? { items: [seat("owner"), { ...seat("guest"), id: tableId }], nextCursor: null }
        : url.includes(`/tables/${tableId}`)
          ? table
          : event,
    );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById("page-header-actions")?.remove();
});
function mount(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <EventResults eventId={eventId} tableId={tableId} />
    </QueryClientProvider>,
  );
  return { ...view, client };
}
it("opens the selected Table directly, uses singular header and saves only that Table on the server", async () => {
  const { client } = mount();
  const save = await screen.findByRole("button", { name: "Save all ND" });
  expect(screen.getByRole("heading", { name: "Register result" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Finalize event" })).toBeNull();
  expect(m.scorePlayers).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: "owner", username: "owner" }),
      expect.objectContaining({ id: "guest", username: "guest" }),
    ]),
  );
  fireEvent.click(save);
  await waitFor(() =>
    expect(m.replace).toHaveBeenCalledWith(`/events/${eventId}/tables/${tableId}`),
  );
  const puts = fetcher.mock.calls.filter(([, init]) => init?.method === "PUT");
  expect(puts).toHaveLength(1);
  expect(puts[0][0]).toBe(`https://api.test/api/events/${eventId}/tables/${tableId}/results`);
  expect(JSON.parse(String(puts[0][1]?.body))).toEqual({
    version: 1,
    lowerWins: false,
    entries: [
      { userId: "owner", score: null },
      { userId: "guest", score: null },
    ],
    tieBreaks: [],
  });
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  expect(
    client.getQueryData(
      eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
    ),
  ).toMatchObject({ status: "CONFIRMED", resultsReady: true, version: 2 });
  expect(m.feedback.onOptimisticUpdate).toHaveBeenCalledWith("save_table_result");
});
it("reloads server scores after unmounting without retaining a local Event-wide workflow", async () => {
  const first = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Save all ND" }));
  await waitFor(() => expect(m.replace).toHaveBeenCalled());
  first.unmount();
  clearSessionQueryCache(first.client);
  mount();
  await screen.findByRole("button", { name: "Save all ND" });
  expect(screen.getByTestId("saved-input").textContent).toContain('"score":null');
});
it("keeps write failures observable, rolls back only the provisional overlay, and never navigates on failure", async () => {
  fail = true;
  const { client } = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Save all ND" }));
  await screen.findByText("Could not save table result");
  expect(m.replace).not.toHaveBeenCalled();
  expect(
    client.getQueryData(
      eventRecordKeys.table({ apiUrl: "https://api.test", userId: "owner" }, eventId, tableId),
    ),
  ).not.toHaveProperty("resultDraft");
  expect(screen.getByRole("button", { name: "Save all ND" })).toBeTruthy();
});
it.each(["excluded", "member", "terminated", "capability"])(
  "does not edit a %s Table",
  async (kind) => {
    if (kind === "excluded") table = { ...table, confirmed: undefined };
    if (kind === "member") event = { ...event, adminUserId: "another_admin" };
    if (kind === "capability") event = { ...event, canFinalize: false };
    if (kind === "terminated") event = { ...event, status: "TERMINATED" };
    mount();
    await screen.findByText(
      "Only an authorized organizer can record results for an included confirmed table.",
    );
    expect(screen.queryByRole("button", { name: "Save all ND" })).toBeNull();
  },
);
it("fences an open editor when a newer Event version arrives", async () => {
  const { client } = mount();
  await screen.findByRole("button", { name: "Save all ND" });
  event = { ...event, version: 4 };
  await act(async () =>
    client.setQueryData(
      eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
      event,
    ),
  );
  await screen.findByText("This event changed. Go back and reopen the editor before saving.");
  expect((screen.getByRole("button", { name: "Save all ND" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});
it.each(["error", "missing"])(
  "keeps incomplete frozen-player reads observable and retries (%s)",
  async (kind) => {
    let broken = true;
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((url: string, init?: RequestInit) =>
      url.includes("/seats?") && broken
        ? Promise.resolve(
            kind === "error"
              ? Response.json({}, { status: 503 })
              : Response.json({ items: [seat("owner")], nextCursor: null }),
          )
        : original(url, init),
    );
    mount();
    await screen.findByText("Could not load players");
    expect(screen.queryByRole("button", { name: "Save all ND" })).toBeNull();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Save all ND" });
  },
);
it("loads missing frozen players from the next source page before enabling the editor", async () => {
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.includes("/seats?")
      ? Promise.resolve(
          Response.json(
            new URL(url).searchParams.has("cursor")
              ? { items: [seat("guest")], nextCursor: null }
              : { items: [seat("owner")], nextCursor: "second" },
          ),
        )
      : original(url, init),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Load more players" }));
  await screen.findByRole("button", { name: "Save all ND" });
});
it("does not repeat a save or navigate until the server acknowledges it", async () => {
  let release: (() => Promise<void>) | undefined;
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? new Promise<Response>((resolve) => {
          release = async () => resolve(await original(url, init));
        })
      : original(url, init),
  );
  mount();
  const save = await screen.findByRole("button", { name: "Save all ND" });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(release).toBeDefined());
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  expect(m.replace).not.toHaveBeenCalled();
  await act(async () => {
    await release!();
  });
  await waitFor(() => expect(m.replace).toHaveBeenCalledOnce());
});
it("keeps uncertain save outcomes in verification without replay, false failure or navigation", async () => {
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? Promise.resolve(Response.json({}, { status: 503 }))
      : original(url, init),
  );
  const view = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Save all ND" }));
  await screen.findByText("Checking saved changes");
  expect(screen.queryByText("Could not save table result")).toBeNull();
  expect(m.replace).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  expect((screen.getByRole("button", { name: "Save all ND" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  view.unmount();
  clearSessionQueryCache(view.client);
});
it.each([undefined, 2])(
  "never combines a stale/missing Table epoch (%s) with the current Event version",
  async (eventVersion) => {
    table = { ...table, eventVersion };
    mount();
    await screen.findByText("This event changed. Go back and reopen the editor before saving.");
    expect(screen.queryByRole("button", { name: "Save all ND" })).toBeNull();
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  },
);
it("keeps Back in the app header", async () => {
  mount();
  await screen.findByRole("button", { name: "Save all ND" });
  const back = screen.getByRole("button", { name: "Back" });
  expect(document.getElementById("page-header-actions")?.contains(back)).toBe(true);
  fireEvent.click(back);
  expect(m.back).toHaveBeenCalledOnce();
});
it.each([403, 503])("keeps denied or failed Table reads observable (%s)", async (status) => {
  const original = fetcher.getMockImplementation()!;
  let broken = true;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.endsWith(`/tables/${tableId}`) && broken
      ? Promise.resolve(Response.json({}, { status }))
      : original(url, init),
  );
  mount();
  await screen.findByText("Could not load table");
  expect(screen.queryByRole("button", { name: "Save all ND" })).toBeNull();
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Save all ND" });
});
