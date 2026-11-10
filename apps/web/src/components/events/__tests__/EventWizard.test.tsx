import {
  type CreateEventVariables,
  clearSessionQueryCache,
  eventDraft,
  eventRecordQuery,
  useEventRecordForm,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const m = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  playerBounds: undefined as { minPlayers: number; maxPlayers: number } | undefined,
}));
const clients: QueryClient[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => m }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
    feedback: m.feedback,
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
  SearchGamePage: ({
    onSelect,
    onClose,
  }: {
    onSelect: (value: unknown) => void;
    onClose: () => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onSelect({
            id: 1,
            name: "Chess",
            year: null,
            imageUrl: null,
            maxPlayMinutes: 60,
            ...m.playerBounds,
          })
        }
      >
        Choose catalog game
      </button>
      <button type="button" onClick={onClose}>
        Cancel game picker
      </button>
    </>
  ),
}));
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const client of clients.splice(0)) clearSessionQueryCache(client);
  });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  m.playerBounds = undefined;
});
function mount(edit = false, groupId?: string, existingClient?: QueryClient) {
  const client =
    existingClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  clients.push(client);
  const ui = renderWithI18n(
    <QueryClientProvider client={client}>
      <EventWizard eventId={edit ? eventId : undefined} groupId={groupId} />
    </QueryClientProvider>,
  );
  return { client, ui };
}
function openSchedule() {
  if (screen.queryByRole("textbox", { name: "Event name" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
async function expandExistingTable() {
  if (screen.queryByLabelText("Date and time"))
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const trigger = await screen.findByRole("button", { name: plannedTable.name });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
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
  openSchedule();
  await screen.findByRole("button", { name: "Remove location: Club venue" });
  fireEvent.click(screen.getByRole("button", { name: "1. Event" }));
  fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
  fireEvent.click(await screen.findByRole("option", { name: "No group" }));
  openSchedule();
  expect(screen.getByRole("button", { name: "Remove location: Club venue" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "1. Event" }));
  expect((screen.getByRole("textbox", { name: "Event name" }) as HTMLInputElement).value).toBe(
    "Unsaved event name",
  );
  expect(m.replace).not.toHaveBeenCalled();
});
it("initializes public start tomorrow without venue defaults and bounds separate date and start/end clocks before Location", async () => {
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
  await screen.findByRole("button", { name: /Group$/ });
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Public game night" },
  });
  openSchedule();
  const date = (await screen.findByLabelText(/^Event date \*$/)) as HTMLInputElement;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  await waitFor(() => expect(date.value).toBe(day));
  expect(date.type).toBe("date");
  expect(screen.queryByRole("button", { name: /^Remove date/ })).toBeNull();
  expect(screen.queryByText("Club venue")).toBeNull();
  fireEvent.change(date, { target: { value: "2030-06-03" } });
  const start = screen.getByLabelText("Start time") as HTMLInputElement,
    end = screen.getByLabelText("End time") as HTMLInputElement,
    cutoff = screen.getByLabelText(/^Registration Deadline Date and Time \*$/) as HTMLInputElement;
  fireEvent.change(start, { target: { value: "20:00" } });
  expect(start.type).toBe("time");
  expect(end.type).toBe("time");
  expect(end.min).toBe("20:01");
  expect(end.max).toBe("23:59");
  expect(cutoff.max).toBe("2030-06-02T23:59");
  expect(end.compareDocumentPosition(cutoff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    cutoff.compareDocumentPosition(screen.getByRole("button", { name: "Choose a location" })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.change(end, { target: { value: "20:00" } });
  expect(end.value).toBe("");
  fireEvent.change(end, { target: { value: "22:00" } });
  expect(end.value).toBe("22:00");
  fireEvent.change(cutoff, { target: { value: "2030-06-03T19:00" } });
  expect(cutoff.value).toBe("");
  fireEvent.change(cutoff, { target: { value: "2030-06-02T23:00" } });
  expect(cutoff.value).toBe("2030-06-02T23:00");
  fireEvent.change(start, { target: { value: "23:00" } });
  expect(end.value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  const locatedCutoff = screen.getByLabelText(
    /^Registration Deadline Date and Time \*$/,
  ) as HTMLInputElement;
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
  await screen.findByRole("button", { name: /Group$/ });
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Private game night" },
  });
  openSchedule();
  await screen.findByRole("button", { name: "Remove location: Club venue" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Choose at least one valid date and time.")).not.toBeNull();
  openSchedule();
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T18:15" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect((screen.getByLabelText("Date and time") as HTMLInputElement).value).toBe("");
  openSchedule();
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T21:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose second verified location" }));
  expect((screen.getByLabelText("Date and time") as HTMLInputElement).value).toBe(
    "2030-06-03T21:30",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(screen.getByRole("button", { name: "Remove date: 2030-06-03 18:15" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Remove date: 2030-06-03 21:30" })).not.toBeNull();
  openSchedule();
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T21:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(screen.getAllByRole("button", { name: /^Remove date:/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  expect(screen.getAllByRole("button", { name: /^Remove location:/ })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Choose a location" })).not.toBeNull();
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
  openSchedule();
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T20:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
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
  expect(screen.getByRole("button", { name: "Rating enabled" })).not.toBeNull();
  expect(screen.queryByText("No demonstrator")).toBeNull();
  expect(screen.getByRole("button", { name: "Create event" }).textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Create event" }));
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/events?section=available"));
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
it.each([false, true])(
  "updates both counters immediately on game selection/removal while edit=%s without saving",
  async (edit) => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) =>
      Response.json(
        url.includes("/tables?")
          ? { items: [plannedTable], nextCursor: null }
          : url.includes("/favorites") || !edit
            ? { items: [], nextCursor: null }
            : plannedEvent,
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    mount(edit);
    await screen.findByRole("textbox", { name: "Event name" });
    if (!edit) {
      fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
        target: { value: "Unsaved draft" },
      });
      openSchedule();
      fireEvent.change(screen.getByLabelText("Date and time"), {
        target: { value: "2030-06-03T20:00" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add date" }));
      fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
      fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    if (edit) {
      await expandExistingTable();
      fireEvent.click(await screen.findByRole("button", { name: /^Remove game:/ }));
    } else fireEvent.click(screen.getByRole("button", { name: "Add table" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Minimum players" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Maximum players" }));
    expect(screen.getByLabelText("Minimum players").textContent).toBe("3");
    expect(screen.getByLabelText("Maximum players").textContent).toBe("5");
    m.playerBounds = { minPlayers: 2, maxPlayers: 4 };
    fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
    expect(screen.getByLabelText("Minimum players").textContent).toBe("3");
    expect(screen.getByLabelText("Maximum players").textContent).toBe("4");
    expect(
      (screen.getByRole("button", { name: "Increase Maximum players" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Maximum players" }));
    expect(
      (screen.getByRole("button", { name: "Decrease Maximum players" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Minimum players" }));
    expect(screen.getByLabelText("Minimum players").textContent).toBe("2");
    expect(
      (screen.getByRole("button", { name: "Decrease Minimum players" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove game: Chess" }));
    expect(
      (screen.getByRole("button", { name: "Increase Maximum players" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      fetcher.mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "PATCH"),
    ).toBe(false);
  },
);
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
  await expandExistingTable();
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
it.each([409, 503])(
  "navigates before an Event edit response, retains its draft and never blindly retries an unknown update: %s",
  async (status) => {
    let release: ((response: Response) => void) | undefined;
    let canonical = plannedEvent;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json(
        url.includes("/tables?")
          ? { items: [plannedTable], nextCursor: null }
          : url.includes("/favorites")
            ? { items: [], nextCursor: null }
            : canonical,
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const { client, ui } = mount(true);
    fireEvent.change(await screen.findByRole("textbox", { name: "Event name" }), {
      target: { value: "Retained Event edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await expandExistingTable();
    await screen.findByRole("button", { name: "Remove table" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    expect(m.replace).toHaveBeenCalledWith(`/events/${eventId}`);
    await waitFor(() => expect(release).toBeDefined());
    const write = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH");
    const body = JSON.parse(String(write?.[1]?.body));
    expect(body).toMatchObject({ name: "Retained Event edit", version: plannedEvent.version });
    expect(body).not.toHaveProperty("clientDraft");
    ui.unmount();
    const respond = release;
    if (!respond) throw new Error("Missing Event edit response");
    await act(async () =>
      respond(Response.json({ error: status === 409 ? "EVENT_CHANGED" : "UNKNOWN" }, { status })),
    );
    await waitFor(() =>
      expect(
        client
          .getMutationCache()
          .getAll()
          .some((mutation) => mutation.state.status === "error"),
      ).toBe(true),
    );
    const restored = mount(true, undefined, client);
    expect(
      ((await screen.findByRole("textbox", { name: "Event name" })) as HTMLInputElement).value,
    ).toBe("Retained Event edit");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await expandExistingTable();
    await screen.findByRole("button", { name: "Remove table" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect((screen.getByRole("button", { name: "Save event" }) as HTMLButtonElement).disabled).toBe(
      status === 503,
    );
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    if (status === 503) {
      canonical = { ...plannedEvent, name: "Verified canonical Event", version: 2 };
      await act(async () =>
        client.fetchQuery({
          ...eventRecordQuery(
            { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" },
            eventId,
          ),
          staleTime: 0,
        }),
      );
      await screen.findByText("This event changed. Go back and reopen the editor before saving.");
      restored.ui.unmount();
      mount(true, undefined, client);
      expect(
        ((await screen.findByRole("textbox", { name: "Event name" })) as HTMLInputElement).value,
      ).toBe(canonical.name);
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    }
  },
);
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
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Context event" },
  });
  openSchedule();
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
  await expandExistingTable();
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
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "Create event" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose a game" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "Add game" })).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a game" })).not.toBeNull();
});
it("leaves final review immediately but retains the complete failed draft for explicit recovery", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response('{"error":"Conflict","code":"TABLE_TIME_CONFLICT"}', { status: 409 })
        : new Response('{"items":[],"nextCursor":null}'),
    ),
  );
  const { client } = mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Friday games" },
  });
  openSchedule();
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T20:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
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
  expect(m.replace).toHaveBeenCalledWith("/events?section=available");
  await waitFor(() =>
    expect(m.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "create_event"),
  );
  const failed = client
    .getMutationCache()
    .getAll()
    .find(
      (mutation) =>
        mutation.options.mutationKey?.[5] === "create" && mutation.state.status === "error",
    );
  const variables = failed?.state.variables as CreateEventVariables | undefined;
  expect(variables?.clientDraft).toMatchObject({
    name: "Friday games",
    tables: [{ name: "First table", games: [{ id: 1, name: "Chess" }] }],
    locations: [{ name: "Club venue" }],
  });
  expect(m.feedback.onOptimisticUpdate).toHaveBeenCalledWith("create_event");
  expect(m.feedback.onSuccess).not.toHaveBeenCalled();
});
it("keeps validation attempts reachable, showing blocking schedule errors without advancing", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('{"items":[],"nextCursor":null}')),
  );
  mount();
  const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
  expect(next.disabled).toBe(false);
  expect(next.textContent).toBe("");
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect((screen.getByRole("button", { name: "4. Review" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.queryByLabelText("Time zone")).toBeNull();
  expect(screen.getByPlaceholderText("Friday game night")).not.toBeNull();
  fireEvent.click(next);
  expect(next.disabled).toBe(false);
  expect(screen.getByRole("textbox", { name: "Event name" }).getAttribute("aria-invalid")).toBe(
    "true",
  );
  expect(screen.getByText("Enter an event name between 5 and 120 characters.")).not.toBeNull();
  expect(screen.queryByText("Choose at least one valid date and time.")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: "Friday games" },
  });
  openSchedule();
  fireEvent.change(screen.getByLabelText("Date and time"), {
    target: { value: "2030-06-03T20:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(screen.getByRole("button", { name: "Add date" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose verified location" }));
  expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  expect(
    screen.getByRole("button", { name: "Remove location: Club venue" }).closest("li"),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: "Remove date: 2030-06-03 20:00" }).closest("li"),
  ).not.toBeNull();
  expect(screen.getByRole("button", { name: "Choose a location" })).not.toBeNull();
  expect(m.replace).not.toHaveBeenCalled();
});

it.each([null, "PRIVATE", "PUBLIC"] as const)(
  "shows both visibility cards with public available only for a public group: %s",
  async (type) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.includes("/groups/") ? { ...groupRecord, type } : { items: [], nextCursor: null },
        ),
      ),
    );
    mount(false, type ? optionId : undefined);
    const privateRadio = screen.getByRole("radio", { name: "Private" }) as HTMLInputElement;
    const publicRadio = screen.getByRole("radio", { name: "Public" }) as HTMLInputElement;
    expect(privateRadio.checked).toBe(true);
    await waitFor(() => expect(publicRadio.disabled).toBe(type !== "PUBLIC"));
    expect(privateRadio.disabled).toBe(false);
    if (type === "PUBLIC") {
      fireEvent.click(publicRadio);
      expect(publicRadio.checked).toBe(true);
    }
  },
);

it("locks both event visibility cards and the group selector when editing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("/tables?")
          ? { items: [plannedTable], nextCursor: null }
          : url.includes("/groups/")
            ? { ...groupRecord, type: "PUBLIC" }
            : { ...plannedEvent, groupId: optionId, groupType: "PUBLIC", visibility: "PUBLIC" },
      ),
    ),
  );
  mount(true);
  const publicRadio = (await screen.findByRole("radio", { name: "Public" })) as HTMLInputElement;
  expect(publicRadio.checked).toBe(true);
  expect(publicRadio.disabled).toBe(true);
  expect((screen.getByRole("radio", { name: "Private" }) as HTMLInputElement).disabled).toBe(true);
  expect(
    ((await screen.findByRole("button", { name: /Group$/ })) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect(publicRadio.checked).toBe(true);
});

it("restores canonical edit ownership and visibility despite a tampered recovered draft and rejects later changes", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [], nextCursor: null })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const canonical = { ...plannedEvent, visibility: "PRIVATE" as const };
  const recovered = {
    ...eventDraft(canonical),
    groupId: optionId,
    visibility: "PUBLIC" as const,
    name: "Recovered unsaved name",
  };
  const { result } = renderHook(
    () =>
      useEventRecordForm(
        { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" },
        canonical,
        undefined,
        recovered,
      ),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  expect(result.current.draft).toMatchObject({
    groupId: null,
    visibility: "PRIVATE",
    name: "Recovered unsaved name",
  });
  expect(result.current.groupLocked).toBe(true);
  expect(result.current.visibilityLocked).toBe(true);
  act(() => {
    result.current.patch({ groupId: optionId });
    result.current.selectGroup(optionId, "PUBLIC");
    result.current.patch({ visibility: "PUBLIC" });
  });
  expect(result.current.draft).toMatchObject({
    groupId: null,
    visibility: "PRIVATE",
    name: "Recovered unsaved name",
  });
});

it("keeps several table panels open, expands new and invalid tables, and preserves expansion through picker cancellation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("/tables?")
          ? { items: [plannedTable], nextCursor: null }
          : url.includes("/favorites")
            ? { items: [], nextCursor: null }
            : plannedEvent,
      ),
    ),
  );
  mount(true);
  await screen.findByRole("textbox", { name: "Event name" });
  openSchedule();
  await expandExistingTable();
  fireEvent.click(screen.getByRole("button", { name: "Add table" }));
  const tableNames = screen.getAllByRole("textbox", { name: "Table name" });
  expect(tableNames).toHaveLength(2);
  fireEvent.change(tableNames[1], { target: { value: "Second table" } });
  const first = screen.getByRole("button", { name: "First table" });
  const second = screen.getByRole("button", { name: "Second table" });
  expect(first.getAttribute("aria-expanded")).toBe("true");
  expect(second.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getAllByRole("button", { name: "Choose a game" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Cancel game picker" }));
  expect(screen.getAllByRole("textbox", { name: "Table name" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Remove game: Chess" }));
  fireEvent.click(screen.getByRole("button", { name: "First table" }));
  expect(screen.getByRole("button", { name: "First table" }).getAttribute("aria-expanded")).toBe(
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "First table" }).getAttribute("aria-expanded")).toBe(
      "true",
    ),
  );
  expect(screen.getByRole("button", { name: "Second table" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(screen.getAllByText("Choose at least one game.")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "Choose a game" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Choose catalog game" }));
  expect(screen.getAllByRole("textbox", { name: "Table name" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Second table" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
});
