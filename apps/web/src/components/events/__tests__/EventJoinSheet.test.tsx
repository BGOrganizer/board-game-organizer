import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventRecordKeys,
  useEventJoinForm,
  useEventRecord,
  useEventRecordActions,
  useRecordTable,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  eventId,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
  tableId,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventJoinSheet } from "../EventJoinSheet";
import { EventTableSeats } from "../EventTableSeats";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const token = vi.hoisted(() => vi.fn(async () => "fresh"));
const options = { apiUrl: "https://api.test", userId: "owner", getToken: token };
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "owner", getToken: token }),
}));
let event: PlannedEventResponse,
  table: PlannedTableResponse,
  failed = false,
  loadStatus = 200,
  tableStatus = 200;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  failed = false;
  loadStatus = 200;
  tableStatus = 200;
  token.mockClear();
  event = { ...plannedEvent, groupType: "PRIVATE" };
  table = { ...plannedTable };
  fetcher = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(
          JSON.stringify(
            failed ? {} : { ...seat("owner"), gameVotes: JSON.parse(String(init.body)).gameVotes },
          ),
          { status: failed ? 409 : 201 },
        )
      : new Response(JSON.stringify(url.includes("/tables/") ? table : event), {
          status: url.includes("/tables/") ? tableStatus : loadStatus,
        }),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
