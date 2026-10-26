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
    <>
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
      <button
        type="button"
        onClick={() =>
          onSelect({
            id: "44444444-4444-4444-8444-444444444444",
            name: "Second venue",
            address: "Second verified address",
            latitude: 40.71,
            longitude: -74.01,
            timeZone: "America/New_York",
          })
        }
      >
        Choose second verified location
      </button>
    </>
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
it("changes Group inline through Select, preserves the draft and permits explicit no-group", async () => {
  const group = {
    ...groupRecord,
    approved: { ...groupRecord.approved, location: plannedEvent.locations[0] },
  };
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("/groups?")
            ? { items: [group], nextCursor: null }
            : url.includes("/groups/")
              ? group
              : { items: [], nextCursor: null },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Unsaved event name" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
  fireEvent.click(await screen.findByRole("option", { name: /Friday group/ }));
  expect((screen.getByRole("textbox", { name: "Event name" }) as HTMLInputElement).value).toBe(
    "Unsaved event name",
  );
  await screen.findByRole("button", { name: "Remove location: Club venue" });
  fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
  fireEvent.click(await screen.findByRole("option", { name: "No group" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Remove location: Club venue" })).toBeNull(),
  );
  expect((screen.getByRole("textbox", { name: "Event name" }) as HTMLInputElement).value).toBe(
    "Unsaved event name",
  );
  expect(m.replace).not.toHaveBeenCalled();
});
it("initializes public start tomorrow without removal or venue defaults and bounds one combined cutoff/end picker before Location", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/groups/")
              ? {
                  ...groupRecord,
                  type: "PUBLIC",
                  approved: { ...groupRecord.approved, location: plannedEvent.locations[0] },
                }
              : { items: [], nextCursor: null },
          ),
        ),
    ),
  );
  mount(false, optionId);
  const start = (await screen.findByLabelText("Start Date and Time")) as HTMLInputElement;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  await waitFor(() => expect(start.value.startsWith(day)).toBe(true));
  expect(screen.queryByRole("button", { name: /^Remove date/ })).toBeNull();
  expect(screen.queryByText("Club venue")).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a verified address" })).not.toBeNull();
  fireEvent.change(start, { target: { value: "2030-06-03T20:00" } });
  const end = screen.getByLabelText("End Date and Time") as HTMLInputElement,
    cutoff = screen.getByLabelText("Booking cutoff") as HTMLInputElement;
  expect(end.type).toBe("datetime-local");
  expect(cutoff.type).toBe("datetime-local");
  expect(end.min).toBe("2030-06-03T20:01");
  expect(end.max).toBe("2030-06-03T23:59");
  expect(cutoff.max).toBe("2030-06-03T19:59");
  expect(end.compareDocumentPosition(cutoff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    cutoff.compareDocumentPosition(
      screen.getByRole("button", { name: "Choose a verified address" }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.change(end, { target: { value: "2030-06-04T01:00" } });
  expect(end.value).toBe("");
  fireEvent.change(end, { target: { value: "2030-06-03T20:00" } });
  expect(end.value).toBe("");
  fireEvent.change(end, { target: { value: "2030-06-03T22:00" } });
  expect(end.value).toBe("2030-06-03T22:00");
  fireEvent.change(cutoff, { target: { value: "2030-06-03T20:00" } });
  expect(cutoff.value).toBe("");
  fireEvent.change(cutoff, { target: { value: "2030-06-03T19:00" } });
  expect(cutoff.value).toBe("2030-06-03T19:00");
  fireEvent.change(cutoff, { target: { value: "2030-06-02T23:00" } });
  expect(cutoff.value).toBe("2030-06-02T23:00");
  fireEvent.change(start, { target: { value: "2030-06-04T20:00" } });
  expect(end.value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  const locatedCutoff = screen.getByLabelText("Booking cutoff") as HTMLInputElement;
  expect(locatedCutoff.min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  fireEvent.change(locatedCutoff, { target: { value: "2000-01-01T00:00" } });
  expect(locatedCutoff.value).not.toBe("2000-01-01T00:00");
});
it("keeps private add slots, independent same-day clocks, location choices and pending input through picker navigation until final save", async () => {
  const fetch = vi.fn(
    async (url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === "POST"
            ? { ...plannedEvent, groupId: optionId, groupType: "PRIVATE" }
            : url.includes(`/groups/${optionId}`)
              ? {
                  ...groupRecord,
                  approved: { ...groupRecord.approved, location: plannedEvent.locations[0] },
                }
              : { items: [], nextCursor: null },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  mount(false, optionId);
  await screen.findByRole("button", { name: "Remove location: Club venue" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Choose at least one valid date and time.")).not.toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Private game night" },
  });
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T18:15" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect((screen.getByLabelText("Date and time") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T21:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose second verified location" }));
  expect((screen.getByLabelText("Date and time") as HTMLInputElement).value).toBe(
    "2030-06-03T21:30",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(screen.getByRole("button", { name: "Remove date: 2030-06-03 18:15" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Remove date: 2030-06-03 21:30" })).not.toBeNull();
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T21:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(screen.getAllByRole("button", { name: /^Remove date:/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  expect(screen.getAllByRole("button", { name: /^Remove location:/ })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Choose a verified address" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Add table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Table name" }), {
    target: { value: "Private table" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByRole("button", { name: "Add date" })).toBeNull();
  expect(screen.getByText("Second venue")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create event" }));
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith(`/groups/${optionId}?tab=events`));
  const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
  const input = JSON.parse(String(post?.[1]?.body));
  expect(input.dates).toEqual([
    { id: expect.any(String), day: "2030-06-03", startTime: "18:15" },
    { id: expect.any(String), day: "2030-06-03", startTime: "21:30" },
  ]);
  expect(input.dates[0].id).not.toBe(input.dates[1].id);
  expect(input.locations).toHaveLength(2);
  expect(input.groupId).toBe(optionId);
});
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
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T20:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Add table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Table name" }), {
    target: { value: "First table" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  expect(screen.getByRole("button", { name: "Choose a game" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Remove game: Chess" }).closest("li")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText(/organizer has no automatic playing seat/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: /^Remove (date|location|table)/ })).toBeNull();
  expect(screen.getByRole("img", { name: "Rating enabled" })).not.toBeNull();
  expect(screen.queryByText("No demonstrator")).toBeNull();
  expect(screen.getByRole("button", { name: "Create event" }).textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Create event" }));
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/events"));
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
it("locks the contextual group in its disabled Select and derives its location clock", async () => {
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
  const groupSelect = await screen.findByRole("button", { name: /Group$/ });
  expect(groupSelect.hasAttribute("disabled")).toBe(true);
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
  ).toBe(false);
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
  expect(screen.queryByRole("button", { name: "Add game" })).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a game" })).not.toBeNull();
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
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T20:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Add table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Table name" }), {
    target: { value: "First table" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
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
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect((screen.getByRole("button", { name: "3. Review" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByLabelText("Time zone")).toBeNull();
  expect(screen.getByPlaceholderText("Friday game night")).not.toBeNull();
  fireEvent.click(next);
  expect(next.disabled).toBe(true);
  expect(screen.getByText("Enter an event name between 5 and 120 characters.")).not.toBeNull();
  expect(screen.getByText("Choose exactly one valid date and time.")).not.toBeNull();
  expect(screen.getByText("Choose exactly one verified location.")).not.toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Friday games" },
  });
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T20:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(screen.queryByRole("button", { name: "Add date" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  expect(
    screen.getByRole("button", { name: "Remove location: Club venue" }).closest("li"),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: "Remove date: 2030-06-03 20:00" }).closest("li"),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Choose a verified address" })).toBeNull();
  expect(m.replace).not.toHaveBeenCalled();
});
