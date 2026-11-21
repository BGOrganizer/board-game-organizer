import { URL } from "node:url";
import type {
  JoinTableInput,
  NotificationDto,
  PlannedEventResponse,
  PlannedTableResponse,
  TableRegistration,
} from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  eventRecordQuery,
  notificationListKey,
  recordTableQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventInvitationPicker } from "../EventInvitationPicker";
import { EventTableInvitationActions } from "../EventTableInvitationActions";

const API = "https://invitation-owners-native.test";
const io = vi.hoisted(() => ({
  token: vi.fn(async () => "fixture-owner"),
  back: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: io.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://invitation-owners-native.test" } },
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: io.back }),
  Stack: { Screen: () => null },
}));
const options = {
  apiUrl: API,
  userId: "owner",
  getToken: io.token,
  enabled: true,
};
const otherId = "55555555-5555-4555-8555-555555555555";
const otherTableId = "66666666-6666-4666-8666-666666666666";
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let registration: TableRegistration;
let other: TableRegistration;
let status: number;
let writeStatus: number;
let pauseRead: Promise<void> | undefined;
let pauseWrite: Promise<void> | undefined;
let releases: (() => void)[];
let reads: URL[];
let writes: { path: string; method: string; body: Record<string, unknown> }[];
let unexpected: string[];
const noticeKey = notificationListKey({ ...options, locale: "en" }, 3);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  releases.push(resolve);
  return { promise, resolve };
}
function seed() {
  table = { ...table, groupId: event.groupId, groupType: event.groupType };
  client.setQueryData(eventRecordQuery(options, event.id).queryKey, event);
  client.setQueryData(recordTableQuery(options, event.id, table.id).queryKey, table);
  client.setQueryData(recordTableQuery(options, event.id, otherTableId).queryKey, {
    ...table,
    id: otherTableId,
    myRegistration: other,
  });
}
function Fixture({ picker = false, sibling = false }: { picker?: boolean; sibling?: boolean }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        {picker ? (
          <EventInvitationPicker eventId={event.id} tableId={table.id} />
        ) : (
          <>
            <View testID="current-invitation">
              <EventTableInvitationActions eventId={event.id} registration={registration} />
            </View>
            {sibling ? (
              <View testID="other-invitation">
                <EventTableInvitationActions eventId={event.id} registration={other} />
              </View>
            ) : null}
          </>
        )}
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
function card(id = "current-invitation") {
  return within(screen.getByTestId(id));
}
async function pressCard(label: string, id?: string) {
  await userEvent.setup().press(card(id).getByRole("button", { name: label }));
}
async function http(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const method = init?.method ?? "GET";
  if (
    url.origin !== API ||
    new Headers(init?.headers).get("Authorization") !== "Bearer fixture-owner"
  ) {
    unexpected.push(String(url));
    throw new Error("Unowned invitation HTTP");
  }
  if (method === "GET") {
    reads.push(url);
    if (url.pathname === `/api/events/${event.id}`) {
      await pauseRead;
      return Response.json(status === 200 ? event : { error: "EVENT_ACCESS_DENIED" }, { status });
    }
    if (url.pathname === `/api/events/${event.id}/tables/${table.id}`) return Response.json(table);
    if (url.pathname === `/api/events/${event.id}/tables/${otherTableId}`)
      return Response.json({
        ...table,
        id: otherTableId,
        myRegistration: other,
      });
    if (url.pathname === `/api/events/${event.id}/tables/${table.id}/invitations`)
      return Response.json({
        items: [
          {
            id: "guest",
            name: "Guest Player",
            username: "guest",
            avatarUrl: null,
            email: null,
            invitationBlockReason: null,
          },
        ],
        eventVersion: event.version,
        nextCursor: null,
      });
    if (url.pathname === `/api/events/${event.id}/tables`)
      return Response.json({ items: [table], nextCursor: null });
  } else {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    writes.push({ path: url.pathname, method, body });
    await pauseWrite;
    if (writeStatus !== 200)
      return Response.json({ error: "REGISTRATION_CHANGED" }, { status: writeStatus });
    if (method === "POST" && url.pathname === `/api/events/${event.id}/tables/${table.id}/guests`) {
      return Response.json({
        ...registration,
        id: body.requestId,
        userId: "guest:88888888-8888-4888-8888-888888888888",
        kind: "GUEST",
        guestName: body.name,
        status: "ACCEPTED",
        eventVersion: event.version + 1,
      });
    }
    if (method === "PATCH" && url.pathname.startsWith("/api/table-registrations/")) {
      const id = url.pathname.split("/").at(-1);
      const previous = id === other.id ? other : registration;
      const participation =
        body.action === "accept" ? (body.participation as JoinTableInput) : undefined;
      const next: TableRegistration = {
        ...previous,
        ...(participation ? { gameVotes: participation.gameVotes } : {}),
        status: body.action === "decline" ? "DECLINED" : "ACCEPTED",
        version: previous.version + 1,
      };
      if (id === other.id) other = next;
      else {
        registration = next;
        table = { ...table, myRegistration: next, canRespond: false };
      }
      event = {
        ...event,
        ...(participation?.availability
          ? {
              myVotes: {
                dateVotes: participation.availability.dateVotes,
                locationVotes: participation.availability.locationVotes,
              },
            }
          : {}),
        version: event.version + 1,
        myRegistrations: [registration, other].filter(
          (row) => row.status === "PENDING" || row.status === "ACCEPTED",
        ),
      };
      return Response.json({ ...next, eventVersion: event.version });
    }
    if (
      method === "POST" &&
      url.pathname === `/api/events/${event.id}/tables/${table.id}/invitations`
    ) {
      event = { ...event, version: event.version + 1 };
      table = { ...table, pendingCount: table.pendingCount + 1 };
      return Response.json({
        ...registration,
        id: "88888888-8888-4888-8888-888888888888",
        userId: "guest",
        status: "PENDING",
        version: 1,
        eventVersion: event.version,
      });
    }
  }
  unexpected.push(`${method} ${url}`);
  throw new Error("Unexpected invitation endpoint");
}
beforeEach(() => {
  io.back.mockClear();
  io.token.mockClear();
  registration = {
    id: "33333333-3333-4333-8333-333333333333",
    eventId: plannedEvent.id,
    tableId: plannedTable.id,
    userId: "owner",
    kind: "INVITATION",
    status: "PENDING",
    priorityAt: plannedEvent.createdAt,
    sequence: 1,
    version: 7,
    gameVotes: {},
    createdAt: plannedEvent.createdAt,
    updatedAt: plannedEvent.updatedAt,
  };
  other = { ...registration, id: otherId, tableId: otherTableId, version: 3 };
  event = { ...plannedEvent, myRegistrations: [registration, other] };
  table = {
    ...plannedTable,
    myRegistration: registration,
    canRespond: true,
    canRegister: false,
    pendingCount: 1,
  };
  status = writeStatus = 200;
  reads = [];
  writes = [];
  unexpected = [];
  releases = [];
  pauseRead = pauseWrite = undefined;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  seed();
  const notice: NotificationDto = {
    id: "000000000000000000000001",
    kind: "table_invitation",
    title: "Pending table invitation",
    description: "Explicit participation is required.",
    href: `/events/${event.id}/tables/${table.id}`,
    createdAt: "2030-06-01T10:00:00.000Z",
    readAt: null,
    requiresResponse: true,
  };
  client.setQueryData(noticeKey, {
    pages: [{ notifications: [notice], unreadCount: 1, nextCursor: null }],
    pageParams: [undefined],
  });
  vi.stubGlobal("fetch", vi.fn(http));
});
afterEach(async () => {
  await cleanup();
  for (const release of releases) release();
  await client.cancelQueries();
  client.clear();
  expect(unexpected).toEqual([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Real invitation owners, real EventJoinSheet/PeoplePicker/shared Query/actions.
// Gorhom choices are rendered callback/state evidence; no native opening/tap
// claim is made. Normal card buttons retain actual userEvent disabled guards.
it.each(["ACCEPTED", "DECLINED", "CANCELLED"] as const)(
  "does not render a response action for an already %s registration",
  async (status) => {
    registration = { ...registration, status };
    await render(<Fixture />);
    expect(card().queryByRole("button")).toBeNull();
    expect(writes).toEqual([]);
  },
);
it("does not invent an invitation for a SELF registration", async () => {
  registration = { ...registration, kind: "SELF", status: "ACCEPTED" };
  await render(<Fixture />);
  expect(card().queryByRole("button")).toBeNull();
});

it("opens the current invitation's real review and closes on Cancel without participation or notification writes", async () => {
  const inbox = client.getQueryData(noticeKey);
  await render(<Fixture />);
  await pressCard("Accept invitation");
  expect(
    await screen.findByText("Review table settings", {
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(writes).toEqual([]);
  expect(client.getQueryData(noticeKey)).toBe(inbox);
  await fireEvent.press(
    screen.getByTestId("table-consent-cancel", { includeHiddenElements: true }),
  );
  expect(
    screen.queryByText("Review table settings", {
      includeHiddenElements: true,
    }),
  ).toBeNull();
  expect(card().getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  expect(writes).toEqual([]);
  expect(client.getQueryData(noticeKey)).toBe(inbox);
});

it("accepts only after explicit real-sheet consent with the current registration/event versions", async () => {
  await render(<Fixture />);
  await pressCard("Accept invitation");
  await waitFor(() =>
    expect(
      screen.getByTestId("table-consent-submit", {
        includeHiddenElements: true,
      }),
    ).toBeEnabled(),
  );
  expect(writes).toEqual([]);
  await fireEvent.press(
    screen.getByTestId("table-consent-submit", { includeHiddenElements: true }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    path: `/api/table-registrations/${registration.id}`,
    body: {
      action: "accept",
      version: 7,
      participation: { version: 1, gameVotes: {} },
    },
  });
  expect(writes.some((write) => write.method === "POST")).toBe(false);
  expect(
    screen.queryByText("Review table settings", {
      includeHiddenElements: true,
    }),
  ).toBeNull();
});

it("declines through the captured version without creating seats or entering the acceptance workflow", async () => {
  await render(<Fixture />);
  await pressCard("Decline invitation");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    method: "PATCH",
    path: `/api/table-registrations/${registration.id}`,
    body: { action: "decline", version: 7 },
  });
  expect(
    screen.queryByText("Review table settings", {
      includeHiddenElements: true,
    }),
  ).toBeNull();
});

it("disables both actual response controls for its own pending write and prevents duplicate consent", async () => {
  const gate = deferred();
  pauseWrite = gate.promise;
  await render(<Fixture />);
  await pressCard("Decline invitation");
  await waitFor(() => expect(writes).toHaveLength(1));
  for (const label of ["Accept invitation", "Decline invitation"]) {
    const button = card().getByRole("button", { name: label });
    expect(button).toBeDisabled();
    await userEvent.setup().press(button);
  }
  expect(writes).toHaveLength(1);
  expect(
    screen.queryByText("Review table settings", {
      includeHiddenElements: true,
    }),
  ).toBeNull();
  await act(() => gate.resolve());
});

it("ignores an unrelated registration's pending write while requiring its own separate consent", async () => {
  const gate = deferred();
  pauseWrite = gate.promise;
  await render(<Fixture sibling />);
  await pressCard("Decline invitation", "other-invitation");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(card().getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  await pressCard("Accept invitation");
  expect(
    await screen.findByText("Review table settings", {
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe(`/api/table-registrations/${other.id}`);
  await fireEvent.press(
    screen.getByTestId("table-consent-cancel", { includeHiddenElements: true }),
  );
  await act(() => gate.resolve());
});

it("observes the actual shared event write barrier instead of allowing a concurrent response", async () => {
  const operation = await beginOptimisticOperation(
    client,
    [...eventRecordKeys.root(options), event.id, "write"],
    { queryKey: eventRecordKeys.root(options) },
  );
  await render(<Fixture />);
  for (const label of ["Accept invitation", "Decline invitation"]) {
    const button = card().getByRole("button", { name: label });
    expect(button).toBeDisabled();
    await userEvent.setup().press(button);
  }
  expect(writes).toEqual([]);
  await act(() => operation.rollback());
  expect(card().getByRole("button", { name: "Accept invitation" })).toBeEnabled();
});

it.each(["wrong-owner", "missing-permission"] as const)(
  "keeps the mounted invitation review non-submittable for %s",
  async (kind) => {
    table = {
      ...table,
      canRespond: kind !== "missing-permission",
      myRegistration:
        kind === "wrong-owner" ? { ...registration, userId: "another-user" } : registration,
    };
    seed();
    await render(<Fixture />);
    await pressCard("Accept invitation");
    expect(
      await screen.findByText("Invitation unavailable", {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("table-consent-submit", {
        includeHiddenElements: true,
      }),
    ).toBeDisabled();
    expect(writes).toEqual([]);
  },
);

it("restores actual response controls after a definite rejection and permits a new explicit decision", async () => {
  writeStatus = 400;
  await render(<Fixture />);
  await pressCard("Decline invitation");
  await waitFor(() =>
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.status === "error"),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(card().getByRole("button", { name: "Decline invitation" })).toBeEnabled(),
  );
  expect(
    client.getQueryData(recordTableQuery(options, event.id, table.id).queryKey)?.myRegistration
      ?.status,
  ).toBe("PENDING");
  expect(writes).toHaveLength(1);
  writeStatus = 200;
  await pressCard("Decline invitation");
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].body).toEqual({ action: "decline", version: 7 });
});

it("renders the actual private-group invite-link row before candidates without generating or accepting anything", async () => {
  event = {
    ...event,
    groupId: "77777777-7777-4777-8777-777777777777",
    groupType: "PRIVATE",
  };
  seed();
  await render(<Fixture picker />);
  expect(await screen.findByTestId("table-invite-link-row")).toBeVisible();
  expect(await screen.findByText("@guest")).toBeVisible();
  expect(screen.getByRole("search", { name: "Search members" })).toBeVisible();
  expect(writes).toEqual([]);
  expect(io.back).not.toHaveBeenCalled();
});

it.each([null, "PUBLIC"] as const)(
  "does not offer a private-group invite link for group type %s",
  async (groupType) => {
    event = {
      ...event,
      groupType,
      groupId: groupType ? "77777777-7777-4777-8777-777777777777" : null,
    };
    seed();
    await render(<Fixture picker />);
    await screen.findByText("@guest");
    expect(screen.queryByTestId("table-invite-link-row")).toBeNull();
    expect(writes).toEqual([]);
  },
);

it("invites the chosen canonical candidate, navigates Back once and leaves acceptance pending", async () => {
  await render(<Fixture picker />);
  await screen.findByText("@guest");
  const buttons = screen.getAllByRole("button", {
    name: "Select user: @guest",
  });
  await userEvent.setup().press(buttons[0]);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    method: "POST",
    path: `/api/events/${event.id}/tables/${table.id}/invitations`,
    body: { userId: "guest" },
  });
  expect(io.back).toHaveBeenCalledExactlyOnceWith();
  expect(writes.some((write) => write.path.startsWith("/api/table-registrations/"))).toBe(false);
});

it("returns to the table and clears the guest form only after the server accepts it", async () => {
  const { promise, resolve } = deferred();
  pauseWrite = promise;
  await render(<Fixture picker />);
  const open = await screen.findByRole("button", { name: "Add a guest" });
  expect(screen.queryByLabelText("Username")).toBeNull();
  await userEvent.setup().press(open);
  const input = await screen.findByLabelText("Username");
  const email = screen.getByLabelText("Email");
  const add = screen.getByRole("button", { name: "Add" });
  expect(add).toBeDisabled();
  await fireEvent(input, "focus", { nativeEvent: { target: 1 } });
  await fireEvent.changeText(input, " Guest Alice ");
  expect(add).toBeEnabled();
  await act(async () => {
    await fireEvent(input, "blur", { nativeEvent: { target: 1 } });
    await fireEvent(email, "focus", { nativeEvent: { target: 2 } });
  });
  await fireEvent.changeText(email, "invalid");
  await fireEvent(email, "blur", { nativeEvent: { target: 2 } });
  expect(input).toHaveDisplayValue(" Guest Alice ");
  expect(io.back).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  // Opening animation is handled by the native sheet; check the rendered validation state.
  expect(await screen.findByText("Enter a valid email address.")).toBeOnTheScreen();
  expect(add).toBeDisabled();
  await fireEvent.changeText(email, "");
  await userEvent.setup().press(add);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].body).toMatchObject({ name: "Guest Alice" });
  expect(io.back).not.toHaveBeenCalled();
  await act(() => resolve());
  await waitFor(() => expect(io.back).toHaveBeenCalledOnce());
  expect(writes[0].body).not.toHaveProperty("email");
  expect(screen.queryByLabelText("Username")).toBeNull();
  expect(screen.queryByRole("button", { name: "Select user: Guest Alice" })).toBeNull();
  await userEvent.setup().press(screen.getByRole("button", { name: "Add a guest" }));
  expect(await screen.findByLabelText("Username")).toHaveProp("value", "");
  expect(screen.getByLabelText("Email")).toHaveProp("value", "");
});

it.each(["write", "target"] as const)(
  "guards picker selection against the actual current %s journal barrier",
  async (scope) => {
    const resource = [
      ...eventRecordKeys.root(options),
      event.id,
      ...(scope === "write" ? ["write"] : ["invite", table.id, "guest"]),
    ];
    const operation = await beginOptimisticOperation(client, resource, {
      queryKey: eventRecordKeys.root(options),
    });
    await render(<Fixture picker />);
    await screen.findByText("@guest");
    const button = screen.getAllByRole("button", {
      name: "Select user: @guest",
    })[0];
    if (scope === "write") expect(button).toBeDisabled();
    else expect(button).toBeEnabled();
    await userEvent.setup().press(button);
    expect(writes).toEqual([]);
    expect(io.back).not.toHaveBeenCalled();
    await act(() => operation.rollback());
  },
);

it.each([false, true])(
  "does not render unauthorized candidates when the event is unavailable (denied=%s)",
  async (denied) => {
    event = { ...event, canInvite: false };
    status = denied ? 403 : 200;
    if (denied)
      client.removeQueries({
        queryKey: eventRecordQuery(options, event.id).queryKey,
        exact: true,
      });
    else seed();
    await render(<Fixture picker />);
    expect(
      await screen.findByText("Invitations are unavailable. Refresh the event."),
    ).toBeVisible();
    expect(screen.queryByTestId("people-picker-scroll")).toBeNull();
    expect(writes).toEqual([]);
  },
);

it("keeps uncached event restoration distinct from invitation denial before showing any candidate source", async () => {
  client.removeQueries({
    queryKey: eventRecordQuery(options, event.id).queryKey,
    exact: true,
  });
  const gate = deferred();
  pauseRead = gate.promise;
  await render(<Fixture picker />);
  await waitFor(() =>
    expect(reads.some((url) => url.pathname === `/api/events/${event.id}`)).toBe(true),
  );
  expect(screen.queryByText("Invitations are unavailable. Refresh the event.")).toBeNull();
  expect(screen.queryByTestId("people-picker-scroll")).toBeNull();
  await act(() => gate.resolve());
  expect(await screen.findByText("@guest")).toBeVisible();
  expect(writes).toEqual([]);
});
