import type {
  PlannedTableResponse,
  TableSeatOrderSnapshot,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type ComponentProps, type RefObject, useContext, useLayoutEffect } from "react";
import { type ScrollView, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScrollTargetContext } from "@/components/common/ui/ScrollTargetContext";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventTableSeats } from "../EventTableSeats";

const API = "https://table-seats-fixtures.test";
const boundary = vi.hoisted(() => ({
  push: vi.fn(),
  feedback: {
    onOptimisticUpdate: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
  },
}));
const options = {
  apiUrl: API,
  userId: "owner",
  enabled: true,
  getToken: async () => "fixture-owner-token",
  feedback: boundary.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({}),
}));

const ownId = "44444444-4444-4444-8444-444444444444";
const bobId = "55555555-5555-4555-8555-555555555555";
const pendingId = "66666666-6666-4666-8666-666666666666";
const waitingId = "77777777-7777-4777-8777-777777777777";
function registration(
  userId: string,
  id: string,
  change: Partial<TableSeatResponse> = {},
): TableSeatResponse {
  return {
    ...seat(userId),
    id,
    name: `${userId} Player`,
    username: userId,
    seatIndex: 0,
    ...change,
  };
}
let client: QueryClient;
let table: PlannedTableResponse;
let accepted: TableSeatResponse[];
let pending: TableSeatResponse[];
let rosterStatus: number;
let orderStatus: number;
let snapshot: TableSeatOrderSnapshot;
let pendingRoster: Promise<Response> | undefined;
const writes: { path: string; input: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  accepted = [
    registration("owner", ownId),
    registration("bob", bobId, { seatIndex: 1, sequence: 2, locked: true }),
    registration("waiting", waitingId, {
      seatIndex: null,
      position: "WAITING",
      sequence: 4,
    }),
  ];
  pending = [
    registration("pending", pendingId, {
      status: "PENDING",
      seatIndex: 2,
      sequence: 3,
    }),
  ];
  table = {
    ...plannedTable,
    canManage: true,
    canLeave: true,
    canInvite: true,
    eventVersion: 1,
    myRegistration: accepted[0],
    myPosition: "SEATED",
    seatedCount: 2,
    pendingCount: 1,
    waitingCount: 1,
    occupiedSeatIndices: [0, 1, 2],
  };
  snapshot = {
    version: 1,
    allocationKey: "allocation-one",
    capacity: 4,
    seatedCount: 3,
    registrations: [
      ...accepted.filter((row) => row.position !== "WAITING"),
      ...pending,
      accepted[2],
    ],
  };
  rosterStatus = 200;
  orderStatus = 200;
  pendingRoster = undefined;
  writes.length = 0;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      if (url.pathname.endsWith("/seats/order")) {
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body));
          writes.push({ path: url.pathname, input: body });
          return json(
            orderStatus === 200
              ? {
                  ...snapshot,
                  version: snapshot.version + 1,
                  registrations: snapshot.registrations.map((row) => ({
                    ...row,
                    ...(body.registrations as { id: string }[]).find(
                      (entry) => entry.id === row.id,
                    ),
                  })),
                }
              : { error: "Fixture allocation changed" },
            orderStatus,
          );
        }
        return json(
          orderStatus === 200 ? snapshot : { error: "Fixture order unavailable" },
          orderStatus,
        );
      }
      if (url.pathname.endsWith("/seats"))
        return (
          pendingRoster ??
          json(
            rosterStatus === 200
              ? {
                  items: url.searchParams.get("pending") === "true" ? pending : accepted,
                  nextCursor: null,
                }
              : { error: "Fixture players unavailable" },
            rosterStatus,
          )
        );
      if (url.pathname === `/api/events/${table.eventId}`) return json(plannedEvent);
      if (url.pathname === `/api/events/${table.eventId}/tables/${table.id}`) return json(table);
      if (url.pathname === `/api/events/${table.eventId}/tables`)
        return json({ items: [table], nextCursor: null });
      throw new Error(`Unexpected fixture path: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  onRemove = () => {},
  ...props
}: Partial<ComponentProps<typeof EventTableSeats>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventTableSeats
          table={table}
          header={<Text>Actual table header</Text>}
          overview={<Text>Actual table overview</Text>}
          {...props}
          onRemove={onRemove}
        />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
async function ready() {
  await screen.findByText("@bob");
}
async function startOrder() {
  await press("Reorder seats");
  await screen.findByTestId(`seat-order-row-${ownId}`);
}

function ScrollScopeProbe({
  label,
  capture,
}: {
  label: string;
  capture: (owner: RefObject<ScrollView | null>) => void;
}) {
  const owner = useContext(ScrollTargetContext);
  useLayoutEffect(() => {
    if (!owner) throw new Error("Expected the actual table presentation scroll context");
    capture(owner);
  }, [capture, owner]);
  return <Text>{label}</Text>;
}

it("isolates real Info and roster scroll refs while retaining an unsaved seat editor across presentations", async () => {
  const headerOwners = new Set<RefObject<ScrollView | null>>();
  const overviewOwners = new Set<RefObject<ScrollView | null>>();
  const captureHeader = (owner: RefObject<ScrollView | null>) => {
    headerOwners.add(owner);
  };
  const captureOverview = (owner: RefObject<ScrollView | null>) => {
    overviewOwners.add(owner);
  };
  const fixture = (active: boolean) => (
    <Fixture
      active={active}
      header={<ScrollScopeProbe label="Current table header" capture={captureHeader} />}
      overview={<ScrollScopeProbe label="Current Info content" capture={captureOverview} />}
    />
  );
  const view = await render(fixture(true));
  await ready();
  expect(headerOwners.size).toBe(1);
  const rosterOwner = [...headerOwners][0];
  expect(typeof rosterOwner.current?.scrollTo).toBe("function");
  await view.rerender(fixture(false));
  expect(screen.getByText("Current Info content")).toBeVisible();
  expect(overviewOwners.size).toBe(1);
  const infoOwner = [...overviewOwners][0];
  expect(headerOwners.size).toBe(2);
  expect(headerOwners.has(infoOwner)).toBe(true);
  expect(infoOwner).not.toBe(rosterOwner);
  expect(typeof infoOwner.current?.scrollTo).toBe("function");
  await view.rerender(fixture(true));
  await startOrder();
  expect(screen.getByTestId(`seat-order-up-${ownId}`)).toBeDisabled();
  await userEvent.setup().press(screen.getByTestId(`seat-order-down-${ownId}`));
  const edited = screen.getByTestId(`seat-order-row-${ownId}`);
  expect(screen.getByTestId(`seat-order-up-${ownId}`)).toBeEnabled();
  expect([null, undefined]).toContain(rosterOwner.current);
  await view.rerender(fixture(false));
  expect(screen.getByText("Current Info content")).toBeVisible();
  expect([...overviewOwners]).toEqual([infoOwner]);
  expect(typeof infoOwner.current?.scrollTo).toBe("function");
  expect([null, undefined]).toContain(rosterOwner.current);
  await view.rerender(fixture(true));
  expect(screen.getByTestId(`seat-order-row-${ownId}`)).toBe(edited);
  expect(screen.getByTestId(`seat-order-up-${ownId}`)).toBeEnabled();
  expect(screen.getByRole("button", { name: "Save seat order" })).toBeEnabled();
  expect(headerOwners.size).toBe(2);
  expect(writes).toEqual([]);
});

it("renders accepted, pending and queued players with current actions and keeps anonymous places separate", async () => {
  const remove = vi.fn();
  await render(<Fixture onRemove={remove} />);
  await ready();
  for (const name of ["@owner", "@bob", "@pending", "@waiting"])
    expect(screen.getByText(name)).toBeVisible();
  expect(screen.getByText("Seats list")).toBeVisible();
  expect(screen.getByText("Waiting list")).toBeVisible();
  expect(screen.getByRole("button", { name: "Free place" })).toBeEnabled();
  await press("Leave table");
  expect(remove).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "owner" }), true);
  await press("Remove player: @bob");
  expect(remove).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "bob" }), false);
});

it("shows a single at-sign for a seated guest in the roster and reorder editor", async () => {
  const guest = registration(
    "guest:88888888-8888-4888-8888-888888888888",
    "88888888-8888-4888-8888-888888888888",
    { kind: "GUEST", guestName: "@Guest Alice", seatIndex: 3 },
  );
  accepted.push(guest);
  snapshot.registrations.push(guest);
  await render(<Fixture />);
  expect(await screen.findByText("@Guest Alice")).toBeVisible();
  await startOrder();
  expect(screen.getByText("@Guest Alice")).toBeVisible();
});

it("requires a known private-event participation context before enabling a free place", async () => {
  table = { ...table, groupType: "PRIVATE" };
  const view = await render(<Fixture />);
  await ready();
  expect(screen.getByRole("button", { name: "Free place" })).toBeDisabled();
  await view.rerender(<Fixture hasJoinedEvent={false} />);
  expect(screen.getByRole("button", { name: "Free place" })).toBeEnabled();
  await press("Free place");
  expect(screen.getByText("Choose a place action")).toBeVisible();
  await press("Cancel");
  expect(boundary.push).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
});

it("routes an explicit invite action to this exact event/table and does not treat opening the chooser as consent", async () => {
  await render(<Fixture />);
  await ready();
  await press("Free place");
  expect(screen.getByText("Join this table yourself or invite another player.")).toBeVisible();
  expect(writes).toHaveLength(0);
  await press("Invite players");
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/event/invite",
    params: { eventId: table.eventId, tableId: table.id },
  });
});

it("preserves cached participant rows across the retained overview panel and renders fresh authoritative profiles", async () => {
  const view = await render(<Fixture />);
  await ready();
  const leave = screen.getByRole("button", { name: "Leave table" });
  await view.rerender(<Fixture active={false} />);
  expect(screen.getByText("Actual table overview")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
  const key = ["events", API, "owner", "seats", table.eventId, table.id, false, ""];
  accepted = accepted.map((row) =>
    row.userId === "bob" ? { ...row, username: "updated-bob", version: 2 } : row,
  );
  await act(() =>
    client.setQueryData(key, {
      pages: [{ items: accepted, nextCursor: null }],
      pageParams: [""],
    }),
  );
  await view.rerender(<Fixture active />);
  expect(await screen.findByText("@updated-bob")).toBeVisible();
  expect(screen.queryByText("@bob")).toBeNull();
  expect(screen.getByRole("button", { name: "Leave table" })).toBe(leave);
});

it("keeps initial and failed roster reads distinct from a genuinely empty finished table", async () => {
  let finish: (response: Response) => void = () => {};
  pendingRoster = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  table = {
    ...table,
    canManage: false,
    myRegistration: null,
    eventStatus: "TERMINATED",
    seatedCount: 0,
    pendingCount: 0,
    waitingCount: 0,
    occupiedSeatIndices: [],
  };
  await render(<Fixture />);
  expect(screen.queryByText("No players found")).toBeNull();
  await act(() => finish(json({ error: "Fixture players unavailable" }, 503)));
  expect(await screen.findByText("Could not load players")).toBeVisible();
  expect(screen.queryByText("No players found")).toBeNull();
  pendingRoster = undefined;
  accepted = pending = [];
  await press("Try again");
  expect(await screen.findByText("No players found")).toBeVisible();
  expect(screen.getByText("No players waiting")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Reorder seats" })).toBeNull();
});

it("revokes manager-only remove/reorder actions and closed public departure without hiding authorized identities", async () => {
  table = {
    ...table,
    canManage: false,
    canInvite: false,
    canRegister: false,
    groupType: "PUBLIC",
    bookingClosesAt: "2020-01-01T00:00:00.000Z",
  };
  await render(<Fixture />);
  await ready();
  expect(screen.queryByRole("button", { name: "Reorder seats" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove player: @bob" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
  expect(screen.getByRole("button", { name: "Free place" })).toBeDisabled();
});

it("moves unlocked players past locked places, permits pending locks and sends only an explicit versioned order", async () => {
  await render(<Fixture />);
  await ready();
  await startOrder();
  expect(screen.getByTestId(`seat-order-lock-${bobId}`)).toHaveAccessibleName("Unlock player");
  await userEvent.setup().press(screen.getByTestId(`seat-order-lock-${pendingId}`));
  expect(screen.getByTestId(`seat-order-lock-${pendingId}`)).toHaveAccessibleName("Unlock player");
  await userEvent.setup().press(screen.getByTestId(`seat-order-lock-${pendingId}`));
  await userEvent.setup().press(screen.getByTestId(`seat-order-down-${ownId}`));
  expect(writes).toHaveLength(0);
  await press("Save seat order");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toMatchObject({
    version: 1,
    allocationKey: "allocation-one",
    registrations: expect.arrayContaining([
      { id: ownId, version: 1, locked: false, seatIndex: 2 },
      { id: bobId, version: 1, locked: true, seatIndex: 1 },
      { id: pendingId, version: 1, locked: false, seatIndex: 0 },
    ]),
  });
  await waitFor(() => expect(screen.queryByTestId("seat-order-list")).toBeNull());
});

it("discards draft seat order without writing and reopens the untouched canonical snapshot", async () => {
  await render(<Fixture />);
  await ready();
  await startOrder();
  await userEvent.setup().press(screen.getByTestId(`seat-order-lock-${ownId}`));
  await press("Discard unsaved order");
  expect(screen.queryByTestId("seat-order-list")).toBeNull();
  expect(writes).toHaveLength(0);
  await startOrder();
  expect(screen.getByTestId(`seat-order-lock-${ownId}`)).toHaveAccessibleName("Lock player");
});

it("requires a refreshed allocation after an authoritative epoch change and preserves permission revocation", async () => {
  const view = await render(<Fixture />);
  await ready();
  await startOrder();
  table = { ...table, eventVersion: 2 };
  await view.rerender(<Fixture />);
  expect(
    screen.getByText("The roster changed. Review a fresh snapshot before saving."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Save seat order" })).toBeDisabled();
  snapshot = { ...snapshot, version: 2, allocationKey: "allocation-two" };
  await press("Review latest roster");
  await waitFor(() =>
    expect(
      screen.queryByText("The roster changed. Review a fresh snapshot before saving."),
    ).toBeNull(),
  );
  expect(screen.getByRole("button", { name: "Save seat order" })).toBeEnabled();
  table = { ...table, canManage: false, canInvite: false };
  await view.rerender(<Fixture />);
  expect(screen.queryByTestId("seat-order-list")).toBeNull();
  expect(screen.queryByRole("button", { name: "Reorder seats" })).toBeNull();
});

it("keeps an unavailable order observable, supports fresh review, and reports a rejected save", async () => {
  orderStatus = 503;
  await render(<Fixture />);
  await ready();
  await press("Reorder seats");
  expect(await screen.findByText("Could not save seat order")).toBeVisible();
  orderStatus = 200;
  await press("Review latest roster");
  await screen.findByTestId(`seat-order-row-${ownId}`);
  orderStatus = 409;
  await press("Save seat order");
  expect(
    await screen.findByText("The roster changed. Review a fresh snapshot before saving."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Save seat order" })).toBeDisabled();
});

it.each([false, true])(
  "retains native section order when an already visited roster hides and returns (waiting=%s)",
  async (waiting) => {
    if (!waiting) {
      accepted = accepted.filter((row) => row.position !== "WAITING");
      table = { ...table, waitingCount: 0 };
      snapshot = {
        ...snapshot,
        registrations: snapshot.registrations.filter((row) => row.id !== waitingId),
      };
    }
    const view = await render(<Fixture />);
    await ready();
    const seats = screen.getByText("Seats list");
    const queue = screen.getByText("Waiting list");
    expect(screen.container.queryAll((node) => node === seats || node === queue)).toEqual([
      seats,
      queue,
    ]);
    if (waiting) expect(screen.getByText("@waiting")).toBeVisible();
    else expect(screen.queryByText("@waiting")).toBeNull();
    await view.rerender(<Fixture active={false} />);
    expect(screen.queryByText("Seats list")).toBeNull();
    expect(screen.getByText("Seats list", { includeHiddenElements: true })).toBe(seats);
    expect(screen.getByText("Waiting list", { includeHiddenElements: true })).toBe(queue);
    await view.rerender(<Fixture active />);
    expect(screen.getByText("Seats list")).toBe(seats);
    expect(screen.getByText("Waiting list")).toBe(queue);
    expect(screen.container.queryAll((node) => node === seats || node === queue)).toEqual([
      seats,
      queue,
    ]);
    expect(writes).toEqual([]);
  },
);
