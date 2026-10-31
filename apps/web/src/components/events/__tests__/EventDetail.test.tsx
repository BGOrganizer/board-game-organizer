import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventDetail } from "../EventDetail";

const mocks = vi.hoisted(() => ({
  feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
    feedback: mocks.feedback,
  }),
}));
let event: PlannedEventResponse,
  tables: PlannedTableResponse[],
  fail = false,
  failWrite = false,
  fetcher: ReturnType<typeof vi.fn>;
function mount(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventDetail eventId={eventId} />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  const header = document.createElement("header");
  header.id = "page-header-actions";
  document.body.append(header);
  event = { ...plannedEvent };
  tables = [{ ...plannedTable }];
  fail = false;
  failWrite = false;
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (fail) return new Response("{}", { status: 503 });
    if (url.includes("/groups/"))
      return Response.json({
        ...groupRecord,
        id: new URL(url).pathname.split("/").at(-1),
        name: event.groupName ?? groupRecord.name,
      });
    if (init?.method === "PATCH") {
      if (failWrite) return new Response('{"error":"EVENT_CHANGED"}', { status: 409 });
      const input = JSON.parse(String(init.body));
      if (url.endsWith("/state")) {
        event = {
          ...event,
          status: input.action === "confirm" ? "CONFIRMED" : "PLANNING",
          version: event.version + 1,
          canConfirm: false,
          canEdit: false,
          canReplan: true,
        };
      } else if (url.endsWith("/votes")) {
        const field = input.kind === "location" ? "locationVotes" : "dateVotes";
        event = {
          ...event,
          myVotes: {
            dateVotes: { ...event.myVotes?.dateVotes },
            locationVotes: { ...event.myVotes?.locationVotes },
            [field]: { ...event.myVotes?.[field], [input.optionId]: input.vote },
          },
        };
      }
      return new Response(JSON.stringify(event));
    }
    return new Response(
      JSON.stringify(url.includes("/tables?") ? { items: tables, nextCursor: null } : event),
    );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById("page-header-actions")?.remove();
});
it.each([true, false])(
  "closes manual confirmation and announces intent before HTTP without inventing frozen state: committed=%s",
  async (committed) => {
    event = {
      ...event,
      canConfirm: true,
      participantCount: 2,
      agreement: {
        agreed: true,
        dateId: event.dates[0].id,
        locationId: event.locations[0].id,
        tables: [{ tableId: plannedTable.id, gameId: 1, participantIds: ["first", "second"] }],
        reasons: [],
      },
    };
    let finish: ((response: Response) => void) | undefined;
    const original = fetcher.getMockImplementation();
    if (!original) throw new Error("Missing read adapter");
    fetcher.mockImplementation((url: string, init?: RequestInit) =>
      url.endsWith("/state") && init?.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : original(url, init),
    );
    const client = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm event" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(finish).toBeDefined());
    expect(mocks.feedback.onOptimisticUpdate).toHaveBeenCalledWith("confirm_event");
    const key = eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId);
    expect(client.getQueryData(key)).toMatchObject({ status: "PLANNING", canConfirm: false });
    expect(screen.queryByRole("link", { name: "Register results" })).toBeNull();
    const respond = finish;
    if (!respond) throw new Error("Missing held confirmation");
    if (committed) {
      event = {
        ...event,
        status: "CONFIRMED",
        version: event.version + 1,
        canConfirm: false,
        canReplan: true,
      };
      await act(async () => respond(Response.json(event)));
      await waitFor(() =>
        expect(client.getQueryData(key)).toMatchObject({ status: "CONFIRMED", version: 2 }),
      );
    } else {
      await act(async () => respond(Response.json({ error: "EVENT_CHANGED" }, { status: 409 })));
      await waitFor(() =>
        expect(client.getQueryData(key)).toMatchObject({ status: "PLANNING", canConfirm: true }),
      );
      expect(mocks.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "confirm_event");
    }
    expect(
      fetcher.mock.calls.filter(
        ([url, init]) => url.endsWith("/state") && init?.method === "PATCH",
      ),
    ).toHaveLength(1);
    expect(mocks.feedback.onSuccess).not.toHaveBeenCalled();
  },
);
it("allows No only when another current location stays usable, independent of the date votes", async () => {
  const second = "77777777-7777-4777-8777-777777777777",
    first = event.locations[0].id;
  event = {
    ...event,
    groupType: "PRIVATE",
    canVote: true,
    locations: [...event.locations, { ...event.locations[0], id: second, name: "Second venue" }],
    myVotes: {
      dateVotes: { [event.dates[0].id]: "YES" },
      locationVotes: { [first]: "YES", [second]: "IF_NEEDED" },
    },
  };
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Club venue: Yes" }));
  expect((screen.getByRole("button", { name: "No" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "No" }));
  await screen.findByRole("button", { name: "Club venue: No" });
  fireEvent.click(screen.getByRole("button", { name: "Second venue: If needed" }));
  expect((screen.getByRole("button", { name: "No" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "2030-06-03 20:00: Yes" }));
  expect((screen.getByRole("button", { name: "No" }) as HTMLButtonElement).disabled).toBe(true);
});
it("keeps one usable date/location independently and still allows switching Yes to If needed", async () => {
  const second = "77777777-7777-4777-8777-777777777777",
    first = event.dates[0].id,
    venue = event.locations[0].id;
  event = {
    ...event,
    groupType: "PRIVATE",
    canVote: true,
    dates: [...event.dates, { id: second, day: "2030-06-04" }],
    myVotes: {
      dateVotes: { [first]: "YES", [second]: "IF_NEEDED" },
      locationVotes: { [venue]: "IF_NEEDED" },
    },
  };
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" }));
  expect((screen.getByRole("button", { name: "No" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Club venue: If needed" }));
  expect((screen.getByRole("button", { name: "No" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "No" }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  await screen.findByRole("button", { name: "Club venue: Yes" });
  expect(
    fetcher.mock.calls.some(
      ([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).kind === "location",
    ),
  ).toBe(true);
  event = {
    ...event,
    myVotes: { ...event.myVotes!, dateVotes: { [first]: "YES", [second]: "NO" } },
  };
  act(() =>
    client.setQueryData(
      eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
      event,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "2030-06-03 20:00: Yes" }));
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "No" }) as HTMLButtonElement).disabled).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "If needed" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([, init]) =>
          init?.method === "PATCH" && JSON.parse(String(init.body)).vote === "IF_NEEDED",
      ),
    ).toBe(true),
  );
});
it("puts confirmed-owner result registration in the header and icon-only replan in a bottom-right secondary FAB", async () => {
  event = { ...event, status: "CONFIRMED", canEdit: false, canReplan: true, canFinalize: true };
  mount();
  const register = await screen.findByRole("link", { name: "Register results" });
  expect(document.getElementById("page-header-actions")?.contains(register)).toBe(true);
  expect(register.textContent).toBe("");
  expect(register.querySelector("svg.lucide-clipboard-pen-line")).not.toBeNull();
  const reopen = screen.getByRole("button", { name: "Reopen planning" });
  expect(reopen.className).toContain("fixed");
  expect(reopen.className).toContain("right-4");
  expect(reopen.className).toContain("button--secondary");
  expect(reopen.textContent).toBe("");
  fireEvent.click(reopen);
  expect(
    within(screen.getByRole("dialog"))
      .getByRole("button", { name: "Confirm" })
      .querySelector("svg.lucide-rotate-ccw"),
  ).not.toBeNull();
});
it("blocks confirmed header navigation while only cached summary data is available, then enables the same link", async () => {
  event = { ...event, status: "CONFIRMED", canEdit: false, canFinalize: true };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(eventRecordKeys.list({ apiUrl: "https://api.test", userId: "owner" }), {
    pages: [{ items: [event], nextCursor: null }],
    pageParams: [""],
  });
  let resolve!: (value: Response) => void;
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.endsWith(`/events/${eventId}`)
      ? new Promise<Response>((done) => {
          resolve = done;
        })
      : original(url, init),
  );
  mount(client);
  const link = await screen.findByRole("link", { name: "Register results" });
  expect(fireEvent.click(link)).toBe(false);
  await act(async () => {
    resolve(new Response(JSON.stringify(event)));
  });
  await waitFor(() => expect(link.getAttribute("aria-disabled")).toBe("false"));
  document.addEventListener("click", (e) => e.preventDefault(), { once: true });
  fireEvent.click(link);
});
it("never exposes confirmed owner header/FAB actions to another viewer through inconsistent capabilities", async () => {
  event = {
    ...event,
    status: "CONFIRMED",
    adminUserId: "other",
    canEdit: false,
    canReplan: true,
    canFinalize: true,
  };
  mount();
  await screen.findByRole("heading", { name: event.name });
  expect(screen.queryByRole("link", { name: "Register results" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reopen planning" })).toBeNull();
});
it("separates same-day clock choices, restores every proposal on replan and never offers fixed public schedule votes", async () => {
  const later = "77777777-7777-4777-8777-777777777777";
  event = {
    ...event,
    canVote: true,
    groupType: "PRIVATE",
    locations: [
      ...event.locations,
      {
        ...event.locations[0],
        id: later,
        name: "New York venue",
        latitude: 40.71,
        longitude: -74.01,
        timeZone: "America/New_York",
      },
    ],
    dates: [
      { ...event.dates[0], startTime: "18:15" },
      { id: later, day: "2030-06-03", startTime: "21:30" },
    ],
    confirmed: {
      dateId: event.dates[0].id,
      locationId: event.locations[0].id,
      at: event.createdAt,
    },
  };
  const client = mount();
  expect(
    await screen.findByRole("button", { name: "2030-06-03 18:15: Choose your vote" }),
  ).not.toBeNull();
  expect(screen.queryByText("Times are local to the location chosen for the event.")).toBeNull();
  expect(screen.queryByText(/Europe\/Rome|America\/New_York/)).toBeNull();
  await selectVote("2030-06-03 21:30");
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/votes") && JSON.parse(String(init?.body)).optionId === later,
      ),
    ).toBe(true),
  );
  await waitFor(() => expect(client.isMutating()).toBe(0));
  event = { ...event, groupType: "PUBLIC" };
  await act(async () =>
    client.setQueryData(
      eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
      event,
    ),
  );
  await waitFor(() => expect(screen.queryAllByRole("button", { name: /: Yes$/ })).toHaveLength(0));
});
it("presents public start, end and booking cutoff with the same labelled date/time item structure", async () => {
  event = {
    ...event,
    groupType: "PUBLIC",
    endsAt: "2030-06-03T21:00:00Z",
    bookingClosesAt: "2030-06-03T16:00:00Z",
  };
  mount();
  for (const name of [
    "Start Date and Time",
    "End Date and Time",
    "Registration Deadline Date and Time",
  ]) {
    const section = await screen.findByRole("region", { name });
    expect(within(section).getByText(name)).not.toBeNull();
    expect(section.querySelector("li time")).not.toBeNull();
    expect(within(section).getByRole("button", { name: `${name}: Field help` })).not.toBeNull();
  }
});
async function selectVote(label: string) {
  fireEvent.click(await screen.findByRole("button", { name: `${label}: Choose your vote` }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Choose your vote" })).getByRole("button", {
      name: "Yes",
    }),
  );
}
it("places aggregate votes beneath date/time and location identities without enabling pending participants", async () => {
  event = {
    ...event,
    canVote: false,
    voteCounts: {
      dates: { [event.dates[0].id]: { YES: 2, NO: 0, IF_NEEDED: 1, UNKNOWN: 1 } },
      locations: { [event.locations[0].id]: { YES: 1, NO: 1, IF_NEEDED: 0, UNKNOWN: 2 } },
    },
  };
  mount();
  const date = await screen.findByLabelText("Votes: 2030-06-03 20:00"),
    location = screen.getByLabelText("Votes: Club venue");
  expect(date.closest("li")?.querySelector("time")).not.toBeNull();
  expect(location.closest("li")?.textContent).toContain("Club venue");
  expect(screen.queryByRole("button", { name: "Club venue: Choose your vote" })).toBeNull();
});
it("keeps terminated events read-only when no planning agreement is returned", async () => {
  event = {
    ...event,
    status: "TERMINATED",
    agreement: undefined,
    canVote: false,
    canEdit: false,
    canConfirm: false,
    canReplan: false,
    canFinalize: false,
  };
  tables = [];
  mount();
  expect(await screen.findByText(/Terminated/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm event" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reopen planning" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Yes/ })).toBeNull();
});
it("hides an inaccessible event rather than retaining private content after authorization failure", async () => {
  fetcher.mockImplementation(async () => new Response('{"error":"FORBIDDEN"}', { status: 403 }));
  mount();
  expect(await screen.findByText("Could not load event")).not.toBeNull();
  expect(screen.queryByRole("heading", { name: plannedEvent.name })).toBeNull();
});
it("hydrates missing agreement/table fields from a canonical list summary without enabling confirmation early", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    summary = {
      ...plannedEvent,
      groupId: "55555555-5555-4555-8555-555555555555",
      groupName: null,
      canConfirm: true,
      agreement: undefined,
    };
  client.setQueryData(eventRecordKeys.list({ apiUrl: "https://api.test", userId: "owner" }), {
    pages: [{ items: [summary], nextCursor: null }],
    pageParams: [""],
  });
  let release!: () => void;
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/tables?"))
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return original(url, init);
  });
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventDetail eventId={eventId} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: plannedEvent.name })).not.toBeNull();
  expect(
    (screen.getByRole("button", { name: "Confirm event" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await waitFor(() => expect(release).toBeTypeOf("function"));
  await act(async () => release());
  expect(await screen.findByRole("link", { name: "Open table: First table" })).not.toBeNull();
});
it("retries uncached event and table failures instead of turning them into empty success", async () => {
  fail = true;
  mount();
  expect(await screen.findByText("Could not load event")).not.toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: plannedEvent.name })).not.toBeNull();
  const retry = screen.queryByRole("button", { name: "Try again" });
  if (retry) fireEvent.click(retry);
  expect(await screen.findByRole("link", { name: "Open table: First table" })).not.toBeNull();
});
it("honors a results-only capability without showing an unavailable planning action", async () => {
  event = { ...event, status: "CONFIRMED", canReplan: false, canFinalize: true };
  mount();
  expect(await screen.findByRole("link", { name: "Register results" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Reopen planning" })).toBeNull();
});
it("confirms manually, permits replan after cutoff, and keeps failed transitions actionable", async () => {
  event = {
    ...event,
    status: "CONFIRMED",
    canVote: false,
    canEdit: false,
    canConfirm: false,
    canReplan: true,
    canFinalize: true,
    groupId: "55555555-5555-4555-8555-555555555555",
    groupName: "Our group",
    groupType: "PUBLIC",
    bookingClosesAt: "2000-01-01T00:00:00Z",
    endsAt: "2030-06-04T01:00:00Z",
    confirmed: {
      dateId: plannedEvent.dates[0].id,
      locationId: plannedEvent.locations[0].id,
      at: "2030-06-01T12:00:00Z",
    },
  };
  mount();
  expect(await screen.findByRole("link", { name: "Open group: Our group" })).not.toBeNull();
  expect(screen.getByRole("link", { name: "Register results" }).getAttribute("href")).toContain(
    "/results",
  );
  expect(screen.queryByRole("link", { name: "Edit event" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reopen planning" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  failWrite = true;
  fireEvent.click(screen.getByRole("button", { name: "Reopen planning" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() =>
    expect(mocks.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "replan_event"),
  );
  failWrite = false;
  const reopen = (await screen.findByRole("button", {
    name: "Reopen planning",
  })) as HTMLButtonElement;
  await waitFor(() => expect(reopen.disabled).toBe(false));
  fireEvent.click(reopen);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    fetcher.mock.calls.some(
      ([url, init]) => url.endsWith("/state") && JSON.parse(String(init?.body)).action === "replan",
    ),
  ).toBe(true);
});
it("renders pending/unavailable agreements, location votes, paging and manual confirmation", async () => {
  event = {
    ...event,
    canVote: true,
    canConfirm: true,
    myVotes: undefined,
    agreement: {
      agreed: true,
      dateId: plannedEvent.dates[0].id,
      locationId: plannedEvent.locations[0].id,
      tables: [],
      reasons: [
        { tableId: plannedTable.id, code: "PENDING_RESERVATIONS" },
        { tableId: "77777777-7777-4777-8777-777777777777", code: "GAME_DISAGREEMENT" },
        { tableId: "88888888-8888-4888-8888-888888888888", code: "NO_AGREEMENT" },
      ],
    },
  };
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/tables?"))
      return new Response(
        JSON.stringify(
          new URL(url).searchParams.has("cursor")
            ? {
                items: [
                  {
                    ...plannedTable,
                    id: "77777777-7777-4777-8777-777777777777",
                    name: "Second table",
                  },
                ],
                nextCursor: null,
              }
            : { items: tables, nextCursor: "0" },
        ),
      );
    return original(url, init);
  });
  mount();
  const confirmation = (await screen.findByRole("button", {
    name: "Confirm event",
  })) as HTMLButtonElement;
  expect(confirmation.disabled).toBe(false);
  expect(screen.queryByText(/Pending invitations still reserve places/)).toBeNull();
  expect(screen.queryByText(/No compatible accepted players/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("link", { name: "Open table: Second table" })).not.toBeNull();
  await selectVote(plannedEvent.locations[0].name);
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          url.endsWith("/votes") && JSON.parse(String(init?.body)).kind === "location",
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm event" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("opens unified event/table routes, one voting legend and guarded Event deletion without legacy drafts", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: event.name })).not.toBeNull();
  expect(screen.getAllByRole("button", { name: "Voting legend" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Edit event" }).getAttribute("href")).toBe(
    `/events/${eventId}/edit`,
  );
  expect(await screen.findByRole("link", { name: "Open table: First table" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Delete event" })).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Confirm event" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    document
      .getElementById("page-header-actions")
      ?.contains(screen.getByRole("button", { name: "Confirm event" })),
  ).toBe(true);
});
it("only accepted players may vote, and voting never creates a table registration", async () => {
  event = { ...event, canVote: true };
  mount();
  await selectVote("2030-06-03 20:00");
  await waitFor(() =>
    expect(mocks.feedback.onOptimisticUpdate).toHaveBeenCalledWith("set_event_vote"),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/votes") && JSON.parse(String(init?.body)).kind === "date",
      ),
    ).toBe(true),
  );
  expect(fetcher.mock.calls.some(([url]) => url.includes("/registrations"))).toBe(false);
});
it("explains seated game disagreement without replacing players by waiters", async () => {
  event = {
    ...event,
    agreement: {
      agreed: false,
      tables: [],
      reasons: [{ tableId: plannedTable.id, code: "GAME_DISAGREEMENT" }],
    },
  };
  mount();
  const confirmation = (await screen.findByRole("button", {
    name: "Confirm event",
  })) as HTMLButtonElement;
  expect(confirmation.disabled).toBe(true);
  expect(screen.queryByText(/Seated players agree on date and location/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Why confirmation is unavailable" }));
  expect(await screen.findByText(/Seated players agree on date and location/)).not.toBeNull();
});
it("keeps a missing agreement disabled even if an inconsistent capability says confirmation is allowed, with all reasons only inside its popover", async () => {
  event = {
    ...event,
    canConfirm: true,
    agreement: {
      agreed: false,
      tables: [],
      reasons: [
        { tableId: plannedTable.id, code: "PENDING_RESERVATIONS" },
        { tableId: "77777777-7777-4777-8777-777777777777", code: "GAME_DISAGREEMENT" },
        { tableId: "88888888-8888-4888-8888-888888888888", code: "NO_AGREEMENT" },
      ],
    },
  };
  mount();
  await screen.findByRole("link", { name: "Open table: First table" });
  const confirmation = screen.getByRole("button", { name: "Confirm event" }) as HTMLButtonElement;
  expect(confirmation.disabled).toBe(true);
  expect(confirmation.className).toContain("size-9");
  expect(screen.queryByRole("region", { name: "Agreement" })).toBeNull();
  expect(screen.queryByText(/Pending invitations still reserve places/)).toBeNull();
  fireEvent.click(confirmation);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/state"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Why confirmation is unavailable" }));
  expect(await screen.findByText(/First table: Pending invitations/)).not.toBeNull();
  expect(screen.getByText(/Seated players agree on date and location/)).not.toBeNull();
  expect(screen.getByText(/No compatible accepted players/)).not.toBeNull();
});
it("requires explicit manual confirmation and freezes only server-authorized agreement", async () => {
  event = { ...event, canConfirm: true, agreement: { agreed: true, tables: [], reasons: [] } };
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Confirm event" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("Other tables and invitations are retained but excluded.");
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/state"))).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(
      client.getQueryData(
        eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
      ),
    ).toMatchObject({ status: "CONFIRMED" }),
  );
  expect(mocks.feedback.onOptimisticUpdate).toHaveBeenCalledWith("confirm_event");
  expect(mocks.feedback.onSuccess).not.toHaveBeenCalledWith("confirm_event");
});
it("leaves failed confirmation actionable and selectively restores optimistic capabilities", async () => {
  event = { ...event, canConfirm: true, agreement: { agreed: true, tables: [], reasons: [] } };
  failWrite = true;
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Confirm event" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() =>
    expect(mocks.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "confirm_event"),
  );
  await waitFor(() =>
    expect(
      client.getQueryData(
        eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
      ),
    ).toMatchObject({ status: "PLANNING", canConfirm: true }),
  );
  expect(mocks.feedback.onError).toHaveBeenCalled();
});
it("preserves an observable error/retry path instead of treating failures as empty success", async () => {
  fail = true;
  mount();
  expect(await screen.findByText("Could not load event")).not.toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: event.name })).not.toBeNull();
});
it("shows a disabled owner confirmation in the app header, explains agreement and labels event metadata", async () => {
  tables = [];
  mount();
  const heading = await screen.findByRole("heading", { name: event.name });
  expect(heading.className).toContain("text-base font-normal");
  const card = heading.closest(".card");
  expect(card?.querySelector("img")).not.toBeNull();
  expect(heading.previousElementSibling?.classList.contains("lucide-calendar-days")).toBe(true);
  const legend = screen.getByRole("button", { name: "Voting legend" }),
    badge = screen.getByText("Planning").closest(".chip");
  expect(legend.closest(".card")).toBeNull();
  expect(card?.contains(badge)).toBe(true);
  expect(
    legend.compareDocumentPosition(card as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText("No group")).toBeNull();
  expect(screen.queryByText(/Europe\/Rome/)).toBeNull();
  const button = screen.getByRole("button", { name: "Confirm event" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe("");
  fireEvent.click(button);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: "Details" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Date and time: Field help" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Event name: Field help" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Group: Field help" })).toBeNull();
  const date = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/Rome",
  }).format(new Date("2030-06-03T18:00:00Z"));
  expect(screen.getByText(date).closest("li")).not.toBeNull();
  expect(await screen.findByText("No tables found")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Why confirmation is unavailable" }));
  expect(
    await screen.findByText(
      "No complete agreement yet. Check participation and votes for the date, location and game.",
    ),
  ).not.toBeNull();
});
it("removes stale header actions after authorization loss and does not give another organizer's confirmation to a viewer", async () => {
  event = { ...event, canConfirm: true };
  const client = mount();
  await screen.findByRole("button", { name: "Confirm event" });
  act(() =>
    client.setQueryData(
      eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
      { ...event, adminUserId: "other", canConfirm: false, canEdit: false },
    ),
  );
  await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm event" })).toBeNull());
  fetcher.mockImplementation(async () => new Response('{"error":"FORBIDDEN"}', { status: 403 }));
  await act(async () => {
    await client.invalidateQueries({
      queryKey: eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
    });
  });
  expect(await screen.findByText("Could not load event")).not.toBeNull();
  expect(document.getElementById("page-header-actions")?.childElementCount).toBe(0);
});
it.each(["confirm", "replan"] as const)(
  "rejects %s when authorization/agreement changes while its confirmation is open",
  async (action) => {
    event = {
      ...event,
      status: action === "confirm" ? "PLANNING" : "CONFIRMED",
      canConfirm: action === "confirm",
      canReplan: action === "replan",
      agreement: { agreed: true, tables: [], reasons: [] },
    };
    const client = mount();
    const opener = (await screen.findByRole("button", {
      name: action === "confirm" ? "Confirm event" : "Reopen planning",
    })) as HTMLButtonElement;
    fireEvent.click(opener);
    expect(
      within(screen.getByRole("dialog"))
        .getByRole("button", { name: "Confirm" })
        .querySelector(
          action === "confirm" ? "svg.lucide-calendar-check" : "svg.lucide-rotate-ccw",
        ),
    ).not.toBeNull();
    act(() =>
      client.setQueryData(
        eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
        { ...event, version: 2, canConfirm: false, canReplan: false },
      ),
    );
    await waitFor(() =>
      expect(action === "confirm" ? opener.disabled : !opener.isConnected).toBe(true),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    expect(
      await screen.findByText("Could not change event state. Refresh and try again."),
    ).not.toBeNull();
    expect(
      fetcher.mock.calls.filter(
        ([url, init]) => url.endsWith("/state") && init?.method === "PATCH",
      ),
    ).toHaveLength(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
it("closed public cutoff blocks editing/voting without preventing manual confirmation", async () => {
  event = {
    ...event,
    groupType: "PUBLIC",
    bookingClosesAt: "2000-01-01T00:00:00Z",
    canVote: true,
    canConfirm: true,
    agreement: { agreed: true, tables: [], reasons: [] },
  };
  mount();
  const confirmation = (await screen.findByRole("button", {
    name: "Confirm event",
  })) as HTMLButtonElement;
  expect(confirmation.disabled).toBe(false);
  expect(screen.queryByRole("link", { name: "Edit event" })).toBeNull();
  expect(screen.queryByRole("button", { name: "2030-06-03 20:00: Yes" })).toBeNull();
});
