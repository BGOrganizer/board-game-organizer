import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventWizard } from "../EventWizard";

const m = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("@/components/locations/SearchLocationPage", () => ({
  SearchLocationPage: ({ onSelect }: { onSelect: (value: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "33333333-3333-4333-8333-333333333333",
          name: "Club venue",
          address: "Via Roma 1",
          latitude: 41.9,
          longitude: 12.5,
        })
      }
    >
      Choose verified location
    </button>
  ),
}));
vi.mock("@/components/games/SearchGamePage", () => ({
  SearchGamePage: ({ onSelect }: { onSelect: (value: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({ id: 1, name: "Chess", year: null, imageUrl: null, maxPlayMinutes: 60 })
      }
    >
      Choose catalog game
    </button>
  ),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function mount(edit = false) {
  renderWithI18n(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <EventWizard eventId={edit ? eventId : undefined} />
    </QueryClientProvider>,
  );
}
it("submits one complete event only on final review, with no server draft or implicit organizer seat", async () => {
  const fetch = vi.fn(
    async (url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === "POST"
            ? plannedEvent
            : url.includes("/favorites")
              ? { items: [], nextCursor: null }
              : { items: [], nextCursor: null },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Friday games" },
  });
  fireEvent.change(screen.getByLabelText("Event day"), { target: { value: "2030-06-03" } });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  fireEvent.click(screen.getByRole("button", { name: "Add location" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  fireEvent.click(screen.getByRole("button", { name: "2. Tables" }));
  fireEvent.click(screen.getByRole("button", { name: "Add table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Table name" }), {
    target: { value: "First table" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add game" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "3. Review" }));
  expect(screen.getByText(/organizer has no automatic playing seat/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create event" }));
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith(`/events/${eventId}`));
  const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(1);
  const body = JSON.parse(String(posts[0][1]?.body));
  expect(body).toMatchObject({
    groupId: null,
    name: "Friday games",
    tables: [{ name: "First table", games: [{ gameId: 1 }] }],
  });
  expect(body.status).toBeUndefined();
  expect(body.playerIds).toBeUndefined();
});
it("requires explicit table removal and sends only loaded upserts plus removed IDs at final save", async () => {
  const fetch = vi.fn(
    async (url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === "PATCH"
            ? { ...plannedEvent, version: 2 }
            : url.includes("/tables?")
              ? { items: [plannedTable], nextCursor: "0" }
              : url.includes("/favorites")
                ? { items: [], nextCursor: null }
                : { ...plannedEvent, tableCount: 2 },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  mount(true);
  await screen.findByRole("textbox", { name: "Event name" });
  fireEvent.click(screen.getByRole("button", { name: "2. Tables" }));
  fireEvent.click(await screen.findByRole("button", { name: "Remove table" }));
  expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove table" }));
  expect(screen.queryByRole("textbox", { name: "Table name" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "3. Review" }));
  fireEvent.click(screen.getByRole("button", { name: "Save event" }));
  await waitFor(() => expect(m.replace).toHaveBeenCalled());
  const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({
    version: 1,
    tables: [],
    removedTableIds: [tableId],
  });
});
it("keeps invalid input local and failed saves observable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('{"items":[],"nextCursor":null}')),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "3. Review" }));
  fireEvent.click(screen.getByRole("button", { name: "Create event" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Check required fields, dates, player limits, games and durations.",
  );
  expect(m.replace).not.toHaveBeenCalled();
});
