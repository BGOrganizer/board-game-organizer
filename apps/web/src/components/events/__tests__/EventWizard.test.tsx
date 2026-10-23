import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  groupRecord,
  optionId,
  plannedEvent,
  plannedTable,
  tableId,
} from "@/test-fixtures/eventRecords";
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
          timeZone: "Europe/Rome",
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
function mount(edit = false, groupId?: string) {
  renderWithI18n(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <EventWizard eventId={edit ? eventId : undefined} groupId={groupId} />
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
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Add table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Table name" }), {
    target: { value: "First table" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add game" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  expect(screen.getByRole("button", { name: "Choose a game" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Remove game: Chess" }).closest("li")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText(/organizer has no automatic playing seat/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: /^Remove (date|location|table)/ })).toBeNull();
  expect(screen.getByText("Rated")).not.toBeNull();
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
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByRole("button", { name: "Remove table" }));
  expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove table" }));
  expect(screen.queryByRole("textbox", { name: "Table name" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Save event" }));
  await waitFor(() => expect(m.replace).toHaveBeenCalled());
  const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({
    version: 1,
    tables: [],
    removedTableIds: [tableId],
  });
});
it("fixes the contextual group as text and derives its location clock without a selector", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes(`/groups/${optionId}`)
              ? {
                  ...groupRecord,
                  approved: { ...groupRecord.approved, location: plannedEvent.locations[0] },
                  location: plannedEvent.locations[0],
                }
              : { items: [], nextCursor: null },
          ),
        ),
    ),
  );
  mount(false, optionId);
  await screen.findByText("Friday group");
  await screen.findByRole("button", { name: "Remove location: Club venue" });
  expect(screen.queryByRole("button", { name: "Friday group" })).toBeNull();
  expect(screen.queryByRole("button", { name: "No group" })).toBeNull();
  expect(screen.queryByLabelText("Time zone")).toBeNull();
});
it("uses bounded primary player counters and keeps the empty game slot after selection/removal", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/tables?")
              ? { items: [plannedTable], nextCursor: null }
              : url.includes("/favorites")
                ? { items: [], nextCursor: null }
                : plannedEvent,
          ),
        ),
    ),
  );
  mount(true);
  await screen.findByRole("textbox", { name: "Event name" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByPlaceholderText("Strategy table");
  expect(screen.queryByRole("textbox", { name: "Minimum players" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Decrease Minimum players" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Increase Minimum players" }));
  expect(
    (screen.getByRole("button", { name: "Increase Minimum players" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Decrease Maximum players" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Increase Maximum players" }));
  expect(
    (screen.getByRole("button", { name: "Increase Minimum players" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  const remove = screen.getByRole("button", { name: "Remove game: Chess" });
  expect(remove.closest("li")).not.toBeNull();
  fireEvent.click(remove);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Choose at least one game.")).not.toBeNull();
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("button", { name: "Add game" })).not.toBeNull();
});
it("retains the review and unsaved data after a failed final save", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response('{"error":"Conflict","code":"TABLE_TIME_CONFLICT"}', { status: 409 })
        : new Response('{"items":[],"nextCursor":null}'),
    ),
  );
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Friday games" },
  });
  fireEvent.change(screen.getByLabelText("Event day"), { target: { value: "2030-06-03" } });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Add table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Table name" }), {
    target: { value: "First table" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add game" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Create event" }));
  await screen.findByText(
    "Could not save event. Check timing, conflicts and permissions, then try again.",
  );
  expect(screen.getByText("Friday games")).not.toBeNull();
  expect(screen.getByText("First table")).not.toBeNull();
  expect(m.replace).not.toHaveBeenCalled();
});
it("enables Next initially, then shows field errors and disables it until all schedule fields are valid", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('{"items":[],"nextCursor":null}')),
  );
  mount();
  const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
  expect(next.disabled).toBe(false);
  expect(next.textContent).toBe("");
  expect((screen.getByRole("button", { name: "3. Review" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByLabelText("Time zone")).toBeNull();
  expect(screen.getByPlaceholderText("Friday game night")).not.toBeNull();
  fireEvent.click(next);
  expect(next.disabled).toBe(true);
  expect(screen.getByText("Enter an event name between 5 and 120 characters.")).not.toBeNull();
  expect(screen.getByText("Choose exactly one event day.")).not.toBeNull();
  expect(screen.getByText("Choose exactly one verified location.")).not.toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Friday games" },
  });
  fireEvent.change(screen.getByLabelText("Event day"), { target: { value: "2030-06-03" } });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(screen.queryByRole("button", { name: "Add date" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  expect(
    screen.getByRole("button", { name: "Remove location: Club venue" }).closest("li"),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: "Remove date: 2030-06-03" }).closest("li"),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Choose a verified address" })).toBeNull();
  expect(m.replace).not.toHaveBeenCalled();
});