function mount(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  const close = vi.fn();
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <EventJoinSheet eventId={eventId} tableId={tableId} onClose={close} />
    </QueryClientProvider>,
  );
  return { client, close, ...view };
}
function hook() {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    close = vi.fn();
  const q = renderHook(() => useEventJoinForm(options, eventId, tableId, close), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...q, client, close };
}
const posts = () => fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
const alternativeId = "55555555-5555-4555-8555-555555555555";
function multipleOptions(mask = 7) {
  event = {
    ...event,
    dates:
      mask & 1
        ? [...plannedEvent.dates, { id: alternativeId, day: "2030-06-05" }]
        : plannedEvent.dates,
    locations:
      mask & 2
        ? [
            ...plannedEvent.locations,
            { ...plannedEvent.locations[0], id: alternativeId, name: "Alternative venue" },
          ]
        : plannedEvent.locations,
  };
  table = {
    ...table,
    games:
      mask & 4
        ? [...plannedTable.games, { gameId: 99, durationMinutes: 60, durationSource: "MANUAL" }]
        : plannedTable.games,
    gamesDetail:
      mask & 4
        ? [
            ...plannedTable.gamesDetail,
            { id: 99, name: "Alternative game", imageUrl: null, year: null },
          ]
        : plannedTable.gamesDetail,
  };
}
function chooseAll(form: ReturnType<typeof useEventJoinForm>) {
  for (const row of event.dates) form.choose("date", row.id, "YES");
  for (const row of event.locations) form.choose("location", row.id, "YES");
  for (const row of table.games) form.choose("game", String(row.gameId), "YES");
}
// Explicitly reject the other options while testing the primary preference.
function vote(button: HTMLElement) {
  fireEvent.click(button);
  for (const name of ["2030-06-05 20:00: No", "Alternative venue: No", "Alternative game: No"]) {
    const alternative = screen.queryByRole("button", { name });
    if (alternative) fireEvent.click(alternative);
  }
}
it.each(["apiUrl", "userId"] as const)(
  "drops old local ballot choices immediately when %s changes",
  async (field) => {
    multipleOptions();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const close = vi.fn();
    const view = renderHook(({ settings }) => useEventJoinForm(settings, eventId, tableId, close), {
      initialProps: { settings: options },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.initialTab).toBe("dates"));
    act(() => chooseAll(view.result.current));
    expect(view.result.current.votes.gameVotes).toEqual({ "1": "YES", "99": "YES" });
    view.rerender({
      settings: { ...options, [field]: field === "apiUrl" ? "https://other.test" : "other-user" },
    });
    await waitFor(() => expect(view.result.current.initialTab).toBe("dates"));
    expect(view.result.current.votes).toEqual({ dateVotes: {}, locationVotes: {}, gameVotes: {} });
    expect(view.result.current.canSubmit).toBe(false);
    expect(posts()).toHaveLength(0);
    view.unmount();
    clearSessionQueryCache(client);
  },
);
it("renders an unknown join as intent, not an accepted seat, and offers reads without reposting its consent", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Response.json({ error: "UNKNOWN" }, { status: 503 })
      : Response.json(
          url.includes("/seats?")
            ? { items: [], nextCursor: null }
            : url.includes("/tables/")
              ? table
              : event,
        ),
  );
  const provider = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const driver = renderHook(
    () => ({
      event: useEventRecord(options, eventId),
      table: useRecordTable(options, eventId, tableId),
      actions: useEventRecordActions(options, eventId),
    }),
    { wrapper: provider },
  );
  await waitFor(() =>
    expect(driver.result.current.table.isSuccess && driver.result.current.event.isSuccess).toBe(
      true,
    ),
  );
  const roster = renderWithI18n(
    <QueryClientProvider client={client}>
      <EventTableSeats table={table} hasJoinedEvent={false} onRemove={vi.fn()} />
    </QueryClientProvider>,
  );
  act(() =>
    driver.result.current.actions.register.mutate({
      tableId,
      version: event.version,
      gameVotes: { "1": "YES" },
      availability: {
        version: event.version,
        dateVotes: { [optionId]: "YES" },
        locationVotes: { [optionId]: "YES" },
      },
    }),
  );
  await screen.findByRole("button", { name: "Checking saved changes" });
  expect(screen.getByText("You")).toBeTruthy();
  const editor = mount(client);
  const reads = fetcher.mock.calls.filter(
    ([, init]) => !init?.method || init.method === "GET",
  ).length;
  fireEvent.click(await screen.findByRole("button", { name: "Check saved changes" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, init]) => !init?.method || init.method === "GET").length,
    ).toBeGreaterThanOrEqual(reads + 2),
  );
  expect((screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(posts()).toHaveLength(1);
  expect(driver.result.current.table.data?.myRegistration).toBeNull();
  editor.unmount();
  roster.unmount();
  driver.unmount();
  clearSessionQueryCache(client);
});
it.each(["accept", "invite"] as const)(
  "paints %s intent in existing roster rows before HTTP, without granting an accepted registration",
  async (action) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invitation = { ...seat("owner"), status: "PENDING" as const };
    if (action === "accept") {
      event = {
        ...event,
        adminUserId: "organizer",
        groupId: optionId,
        role: "invited",
        canEdit: false,
        canInvite: false,
        myRegistrations: [invitation],
      };
      table = {
        ...table,
        adminUserId: "organizer",
        groupId: optionId,
        groupType: "PRIVATE",
        canInvite: false,
        canRegister: false,
        canRespond: true,
        myRegistration: invitation,
      };
    }
    let release: ((response: Response) => void) | undefined;
    fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "POST" || init?.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Response.json(
            url.includes("/seats?")
              ? { items: [], nextCursor: null }
              : url.includes("/tables/")
                ? table
                : event,
          ),
    );
    const provider = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const driver = renderHook(
      () => ({
        event: useEventRecord(options, eventId),
        table: useRecordTable(options, eventId, tableId),
        actions: useEventRecordActions(options, eventId),
      }),
      { wrapper: provider },
    );
    await waitFor(() =>
      expect(driver.result.current.table.isSuccess && driver.result.current.event.isSuccess).toBe(
        true,
      ),
    );
    const roster = renderWithI18n(
      <QueryClientProvider client={client}>
        <EventTableSeats table={table} hasJoinedEvent={false} onRemove={vi.fn()} />
      </QueryClientProvider>,
    );
    act(() => {
      if (action === "invite")
        driver.result.current.actions.invite.mutate({
          tableId,
          userId: "friend",
          person: { name: "Known friend", username: "friend", avatarUrl: null },
        });
      else
        driver.result.current.actions.respond.mutate({
          tableId,
          registrationId: invitation.id,
          input: {
            action: "accept",
            version: invitation.version,
            participation: {
              version: event.version,
              gameVotes: { "1": "YES" },
              availability: {
                version: event.version,
                dateVotes: { [optionId]: "YES" },
                locationVotes: { [optionId]: "YES" },
              },
            },
          },
        });
    });
    const label = action === "accept" ? "Accepting invitation" : "Sending invitation";
    await screen.findByRole("button", { name: label });
    await waitFor(() => expect(release).toBeDefined());
    expect(driver.result.current.table.data?.myRegistration?.status).not.toBe("ACCEPTED");
    const respond = release;
    if (!respond) throw new Error("Missing held roster request");
    await act(async () => respond(Response.json({ error: "REJECTED" }, { status: 409 })));
    await waitFor(() => expect(screen.queryByRole("button", { name: label })).toBeNull());
    roster.unmount();
    driver.unmount();
    clearSessionQueryCache(client);
  },
);
it("requires three explicit dimensions and saves game votes and initial availability in one join", async () => {
  multipleOptions();
  const { close } = mount(),
    confirm = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  expect((await screen.findByRole("tab", { name: "Dates" })).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  vote(await screen.findByRole("button", { name: "2030-06-03 20:00: No" }));
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  expect(
    await screen.findByText(
      "Answer every option and choose at least one Yes or If needed in each section.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("group", { name: "2030-06-03 20:00" }).getAttribute("aria-invalid")).toBe(
    "true",
  );
  expect(posts()).toHaveLength(0);
  vote(screen.getByRole("button", { name: "2030-06-03 20:00: If needed" }));
  fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
  vote(await screen.findByRole("button", { name: "Club venue: Yes" }));
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Games" }).getAttribute("aria-selected")).toBe("true"),
  );
  expect(posts()).toHaveLength(0);
  vote(await screen.findByRole("button", { name: "Chess: No" }));
  fireEvent.click(confirm);
  expect(posts()).toHaveLength(0);
  vote(screen.getByRole("button", { name: "Chess: If needed" }));
  await waitFor(() => expect(confirm.disabled).toBe(false));
  expect(screen.queryByRole("button", { name: /Unknown/ })).toBeNull();
  fireEvent.click(confirm);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(1);
  expect(JSON.parse(posts()[0][1].body as string)).toEqual({
    version: 1,
    gameVotes: { "1": "IF_NEEDED", "99": "NO" },
    availability: {
      version: 1,
      dateVotes: { [optionId]: "IF_NEEDED", [alternativeId]: "NO" },
      locationVotes: { [optionId]: "YES", [alternativeId]: "NO" },
    },
  });
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes("/votes"))).toBe(true);
});
it.each(["PRIVATE", "PUBLIC", null] as const)(
  "opens Games for existing participation, showing schedule tabs only for multiple PRIVATE choices: %s",
  async (groupType) => {
    multipleOptions(groupType !== "PUBLIC" ? 7 : 4);
    event = {
      ...event,
      groupType,
      myRegistrations: [{ ...seat("owner"), tableId: eventId }],
      myVotes: {
        dateVotes: { [optionId]: "YES", [alternativeId]: "NO" },
        locationVotes: { [optionId]: "IF_NEEDED", [alternativeId]: "NO" },
      },
    };
    const { close } = mount();
    expect((await screen.findByRole("tab", { name: "Games" })).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getAllByRole("tab")).toHaveLength(groupType !== "PUBLIC" ? 3 : 1);
    vote(await screen.findByRole("button", { name: "Chess: Yes" }));
    if (groupType !== "PUBLIC") {
      fireEvent.click(screen.getByRole("tab", { name: "Dates" }));
      expect(
        (await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" })).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "2030-06-03 20:00: If needed" }));
    } else {
      expect(screen.queryByRole("tab", { name: "Dates" })).toBeNull();
      expect(screen.queryByRole("button", { name: /2030-06-03.*: Yes/ })).toBeNull();
    }
    if (groupType !== "PUBLIC") {
      fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
      expect(
        (await screen.findByRole("button", { name: "Club venue: If needed" })).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Club venue: Yes" }));
    } else {
      await screen.findByText("Club venue");
      expect(screen.queryByRole("tab", { name: "Locations" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Club venue: Yes" })).toBeNull();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    expect(screen.getByRole("button", { name: "Chess: Yes" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Join table" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(JSON.parse(posts()[0][1].body as string)).toEqual({
      version: 1,
      gameVotes: { "1": "YES", "99": "NO" },
      ...(groupType !== "PUBLIC"
        ? {
            availability: {
              version: 1,
              dateVotes: { [optionId]: "IF_NEEDED", [alternativeId]: "NO" },
              locationVotes: { [optionId]: "YES", [alternativeId]: "NO" },
            },
          }
        : {}),
    });
  },
);
it.each(["PUBLIC", null] as const)(
  "opens only Games for multiple game options, keeping fixed schedule read-only (%s)",
  async (groupType) => {
    multipleOptions(4);
    event = { ...event, groupType };
    const { close } = mount();
    expect((await screen.findByRole("tab", { name: "Games" })).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "2030-06-03 20:00: Yes" })).toBeNull();
    await screen.findByText("Club venue");
    vote(await screen.findByRole("button", { name: "Chess: If needed" }));
    fireEvent.click(screen.getByRole("button", { name: "Join table" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(JSON.parse(String(posts()[0][1].body))).toEqual({
      version: 1,
      gameVotes: { "1": "IF_NEEDED", "99": "NO" },
      ...(groupType !== "PUBLIC"
        ? { availability: { version: 1, dateVotes: {}, locationVotes: {} } }
        : {}),
    });
  },
);
it.each(["PENDING", "DECLINED", "CANCELLED"] as const)(
  "does not treat %s participation as a previous join",
  async (status) => {
    multipleOptions();
    event = { ...event, myRegistrations: [{ ...seat("owner"), tableId: eventId, status }] };
    mount();
    expect((await screen.findByRole("tab", { name: "Dates" })).getAttribute("aria-selected")).toBe(
      "true",
    );
  },
);
it("waits for participation metadata and does not reset the initial tab on later refetches", async () => {
  multipleOptions();
  delete (event as Partial<PlannedEventResponse>).myRegistrations;
  const { result } = hook();
  await waitFor(() => expect(result.current.table).toBeDefined());
  expect(result.current.initialTab).toBeUndefined();
  expect(result.current.canSubmit).toBe(false);
  event = { ...event, myRegistrations: [{ ...seat("owner"), tableId: eventId }] };
  await act(async () => {
    await result.current.q.refetch();
  });
  await waitFor(() => expect(result.current.initialTab).toBe("games"));
  event = { ...event, myRegistrations: [] };
  await act(async () => {
    await result.current.q.refetch();
  });
  expect(result.current.initialTab).toBe("games");
});
it("keeps edits to existing PRIVATE availability local when canceling a repeat join", async () => {
  multipleOptions();
  event = {
    ...event,
    myRegistrations: [{ ...seat("owner"), tableId: eventId }],
    myVotes: { dateVotes: { [optionId]: "YES" }, locationVotes: { [optionId]: "YES" } },
  };
  const { client, close } = mount();
  await screen.findByRole("tab", { name: "Games" });
  fireEvent.click(screen.getByRole("tab", { name: "Dates" }));
  fireEvent.click(await screen.findByRole("button", { name: "2030-06-03 20:00: If needed" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
  expect(close).toHaveBeenCalledOnce();
  expect(posts()).toHaveLength(0);
  expect(
    client.getQueryData<PlannedEventResponse>(eventRecordKeys.detail(options, eventId))?.myVotes
      ?.dateVotes[optionId],
  ).toBe("YES");
});
it("keeps known date choices visible while Table loading fails, offers retry, and cancels without a write", async () => {
  multipleOptions();
  tableStatus = 503;
  const { close } = mount();
  await screen.findByRole("alert");
  expect((screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" })).not.toBeNull();
  tableStatus = 200;
  expect(screen.queryByRole("tab", { name: "Games" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(await screen.findByRole("tab", { name: "Games" }));
  await screen.findByRole("button", { name: "Chess: Yes" });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(0);
});
it("closes immediately and restores rejected game/date drafts on explicit reopening without saving partial preferences", async () => {
  multipleOptions();
  event = {
    ...event,
    myVotes: {
      dateVotes: { [optionId]: "YES", [alternativeId]: "NO" },
      locationVotes: { [optionId]: "IF_NEEDED", [alternativeId]: "NO" },
    },
  };
  failed = true;
  const { client, close, unmount } = mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Games" }));
  vote(await screen.findByRole("button", { name: "Chess: Yes" }));
  const confirm = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  expect(close).toHaveBeenCalledOnce();
  unmount();
  await waitFor(() =>
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.status === "error"),
    ).toBe(true),
  );
  expect(posts()).toHaveLength(1);
  const restored = mount(client);
  await screen.findByText("Could not join table");
  expect(
    (await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" })).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  expect(
    (await screen.findByRole("button", { name: "Chess: Yes" })).getAttribute("aria-pressed"),
  ).toBe("true");
  failed = false;
  const retry = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  await waitFor(() => expect(retry.disabled).toBe(false));
  fireEvent.click(retry);
  expect(restored.close).toHaveBeenCalledOnce();
  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes("/votes"))).toBe(true);
  restored.unmount();
  client.clear();
});
it("trims replaced game/date IDs, ignores UNKNOWN edits and submits the fresh Event version", async () => {
  multipleOptions();
  event = {
    ...event,
    myVotes: { dateVotes: { [optionId]: "UNKNOWN" }, locationVotes: { [optionId]: "YES" } },
  };
  const { result, client } = hook();
  await waitFor(() => expect(result.current.table).toBeDefined());
  await act(async () => {
    await result.current.submit();
    result.current.choose("date", optionId, "UNKNOWN");
    result.current.choose("game", "1", "UNKNOWN");
  });
  expect(posts()).toHaveLength(0);
  expect(result.current.canSubmit).toBe(false);
  act(() => chooseAll(result.current));
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  const next = "44444444-4444-4444-8444-444444444444";
  event = {
    ...event,
    version: 2,
    dates: [
      { id: next, day: "2030-06-04" },
      { id: eventId, day: "2030-06-06" },
    ],
  };
  table = {
    ...table,
    games: [
      { gameId: 2, durationMinutes: 60, durationSource: "MANUAL" },
      { gameId: 3, durationMinutes: 60, durationSource: "MANUAL" },
    ],
    gamesDetail: [{ id: 2, name: "Second game", imageUrl: null, year: null }],
  };
  await act(async () => {
    await client.invalidateQueries({ queryKey: eventRecordKeys.root(options) });
  });
  await waitFor(() => expect(result.current.event?.version).toBe(2));
  expect(result.current.canSubmit).toBe(false);
  expect(result.current.votes.dateVotes).toEqual({});
  expect(result.current.votes.gameVotes).toEqual({});
  act(() => {
    result.current.choose("date", next, "IF_NEEDED");
    result.current.choose("date", eventId, "NO");
    result.current.choose("game", "2", "IF_NEEDED");
    result.current.choose("game", "3", "NO");
  });
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  await act(async () => {
    await result.current.submit();
  });
  expect(JSON.parse(posts()[0][1].body as string)).toMatchObject({
    version: 2,
    gameVotes: { "2": "IF_NEEDED", "3": "NO" },
    availability: { dateVotes: { [next]: "IF_NEEDED", [eventId]: "NO" } },
  });
});
it("hides denied caches and blocks nonplanning/unavailable/missing participation metadata", async () => {
  multipleOptions();
  const { result, client } = hook();
  await waitFor(() => expect(result.current.table).toBeDefined());
  act(() => chooseAll(result.current));
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  loadStatus = 403;
  await act(async () => {
    await client.invalidateQueries({ queryKey: eventRecordKeys.detail(options, eventId) });
  });
  await waitFor(() => expect(result.current.event).toBeUndefined());
  act(() => {
    result.current.choose("date", optionId, "YES");
    result.current.choose("location", optionId, "YES");
  });
  expect(result.current.canSubmit).toBe(false);
  expect(posts()).toHaveLength(0);
  loadStatus = 200;
  event = { ...event, status: "CONFIRMED" };
  await act(async () => {
    await result.current.q.refetch();
  });
  await waitFor(() => expect(result.current.event?.status).toBe("CONFIRMED"));
  expect(result.current.canSubmit).toBe(false);
  event = { ...event, status: "PLANNING" };
  delete (event as Partial<PlannedEventResponse>).myRegistrations;
  await act(async () => {
    await result.current.q.refetch();
  });
  await waitFor(() => expect(result.current.event?.status).toBe("PLANNING"));
  expect(result.current.event?.myRegistrations).toBeUndefined();
  expect(result.current.canSubmit).toBe(false);
  expect(posts()).toHaveLength(0);
});
it("keeps missing catalog labels readable without turning them into an Unknown vote", async () => {
  multipleOptions(4);
  event = { ...event, groupType: null };
  table = { ...table, gamesDetail: table.gamesDetail.filter((game) => game.id !== 1) };
  const { close } = mount();
  expect((await screen.findByRole("tab", { name: "Games" })).getAttribute("aria-selected")).toBe(
    "true",
  );
  vote(await screen.findByRole("button", { name: "Unknown: Yes" }));
  expect(screen.queryByRole("button", { name: "Unknown: Unknown" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Join table" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(JSON.parse(String(posts()[0][1].body)).gameVotes).toEqual({ "1": "YES", "99": "NO" });
});
it.each([false, true])(
  "keeps known Event choices usable while preferred Games awaits complete metadata: placeholder=%s",
  async (placeholder) => {
    multipleOptions();
    event = { ...event, myRegistrations: [{ ...seat("owner"), tableId: eventId }] };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(eventRecordKeys.detail(options, eventId), event);
    if (placeholder)
      client.setQueryData(eventRecordKeys.tables(options, eventId), {
        pages: [{ items: [table], nextCursor: null }],
        pageParams: [""],
      });
    let release: ((response: Response) => void) | undefined;
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith(`/tables/${tableId}`)
        ? new Promise<Response>((done) => {
            release = done;
          })
        : original(url, init),
    );
    const driver = renderHook(() => useEventJoinForm(options, eventId, tableId, vi.fn()), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const view = mount(client);
    await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" });
    expect(driver.result.current.initialTab).toBeUndefined();
    expect(driver.result.current.canSubmit).toBe(false);
    expect(screen.queryByRole("tab", { name: "Games" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
    await waitFor(() => expect(release).toBeDefined());
    await act(async () => release!(Response.json(table)));
    await screen.findByRole("tab", { name: "Games" });
    await waitFor(() => expect(driver.result.current.initialTab).toBe("games"));
    expect(screen.getByRole("tab", { name: "Locations" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(posts()).toHaveLength(0);
    view.unmount();
    driver.unmount();
    client.clear();
  },
);
it("renders missing singleton catalog metadata read-only without inventing a ballot", async () => {
  table = { ...table, gamesDetail: [] };
  const view = mount();
  await screen.findByText("Unknown");
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Unknown: Yes" })).toBeNull();
  const submit = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(JSON.parse(String(posts()[0][1].body)).gameVotes).toEqual({});
  view.unmount();
  view.client.clear();
});
it.each(Array.from({ length: 8 }, (_, mask) => mask))(
  "reviews singleton settings without tabs or synthetic votes, voting only for multiple options: %s",
  async (mask) => {
    multipleOptions(mask);
    const view = mount();
    const tabs = [
      mask & 1 ? "Dates" : null,
      mask & 2 ? "Locations" : null,
      mask & 4 ? "Games" : null,
    ].filter((value): value is string => value !== null);
    await waitFor(() =>
      expect(
        view.client.getQueryState(eventRecordKeys.table(options, eventId, tableId))?.status,
      ).toBe("success"),
    );
    if (tabs.length) await screen.findByRole("tab", { name: tabs[0] });
    else await screen.findByText("Chess");
    expect(screen.queryAllByRole("tab")).toHaveLength(tabs.length);
    expect(posts()).toHaveLength(0);
    const submit = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
    if (tabs.length) {
      expect(submit.disabled).toBe(false);
      fireEvent.click(submit);
      expect(
        await screen.findByText(
          "Answer every option and choose at least one Yes or If needed in each section.",
        ),
      ).toBeTruthy();
      expect(posts()).toHaveLength(0);
    }
    for (const name of tabs) {
      fireEvent.click(screen.getByRole("tab", { name }));
      for (const button of screen.getAllByRole("button", { name: /: Yes$/ }))
        fireEvent.click(button);
    }
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(String(posts()[0][1].body))).toEqual({
      version: event.version,
      gameVotes: mask & 4 ? { "1": "YES", "99": "YES" } : {},
      availability: {
        version: event.version,
        dateVotes: mask & 1 ? { [optionId]: "YES", [alternativeId]: "YES" } : {},
        locationVotes: mask & 2 ? { [optionId]: "YES", [alternativeId]: "YES" } : {},
      },
    });
    expect(view.close).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/votes"))).toBe(false);
    view.unmount();
    view.client.clear();
  },
);
it("never re-registers an already active Table and does not convert old UNKNOWN ballots", async () => {
  table = {
    ...table,
    myRegistration: { ...seat("owner"), gameVotes: { "1": "UNKNOWN" } },
    canRegister: false,
  };
  const { result } = hook();
  await waitFor(() => expect(result.current.table).toBeDefined());
  expect(result.current.votes.gameVotes).toEqual({});
  expect(result.current.canSubmit).toBe(false);
  await act(async () => {
    await result.current.submit();
  });
  expect(posts()).toHaveLength(0);
});
it("blocks public enrollment at the exact cutoff even with a valid game preference", async () => {
  event = { ...event, groupType: "PUBLIC", bookingClosesAt: "2000-01-01T00:00:00Z" };
  const { result } = hook();
  await waitFor(() => expect(result.current.table).toBeDefined());
  act(() => result.current.choose("game", "1", "YES"));
  expect(result.current.canSubmit).toBe(false);
  await act(async () => {
    await result.current.submit();
  });
  expect(posts()).toHaveLength(0);
});
it("retains observable Event load errors and retry without showing private choices", async () => {
  multipleOptions();
  loadStatus = 503;
  const { close } = mount();
  await screen.findByRole("alert");
  loadStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" });
  fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
  expect(close).toHaveBeenCalledOnce();
  expect(posts()).toHaveLength(0);
});
