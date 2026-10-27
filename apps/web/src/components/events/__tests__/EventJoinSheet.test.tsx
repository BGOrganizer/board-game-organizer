import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventRecordKeys, useEventJoinForm } from "@board-game-organizer/shared";
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
          { status: failed ? 503 : 201 },
        )
      : new Response(JSON.stringify(url.includes("/tables/") ? table : event), {
          status: url.includes("/tables/") ? tableStatus : loadStatus,
        }),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    close = vi.fn();
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventJoinSheet eventId={eventId} tableId={tableId} onClose={close} />
    </QueryClientProvider>,
  );
  return { client, close };
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
it("requires three explicit dimensions and saves game votes and initial availability in one join", async () => {
  const { close } = mount(),
    confirm = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  expect((await screen.findByRole("tab", { name: "Dates" })).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  fireEvent.click(await screen.findByRole("button", { name: "2030-06-03 20:00: No" }));
  expect(confirm.disabled).toBe(true);
  expect(posts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "2030-06-03 20:00: If needed" }));
  fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
  fireEvent.click(await screen.findByRole("button", { name: "Club venue: Yes" }));
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  fireEvent.click(await screen.findByRole("button", { name: "Chess: No" }));
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Chess: If needed" }));
  await waitFor(() => expect(confirm.disabled).toBe(false));
  expect(screen.queryByRole("button", { name: /Unknown/ })).toBeNull();
  fireEvent.click(confirm);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(1);
  expect(JSON.parse(posts()[0][1].body as string)).toEqual({
    version: 1,
    gameVotes: { "1": "IF_NEEDED" },
    availability: {
      version: 1,
      dateVotes: { [optionId]: "IF_NEEDED" },
      locationVotes: { [optionId]: "YES" },
    },
  });
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes("/votes"))).toBe(true);
});
it.each(["PRIVATE", "PUBLIC", null] as const)(
  "shows all three tabs, opens Games for existing participation and preserves fixed schedules for %s",
  async (groupType) => {
    event = {
      ...event,
      groupType,
      myRegistrations: [{ ...seat("owner"), tableId: eventId }],
      myVotes: { dateVotes: { [optionId]: "YES" }, locationVotes: { [optionId]: "IF_NEEDED" } },
    };
    const { close } = mount();
    expect((await screen.findByRole("tab", { name: "Games" })).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    fireEvent.click(await screen.findByRole("button", { name: "Chess: Yes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Dates" }));
    if (groupType === "PRIVATE") {
      expect(
        (await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" })).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "2030-06-03 20:00: If needed" }));
    } else expect(screen.queryByRole("button", { name: /2030-06-03.*: Yes/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
    if (groupType === "PRIVATE") {
      expect(
        (await screen.findByRole("button", { name: "Club venue: If needed" })).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Club venue: Yes" }));
    } else {
      await screen.findByText("Club venue");
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
      gameVotes: { "1": "YES" },
      ...(groupType === "PRIVATE"
        ? {
            availability: {
              version: 1,
              dateVotes: { [optionId]: "IF_NEEDED" },
              locationVotes: { [optionId]: "YES" },
            },
          }
        : {}),
    });
  },
);
it.each(["PUBLIC", null] as const)(
  "opens Dates for first enrollment with all tabs and read-only fixed schedule (%s)",
  async (groupType) => {
    event = { ...event, groupType };
    const { close } = mount();
    expect((await screen.findByRole("tab", { name: "Dates" })).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "2030-06-03 20:00: Yes" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
    await screen.findByText("Club venue");
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    fireEvent.click(await screen.findByRole("button", { name: "Chess: If needed" }));
    fireEvent.click(screen.getByRole("button", { name: "Join table" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(JSON.parse(String(posts()[0][1].body))).toEqual({
      version: 1,
      gameVotes: { "1": "IF_NEEDED" },
    });
  },
);
it.each(["PENDING", "DECLINED", "CANCELLED"] as const)(
  "does not treat %s participation as a previous join",
  async (status) => {
    event = { ...event, myRegistrations: [{ ...seat("owner"), tableId: eventId, status }] };
    mount();
    expect((await screen.findByRole("tab", { name: "Dates" })).getAttribute("aria-selected")).toBe(
      "true",
    );
  },
);
it("waits for participation metadata and does not reset the initial tab on later refetches", async () => {
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
  tableStatus = 503;
  const { close } = mount();
  await screen.findByRole("alert");
  expect((screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" })).not.toBeNull();
  tableStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  await screen.findByRole("button", { name: "Chess: Yes" });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(0);
});
it("retains game/date drafts after failure and never saves partial preferences", async () => {
  event = {
    ...event,
    myVotes: { dateVotes: { [optionId]: "YES" }, locationVotes: { [optionId]: "IF_NEEDED" } },
  };
  failed = true;
  const { close } = mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Games" }));
  fireEvent.click(await screen.findByRole("button", { name: "Chess: Yes" }));
  const confirm = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await screen.findByText("Could not join table");
  expect(close).not.toHaveBeenCalled();
  failed = false;
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(2);
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes("/votes"))).toBe(true);
});
it("trims replaced game/date IDs, ignores UNKNOWN edits and submits the fresh Event version", async () => {
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
  act(() => {
    result.current.choose("date", optionId, "YES");
    result.current.choose("game", "1", "YES");
  });
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  const next = "44444444-4444-4444-8444-444444444444";
  event = { ...event, version: 2, dates: [{ id: next, day: "2030-06-04" }] };
  table = {
    ...table,
    games: [{ gameId: 2, durationMinutes: 60, durationSource: "MANUAL" }],
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
    result.current.choose("game", "2", "IF_NEEDED");
  });
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  await act(async () => {
    await result.current.submit();
  });
  expect(JSON.parse(posts()[0][1].body as string)).toMatchObject({
    version: 2,
    gameVotes: { "2": "IF_NEEDED" },
    availability: { dateVotes: { [next]: "IF_NEEDED" } },
  });
});
it("hides denied caches and blocks nonplanning/unavailable/missing participation metadata", async () => {
  const { result, client } = hook();
  await waitFor(() => expect(result.current.table).toBeDefined());
  act(() => {
    result.current.choose("date", optionId, "YES");
    result.current.choose("location", optionId, "YES");
    result.current.choose("game", "1", "YES");
  });
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  loadStatus = 403;
  await act(async () => {
    await client.invalidateQueries({ queryKey: eventRecordKeys.detail(options, eventId) });
  });
  await waitFor(() => expect(result.current.event).toBeUndefined());
  expect(result.current.canSubmit).toBe(false);
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
  event = { ...event, groupType: null };
  table = { ...table, gamesDetail: [] };
  const { close } = mount();
  expect((await screen.findByRole("tab", { name: "Dates" })).getAttribute("aria-selected")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  fireEvent.click(await screen.findByRole("button", { name: "Unknown: Yes" }));
  expect(screen.queryByRole("button", { name: "Unknown: Unknown" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Join table" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(JSON.parse(String(posts()[0][1].body)).gameVotes).toEqual({ "1": "YES" });
});
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
