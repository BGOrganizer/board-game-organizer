import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListActivityContext } from "@/lib/listActivity";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { measureNativeList, scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventTableSeats } from "../EventTableSeats";

const API = "https://table-seats-branches-native.test";
const sdk = vi.hoisted(() => ({ getToken: vi.fn(), push: vi.fn() }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "session-owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: sdk.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://table-seats-branches-native.test" } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: sdk.push }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({}),
}));

const ownId = "44444444-4444-4444-8444-444444444444";
const bobId = "55555555-5555-4555-8555-555555555555";
const secondId = "66666666-6666-4666-8666-666666666666";
const options = { apiUrl: API, userId: "owner" };
let client: QueryClient;
let table: PlannedTableResponse;
let accepted: TableSeatResponse[];
let pending: TableSeatResponse[];
let cursor: string | null;
let nextPage: Promise<Response> | undefined;
const reads: URL[] = [];
const writes: string[] = [];
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
function registration(userId: string, id: string, change: Partial<TableSeatResponse> = {}) {
  return { ...seat(userId), id, seatIndex: 0, ...change };
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.getToken.mockResolvedValue("fresh-seat-token");
  accepted = [];
  pending = [];
  cursor = null;
  nextPage = undefined;
  reads.length = 0;
  writes.length = 0;
  table = {
    ...plannedTable,
    adminUserId: "another-manager",
    canManage: false,
    canInvite: false,
    groupType: "PUBLIC",
    occupiedSeatIndices: [],
    eventVersion: 1,
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-seat-token");
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        writes.push(`${method} ${url.pathname}`);
        throw new Error("These seat-presentation scenarios never consent or mutate the server");
      }
      reads.push(url);
      if (url.pathname.endsWith("/seats")) {
        if (url.searchParams.get("cursor")) {
          if (!nextPage) throw new Error("Unexpected next-page request");
          return nextPage;
        }
        const isPending = url.searchParams.get("pending") === "true";
        return json({
          items: isPending ? pending : accepted,
          nextCursor: isPending ? null : cursor,
        });
      }
      if (url.pathname === `/api/events/${table.eventId}`)
        return json({ ...plannedEvent, canManage: table.canManage });
      if (url.pathname === `/api/events/${table.eventId}/tables/${table.id}/guests/${bobId}`)
        return json({ guestName: "Guest Player", dateVotes: {}, locationVotes: {}, gameVotes: {} });
      if (url.pathname === `/api/events/${table.eventId}/tables/${table.id}`) return json(table);
      if (url.pathname === `/api/events/${table.eventId}/tables`)
        return json({ items: [table], nextCursor: null });
      throw new Error(`Unexpected fixture path: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  expect(writes).toEqual([]);
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture(props: Partial<ComponentProps<typeof EventTableSeats>> = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventTableSeats
          table={table}
          header={<Text>Current table heading</Text>}
          overview={<Text>Current overview</Text>}
          onRemove={() => {}}
          {...props}
        />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function ready(expectedPlayer?: string) {
  await screen.findByText("Seats list");
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(
    client
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.status === "error"),
  ).toEqual([]);
  if (expectedPlayer) await screen.findByText(expectedPlayer);
}
async function press(name: string) {
  const button =
    name === "Free place"
      ? screen.getAllByRole("button", { name })[0]
      : screen.getByRole("button", { name });
  await userEvent.setup().press(button);
}

it("keeps anonymous occupied slots disabled and enables only the first genuinely free place", async () => {
  table = { ...table, occupiedSeatIndices: [0], pendingCount: 1 };
  await render(<Fixture />);
  await ready();
  expect(screen.getByRole("button", { name: "Reserved place" })).toBeDisabled();
  const free = screen.getAllByRole("button", { name: "Free place" });
  expect(free).toHaveLength(3);
  expect(free[0]).toBeEnabled();
  expect(free[1]).toBeDisabled();
  expect(free[2]).toBeDisabled();
  expect(screen.getByText("No players waiting")).toBeVisible();
  expect(reads.filter((url) => url.searchParams.get("pending") === "true")).toEqual([]);
});

it("exposes a waiting-list action when every physical slot is reserved without disclosing pending identities", async () => {
  table = { ...table, occupiedSeatIndices: [0, 1, 2, 3], pendingCount: 4 };
  pending = [registration("private-invitee", secondId, { status: "PENDING" })];
  await render(<Fixture />);
  await ready();
  expect(screen.getAllByRole("button", { name: "Reserved place" })).toHaveLength(4);
  for (const reserved of screen.getAllByRole("button", { name: "Reserved place" }))
    expect(reserved).toBeDisabled();
  expect(screen.getByRole("button", { name: "Join waiting list" })).toBeEnabled();
  expect(screen.queryByText("@private-invitee")).toBeNull();
  expect(screen.queryByText("No players waiting")).toBeNull();
});

it("does not enable a free place without a current registration or invitation capability", async () => {
  table = { ...table, canRegister: false };
  await render(<Fixture />);
  await ready();
  for (const free of screen.getAllByRole("button", { name: "Free place" }))
    expect(free).toBeDisabled();
  expect(sdk.push).not.toHaveBeenCalled();
});

it("opens real public self-consent directly and cancels without registering or granting votes", async () => {
  await render(<Fixture />);
  await ready();
  await press("Free place");
  // Gorhom's UI-thread opening is outside this renderer: assert the actual form,
  // not physical visibility or tappability of its animated sheet.
  await screen.findByTestId("table-consent-submit", { includeHiddenElements: true });
  expect(screen.queryByText("Choose a place action")).toBeNull();
  await userEvent
    .setup()
    .press(screen.getByRole("button", { name: "Cancel", includeHiddenElements: true }));
  await waitFor(() =>
    expect(
      screen.queryByTestId("table-consent-submit", { includeHiddenElements: true }),
    ).toBeNull(),
  );
  expect(sdk.push).not.toHaveBeenCalled();
});

it("explains private self-consent before opening the actual join form for a known event context", async () => {
  table = { ...table, groupType: "PRIVATE" };
  await render(<Fixture hasJoinedEvent={false} />);
  await ready();
  await press("Free place");
  expect(
    screen.getByText(
      "Joining accepts the current event and table settings. Vote only where multiple options are available.",
    ),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Invite players" })).toBeNull();
  await press("Join table");
  await screen.findByTestId("table-consent-submit", { includeHiddenElements: true });
  expect(sdk.push).not.toHaveBeenCalled();
});

it("keeps the post-cutoff manager action invitation-only without restoring self-registration", async () => {
  table = {
    ...table,
    adminUserId: "owner",
    canManage: true,
    canInvite: true,
    bookingClosesAt: "2020-01-01T00:00:00.000Z",
  };
  await render(<Fixture />);
  await ready();
  await press("Free place");
  expect(screen.getByText("Choose a place action")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Join table" })).toBeNull();
  expect(screen.getByRole("button", { name: "Invite players" })).toBeEnabled();
  await press("Cancel");
  expect(sdk.push).not.toHaveBeenCalled();
});

it.each([{ name: null }, { name: "owner" }])(
  "uses the self fallback when the owned row has no usable display name ($name)",
  async ({ name }) => {
    const own = registration("owner", ownId, { username: null, name });
    accepted = [own];
    table = {
      ...table,
      canRegister: false,
      myRegistration: own,
      myPosition: "SEATED",
      occupiedSeatIndices: [0],
      seatedCount: 1,
      acceptedCount: 1,
    };
    await render(<Fixture />);
    await ready("You");
    expect(screen.getByText("You")).toBeVisible();
    expect(screen.queryByText("@owner")).toBeNull();
  },
);

it("keeps a username-less other player's identifier as a fallback and identifies the demonstrator", async () => {
  accepted = [registration("bob", bobId, { username: null, name: null })];
  table = {
    ...table,
    demonstratorUserId: "bob",
    occupiedSeatIndices: [0],
    seatedCount: 1,
    acceptedCount: 1,
  };
  await render(<Fixture />);
  await ready("bob");
  expect(screen.getByText("bob")).toBeVisible();
  expect(screen.getByText("Demonstrator")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Remove player: bob" })).toBeNull();
});

it("describes a pending self request without presenting invitation consent or accepted departure", async () => {
  const own = registration("owner", ownId, { kind: "SELF", status: "PENDING" });
  table = {
    ...table,
    canRegister: false,
    myRegistration: own,
    myPosition: "SEATED",
    occupiedSeatIndices: [0],
    pendingCount: 1,
    pendingRegistrationCount: 1,
  };
  await render(<Fixture />);
  await ready();
  expect(screen.getByText("Participation requested")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline invitation" })).toBeNull();
});

it("offers the owned pending invitation's real consent controls while withholding accepted departure", async () => {
  const own = registration("owner", ownId, { status: "PENDING" });
  table = {
    ...table,
    canRegister: false,
    canRespond: true,
    canLeave: true,
    myRegistration: own,
    myPosition: "SEATED",
    occupiedSeatIndices: [0],
    pendingCount: 1,
    pendingRegistrationCount: 1,
  };
  await render(<Fixture />);
  await ready();
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Decline invitation" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
  await press("Accept invitation");
  await screen.findByTestId("table-consent-submit", { includeHiddenElements: true });
  expect(
    screen.getByText(
      "Accepting this invitation accepts the current event and table settings. Vote only where multiple options are available.",
      { includeHiddenElements: true },
    ),
  ).toBeOnTheScreen();
});

// Seed real Query SDK request metadata to test its presentation, not execution of
// the write. Canonical seats remain empty; pending intent must never grant consent.
function pendingIntent(action: "invite" | "register" | "respond", uncertain = false) {
  client.getMutationCache().build(
    client,
    { mutationKey: [...eventRecordKeys.mutation(options, table.eventId), action] },
    {
      context: { operation: { uncertain } },
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: "pending",
      submittedAt: Date.now(),
      variables:
        action === "invite"
          ? {
              tableId: table.id,
              userId: "invited",
              person: { name: "Invited Person", username: "invited", avatarUrl: null },
            }
          : {
              tableId: table.id,
              version: 1,
              gameVotes: {},
              ...(action === "respond"
                ? {
                    registrationId: ownId,
                    input: {
                      action: "accept",
                      version: 1,
                      participation: { version: 1, gameVotes: {} },
                    },
                  }
                : {}),
            },
    },
  );
}

it.each([
  { action: "invite", uncertain: false, label: "Sending invitation", identity: "@invited" },
  { action: "register", uncertain: false, label: "Joining table", identity: "You" },
  { action: "respond", uncertain: false, label: "Accepting invitation", identity: "You" },
  { action: "register", uncertain: true, label: "Checking saved changes", identity: "You" },
] as const)(
  "renders $label from actual scoped request metadata without fabricating a player",
  async ({ action, uncertain, label, identity }) => {
    table = { ...table, adminUserId: "owner", canManage: true, canInvite: true };
    pendingIntent(action, uncertain);
    await render(<Fixture />);
    await ready();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(identity)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
    expect(screen.queryByRole("button", { name: `Remove player: ${identity}` })).toBeNull();
    expect(accepted).toEqual([]);
    expect(pending).toEqual([]);
  },
);

it("ignores an invitation intent scoped to another table while keeping the actual roster empty", async () => {
  table = { ...table, adminUserId: "owner", canManage: true, canInvite: true };
  const intended = table.id;
  table = { ...table, id: secondId };
  pendingIntent("invite");
  table = { ...table, id: intended };
  await render(<Fixture />);
  await ready();
  expect(screen.queryByText("Sending invitation")).toBeNull();
  expect(screen.queryByText("@invited")).toBeNull();
});

it.each(["button", "native end event"] as const)(
  "keeps the first page usable after a %s and coalesces requests until the next receipt arrives",
  async (trigger) => {
    accepted = [registration("bob", bobId)];
    cursor = "next-seat-page";
    table = { ...table, occupiedSeatIndices: [0, 1], seatedCount: 2 };
    let resolvePage!: (response: Response) => void;
    nextPage = new Promise<Response>((resolve) => {
      resolvePage = resolve;
    });
    await render(<Fixture />);
    await ready("@bob");
    expect(await screen.findByText("@bob")).toBeVisible();
    if (trigger === "button") await press("Load more");
    else {
      let list: ReturnType<typeof screen.getByText> | null = screen.getByText("@bob");
      while (list && typeof list.props.onScroll !== "function") list = list.parent;
      if (!list) throw new Error("Expected the actual SectionList native scroll host");
      await scrollNativeListToEnd(list);
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "Load more" })).toBeDisabled());
    expect(screen.getByText("@bob")).toBeVisible();
    await userEvent.setup().press(screen.getByRole("button", { name: "Load more" }));
    expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(1);
    await act(async () => {
      resolvePage(
        json({ items: [registration("second", secondId, { seatIndex: 1 })], nextCursor: null }),
      );
    });
    expect(await screen.findByText("@second")).toBeVisible();
    expect(screen.getByText("@bob")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  },
);

it("rejects hidden or obsolete roster ends, avoids failed-page loops and retries only by explicit action", async () => {
  accepted = [registration("bob", bobId)];
  cursor = "next-seat-page";
  table = { ...table, occupiedSeatIndices: [0, 1], seatedCount: 2 };
  let resolvePage!: (response: Response) => void;
  nextPage = new Promise<Response>((resolve) => {
    resolvePage = resolve;
  });
  const visibility = { current: false };
  const fixture = (active = true) => (
    <ListActivityContext value={visibility}>
      <Fixture active={active} />
    </ListActivityContext>
  );
  const view = await render(fixture());
  await ready("@bob");
  let list: ReturnType<typeof screen.getByText> | null = screen.getByText("@bob");
  while (list && typeof list.props.onScroll !== "function") list = list.parent;
  if (!list) throw new Error("Expected the actual retained roster SectionList host");
  await scrollNativeListToEnd(list, 4000);
  expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(0);
  visibility.current = true;
  await measureNativeList(list, { contentHeight: 4000 });
  const queuedNativeScroll = list.props.onScroll;
  await view.rerender(fixture(false));
  // Deliver already queued OS scroll notifications to the real SDK binding;
  // the now-hidden roster's own activePanel guard must still reject its end.
  for (const y of [0, 3500]) {
    await act(() =>
      queuedNativeScroll({
        timeStamp: Date.now(),
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentSize: { width: 390, height: 4000 },
          layoutMeasurement: { width: 390, height: 500 },
          zoomScale: 1,
        },
      }),
    );
  }
  expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(0);
  await view.rerender(fixture());
  await scrollNativeListToEnd(list, 4000);
  await waitFor(() =>
    expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(1),
  );
  await scrollNativeListToEnd(list, 4200);
  expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(1);
  await act(() =>
    resolvePage(
      new Response(JSON.stringify({ error: "Fixture next-page failure" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  const errorMessage = await screen.findByText("Could not load players");
  const errorBlock = errorMessage.parent;
  if (!errorBlock) throw new Error("Expected the actual roster error section");
  // The source exposes independent full-roster and next-page retries. Select
  // the page action outside the inline full-roster error section.
  const pageRetries = screen
    .getAllByRole("button", { name: "Try again" })
    .filter((button) => errorBlock.queryAll((node) => node === button).length === 0);
  expect(pageRetries).toHaveLength(1);
  expect(pageRetries[0]).toBeEnabled();
  expect(screen.getByText("@bob")).toBeVisible();
  await scrollNativeListToEnd(list, 4400);
  expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(1);
  nextPage = Promise.resolve(
    json({ items: [registration("second", secondId, { seatIndex: 1 })], nextCursor: null }),
  );
  await userEvent.setup().press(pageRetries[0]);
  expect(await screen.findByText("@second")).toBeVisible();
  expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(2);
  await scrollNativeListToEnd(list, 4600);
  expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(2);
  expect(writes).toEqual([]);
});

it("opens the selected guest ballot from the actual roster and removes controls when manager authority is revoked", async () => {
  table = {
    ...table,
    adminUserId: "owner",
    canManage: true,
    groupType: null,
    gameVoteRequired: true,
    occupiedSeatIndices: [0],
    acceptedCount: 1,
    seatedCount: 1,
  };
  accepted = [
    registration("guest:55555555-5555-4555-8555-555555555555", bobId, {
      kind: "GUEST",
      guestName: "Guest Player",
    }),
  ];
  const view = await render(<Fixture />);
  await ready("@Guest Player");
  await press("Edit guest votes: Guest Player");
  const hidden = { includeHiddenElements: true };
  expect(await screen.findByText("Edit guest votes", hidden)).toBeOnTheScreen();
  expect(await screen.findByRole("button", { name: "Chess: Yes", ...hidden })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Vote", ...hidden })).toBeDisabled();
  const guestPath = `/api/events/${table.eventId}/tables/${table.id}/guests/${bobId}`;
  expect(reads.filter((url) => url.pathname === guestPath)).toHaveLength(1);
  await view.rerender(<Fixture active={false} />);
  expect(screen.queryByText("Edit guest votes", hidden)).toBeNull();
  table = { ...table, canManage: false };
  await view.rerender(<Fixture />);
  expect(await screen.findByText("@Guest Player")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Edit guest votes: Guest Player" })).toBeNull();
  expect(screen.queryByText("Edit guest votes", hidden)).toBeNull();
  expect(reads.filter((url) => url.pathname === guestPath)).toHaveLength(1);
});

it("delays the empty waiting message for a full historical roster until its last page is known", async () => {
  table = {
    ...table,
    eventStatus: "CONFIRMED",
    occupiedSeatIndices: undefined,
    maxPlayers: 2,
    acceptedCount: 2,
    seatedCount: 2,
  };
  accepted = [registration("bob", bobId, { position: "FROZEN" })];
  cursor = "last-seat-page";
  nextPage = Promise.resolve(
    json({
      items: [registration("second", secondId, { position: "FROZEN", seatIndex: 1 })],
      nextCursor: null,
    }),
  );
  await render(<Fixture />);
  await ready("@bob");
  expect(screen.getByText("Waiting list")).toBeVisible();
  expect(screen.queryByText("No players waiting")).toBeNull();
  await press("Load more");

  expect(await screen.findByText("@second")).toBeVisible();
  expect(await screen.findByText("No players waiting")).toBeVisible();
  expect(reads.filter((url) => url.searchParams.get("cursor") === cursor)).toHaveLength(1);
});

it("closes the actual guest ballot without submitting and allows reopening the unchanged choices", async () => {
  table = {
    ...table,
    adminUserId: "owner",
    canManage: true,
    groupType: null,
    gameVoteRequired: true,
    occupiedSeatIndices: [0],
    acceptedCount: 1,
    seatedCount: 1,
  };
  accepted = [
    registration("guest:55555555-5555-4555-8555-555555555555", bobId, {
      kind: "GUEST",
      guestName: "Guest Player",
    }),
  ];
  const hidden = { includeHiddenElements: true };
  await render(<Fixture />);
  await ready("@Guest Player");
  await press("Edit guest votes: Guest Player");
  const yes = await screen.findByRole("button", { name: "Chess: Yes", ...hidden });
  await userEvent.setup().press(yes);
  expect(screen.getByRole("button", { name: "Vote", ...hidden })).toBeEnabled();
  const close = screen.getByLabelText("Close", hidden);
  await userEvent.setup().press(close);
  await waitFor(() => expect(screen.queryByText("Edit guest votes", hidden)).toBeNull());

  await press("Edit guest votes: Guest Player");
  await screen.findByRole("button", { name: "Chess: Yes", ...hidden });
  expect(screen.getByRole("button", { name: "Vote", ...hidden })).toBeDisabled();
  expect(writes).toEqual([]);
});
