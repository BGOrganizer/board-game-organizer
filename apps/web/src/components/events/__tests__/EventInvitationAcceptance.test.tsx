import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { eventRecordKeys, useEventJoinForm, useRecordTable } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
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
import { EventTableCard } from "../EventTableCard";

const token = vi.hoisted(() => vi.fn(async () => "fresh-guest-token"));
const options = { apiUrl: "https://api.test", userId: "guest", getToken: token };
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "guest", getToken: token }),
}));
let event: PlannedEventResponse, table: PlannedTableResponse, registration: TableRegistration;
let fail: boolean, hold: boolean, release: (() => void) | undefined;
let fetcher: ReturnType<typeof vi.fn>;
const clients: QueryClient[] = [];
beforeEach(() => {
  fail = false;
  hold = false;
  release = undefined;
  registration = { ...seat("guest"), status: "PENDING", kind: "INVITATION", gameVotes: {} };
  event = {
    ...plannedEvent,
    groupType: "PRIVATE",
    groupId: optionId,
    role: "invited",
    canEdit: false,
    canInvite: false,
    canVote: false,
    canConfirm: false,
    canReplan: false,
    canFinalize: false,
    myRegistrations: [registration],
    myVotes: undefined,
  };
  table = {
    ...plannedTable,
    groupId: optionId,
    groupType: "PRIVATE",
    canInvite: false,
    canRegister: false,
    canRespond: true,
    myRegistration: registration,
    myPosition: "SEATED",
    acceptedCount: 0,
    seatedCount: 0,
    pendingCount: 1,
    pendingRegistrationCount: 1,
  };
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      if (hold)
        await new Promise<void>((done) => {
          release = done;
        });
      if (fail) return new Response('{"error":"EVENT_CHANGED"}', { status: 409 });
      const input = JSON.parse(String(init.body));
      registration = {
        ...registration,
        status: "ACCEPTED",
        version: registration.version + 1,
        gameVotes: input.participation.gameVotes,
      };
      table = {
        ...table,
        canRespond: false,
        canLeave: true,
        myRegistration: registration,
        acceptedCount: 1,
        seatedCount: 1,
        pendingCount: 0,
        pendingRegistrationCount: 0,
      };
      event = {
        ...event,
        version: event.version + 1,
        role: "participant",
        canVote: true,
        participantCount: 1,
        myRegistrations: [registration],
        ...(input.participation.availability ? { myVotes: input.participation.availability } : {}),
      };
      return new Response(JSON.stringify({ ...registration, eventVersion: event.version }));
    }
    return new Response(JSON.stringify(url.includes("/tables/") ? table : event));
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  for (const c of clients.splice(0)) c.clear();
  vi.unstubAllGlobals();
});
function LiveCard() {
  const query = useRecordTable(options, eventId, tableId);
  return query.data ? <EventTableCard table={query.data} /> : null;
}
function createClient() {
  const c = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(c);
  return c;
}
async function mount() {
  const client = createClient();
  renderWithI18n(
    <QueryClientProvider client={client}>
      <LiveCard />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
  return { client, dialog: await screen.findByRole("dialog") };
}
const writes = () => fetcher.mock.calls.filter(([, init]) => init?.method && init.method !== "GET");
async function chooseAll() {
  fireEvent.click(await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" }));
  fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
  fireEvent.click(await screen.findByRole("button", { name: "Club venue: If needed" }));
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  fireEvent.click(await screen.findByRole("button", { name: "Chess: Yes" }));
}
it("opens choices without accepting; cancellation leaves the invitation and server data pending", async () => {
  const { client, dialog } = await mount();
  expect(writes()).toHaveLength(0);
  expect(
    (within(dialog).getByRole("button", { name: "Accept invitation" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" }));
  fireEvent.click(within(dialog).getAllByRole("button", { name: "Cancel" })[0]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes()).toHaveLength(0);
  expect(
    client.getQueryData<PlannedTableResponse>(eventRecordKeys.table(options, eventId, tableId))
      ?.myRegistration?.status,
  ).toBe("PENDING");
});
it("PRIVATE acceptance submits all three categories atomically, closes before HTTP and restores rejected choices on explicit reopening", async () => {
  const { client, dialog } = await mount();
  const initialVersion = event.version;
  await chooseAll();
  const confirm = within(dialog).getByRole("button", {
    name: "Accept invitation",
  }) as HTMLButtonElement;
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fail = true;
  hold = true;
  fireEvent.click(confirm);
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(release).toBeDefined());
  expect(
    client.getQueryData<PlannedTableResponse>(eventRecordKeys.table(options, eventId, tableId))
      ?.myRegistration?.status,
  ).toBe("PENDING");
  await act(async () => {
    release?.();
  });
  await waitFor(() =>
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.status === "error"),
    ).toBe(true),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
  const restored = await screen.findByRole("dialog");
  await screen.findByText("Could not accept invitation");
  expect(
    (await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" })).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
  expect(
    (await screen.findByRole("button", { name: "Club venue: If needed" })).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  expect(
    (await screen.findByRole("button", { name: "Chess: Yes" })).getAttribute("aria-pressed"),
  ).toBe("true");
  fail = false;
  hold = false;
  const retry = within(restored).getByRole("button", {
    name: "Accept invitation",
  }) as HTMLButtonElement;
  await waitFor(() => expect(retry.disabled).toBe(false));
  fireEvent.click(retry);
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(writes()).toHaveLength(2));
  await waitFor(() =>
    expect(
      client.getQueryData<PlannedTableResponse>(eventRecordKeys.table(options, eventId, tableId))
        ?.myRegistration?.status,
    ).toBe("ACCEPTED"),
  );
  expect(
    writes().every(
      ([url, init]) =>
        url.endsWith(`/table-registrations/${registration.id}`) && init?.method === "PATCH",
    ),
  ).toBe(true);
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({
    action: "accept",
    version: 1,
    participation: {
      version: initialVersion,
      gameVotes: { "1": "YES" },
      availability: {
        version: initialVersion,
        dateVotes: { [optionId]: "YES" },
        locationVotes: { [optionId]: "IF_NEEDED" },
      },
    },
  });
  expect(
    client.getQueryData<PlannedTableResponse>(eventRecordKeys.table(options, eventId, tableId))
      ?.myRegistration,
  ).toMatchObject({ status: "ACCEPTED", gameVotes: { "1": "YES" } });
  expect(
    fetcher.mock.calls.every(([url]) => !url.includes("/votes") && !url.endsWith("/registrations")),
  ).toBe(true);
});
it("PUBLIC invitation shows only Games and cannot accept an all-NO ballot", async () => {
  event = { ...event, groupType: "PUBLIC" };
  table = { ...table, groupType: "PUBLIC" };
  const initialVersion = event.version;
  const { dialog } = await mount();
  const games = await screen.findByRole("tab", { name: "Games" });
  expect(games.getAttribute("aria-selected")).toBe("true");
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(screen.queryByRole("tab", { name: "Dates" })).toBeNull();
  const confirm = within(dialog).getByRole("button", {
    name: "Accept invitation",
  }) as HTMLButtonElement;
  fireEvent.click(await screen.findByRole("button", { name: "Chess: No" }));
  expect(confirm.disabled).toBe(true);
  expect(writes()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Chess: If needed" }));
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({
    action: "accept",
    version: 1,
    participation: { version: initialVersion, gameVotes: { "1": "IF_NEEDED" } },
  });
});
it("shows an unavailable-invitation error instead of accepting stale invitation identity", async () => {
  const client = createClient();
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventJoinSheet
        eventId={eventId}
        tableId={tableId}
        registrationId={eventId}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await screen.findByText("Invitation unavailable");
  expect(
    (screen.getByRole("button", { name: "Accept invitation" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(writes()).toHaveLength(0);
});
it.each(["wrong-id", "accepted", "self", "foreign-user", "closed"])(
  "refuses unavailable invitation metadata: %s",
  async (kind) => {
    const targetId = registration.id;
    if (kind === "wrong-id") table = { ...table, myRegistration: { ...registration, id: "other" } };
    if (kind === "accepted")
      table = { ...table, myRegistration: { ...registration, status: "ACCEPTED" } };
    if (kind === "self") table = { ...table, myRegistration: { ...registration, kind: "SELF" } };
    if (kind === "foreign-user")
      table = { ...table, myRegistration: { ...registration, userId: "foreign" } };
    if (kind === "closed") table = { ...table, canRespond: false };
    const client = createClient();
    const hook = renderHook(() => useEventJoinForm(options, eventId, tableId, vi.fn(), targetId), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(hook.result.current.table).toBeDefined());
    expect(hook.result.current.invitationUnavailable).toBe(true);
    expect(hook.result.current.canSubmit).toBe(false);
    await act(async () => {
      await hook.result.current.submit();
    });
    expect(writes()).toHaveLength(0);
  },
);
