import type {
  EventParticipantResponse,
  EventParticipantsResponse,
  PlannedEventResponse,
} from "@board-game-organizer/schemas";
import {
  eventParticipantsQuery,
  eventRecordKeys,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListActivityContext } from "@/lib/listActivity";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedEvent } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventParticipants } from "../EventParticipants";

const API = "https://participant-native-fixtures.test";
const boundary = vi.hoisted(() => ({
  userId: "owner",
  apiUrl: "https://participant-native-fixtures.test",
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
const options = () => ({
  apiUrl: boundary.apiUrl,
  userId: boundary.userId,
  enabled: true,
  getToken: async () => "fixture-participant-token",
  feedback: boundary.feedback,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("expo-router", () => ({ useNavigation: () => ({ getState: () => ({ type: "stack" }) }) }));
let client: QueryClient;
let event: PlannedEventResponse;
let people: EventParticipantResponse[];
let nextPeople: EventParticipantResponse[];
let code: number;
let nextCursor: string | null;
let writeCode: number;
let pendingRead: Promise<Response> | undefined;
const reads: URL[] = [];
const writes: { path: string; input: unknown }[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function participant(
  userId = "target",
  change: Partial<EventParticipantResponse> = {},
): EventParticipantResponse {
  return {
    id: userId,
    userId,
    name: `${userId} Full Name`,
    username: `@${userId}`,
    avatarUrl: null,
    position: "SEATED",
    accepted: true,
    pendingInvitation: false,
    waiting: false,
    demonstrator: false,
    managementRole: null,
    canRemove: true,
    canBanGroup: false,
    ...change,
  };
}
function page(rows = people, cursor = nextCursor): EventParticipantsResponse {
  return {
    items: rows,
    nextCursor: cursor,
    eventVersion: event.version,
    groupId: event.groupId,
    status: event.status,
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.userId = "owner";
  boundary.apiUrl = API;
  event = { ...plannedEvent, canManage: true, managementRole: "admin" };
  people = [participant()];
  nextPeople = [participant("next-player")];
  code = writeCode = 200;
  nextCursor = null;
  pendingRead = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(eventRecordKeys.detail(options(), event.id), event);
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== boundary.apiUrl)
        throw new Error(`Unexpected participant fixture origin ${url.origin}`);
      if (
        init?.method === "DELETE" &&
        url.pathname.startsWith(`/api/events/${event.id}/participants/`)
      ) {
        writes.push({ path: url.pathname, input: JSON.parse(String(init.body)) });
        if (writeCode !== 200) return json({ error: "Fixture removal rejected" }, writeCode);
        people = people.filter((person) => !url.pathname.endsWith(person.userId));
        event = { ...event, version: event.version + 1 };
        return json(event);
      }
      if (
        (init?.method ?? "GET") !== "GET" ||
        url.pathname !== `/api/events/${event.id}/participants`
      )
        throw new Error(`Unexpected participant fixture path ${url.pathname}`);
      reads.push(url);
      return (
        pendingRead ??
        json(
          code === 200
            ? url.searchParams.has("cursor")
              ? page(nextPeople, null)
              : page()
            : { error: "Fixture participants unavailable" },
          code,
        )
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Contents({
  record = event,
  ...props
}: Omit<Partial<ComponentProps<typeof EventParticipants>>, "actions" | "event"> & {
  record?: PlannedEventResponse;
}) {
  const actions = useEventRecordActions(options(), record.id);
  return (
    <EventParticipants
      event={record}
      actions={actions}
      header={<Text>Participants header</Text>}
      {...props}
    />
  );
}
function Fixture({
  active = true,
  ...props
}: ComponentProps<typeof Contents> & { active?: boolean }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <ListActivityContext value={{ current: active }}>
          <Contents {...props} />
        </ListActivityContext>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function openRemoval(userId = "target") {
  await press(`Manage participant: @${userId}`);
  // The actual Gorhom sheet and callbacks are retained. Node's maintained
  // worklet preset cannot prove sheet visibility; physical opening is Maestro.
  await press("Remove from event");
  expect(screen.getByTestId("confirmation-dialog")).toBeVisible();
}
async function end(height = 1200) {
  let list = screen.getByText("Participants header");
  while (list.parent && typeof list.props.onScroll !== "function") list = list.parent;
  await scrollNativeListToEnd(list, height);
}

it.each(["admin", "moderator", null, undefined] as const)(
  "renders normalized handles and cumulative participant roles without inferring action capabilities (%s)",
  async (managementRole) => {
    people = [
      participant("target", {
        username: "@@handle",
        managementRole,
        position: "WAITING",
        waiting: true,
        demonstrator: true,
        canRemove: false,
      }),
    ];
    await render(<Fixture />);
    expect(await screen.findByText("@handle")).toBeVisible();
    expect(screen.queryByText("target Full Name")).toBeNull();
    expect(screen.queryByRole("button", { name: /Manage participant:/ })).toBeNull();
    const label = [
      managementRole === "admin" ? "Admin" : managementRole === "moderator" ? "Moderator" : null,
      "Demonstrator",
      "Participant on the waiting list",
      "Accepted participant",
    ]
      .filter(Boolean)
      .join(" · ");
    await pressMeasuredPopover(screen.getByRole("button", { name: label }));
    let popup = screen.getByRole("heading", { name: "Roles and participation" });
    while (popup.parent && popup.props.role !== "dialog") popup = popup.parent;
    expect(popup.props.role).toBe("dialog");
    for (const role of ["Demonstrator", "Participant on the waiting list", "Accepted participant"])
      expect(within(popup).getByText(role)).toBeVisible();
  },
);

it("uses an explicit missing-username fallback without creating a handle from a full name", async () => {
  people = [participant("target", { username: null, name: "Full Display Name" })];
  await render(<Fixture />);
  expect(await screen.findByText("Full Display Name")).toBeVisible();
  expect(screen.queryByText("@Full Display Name")).toBeNull();
});

it("keeps initial participants pending and distinguishes a genuine empty source", async () => {
  let finish: (value: Response) => void = () => {};
  pendingRead = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("No participants yet")).toBeNull();
  pendingRead = undefined;
  await act(() => finish(json(page([]))));
  expect(await screen.findByText("No participants yet")).toBeVisible();
});

it("keeps a denied source observable and retries only after a deliberate action", async () => {
  code = 403;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load participants")).toBeVisible();
  expect(screen.queryByText("No participants yet")).toBeNull();
  code = 200;
  await press("Try again");
  expect(await screen.findByText("@target")).toBeVisible();
});

it("keeps cached members visible during an ordinary failed background refresh without converting failure to empty", async () => {
  const query = eventParticipantsQuery(options(), event.id, {
    mode: "review",
    groupId: event.groupId,
  });
  client.setQueryData(query.queryKey, { pages: [page()], pageParams: [""] });
  await client.invalidateQueries({ queryKey: query.queryKey, refetchType: "none" });
  code = 503;
  await render(<Fixture />);
  expect(screen.getByText("@target")).toBeVisible();
  expect(await screen.findByText("Could not load participants")).toBeVisible();
  expect(screen.queryByText("No participants yet")).toBeNull();
});

it.each(["self", "no-manager", "no-remove", "confirmed", "read-only", "disabled"] as const)(
  "does not expose a participant management action when %s forbids it",
  async (reason) => {
    if (reason === "self") people = [participant("owner")];
    else if (reason === "no-manager") event = { ...event, canManage: false, managementRole: null };
    else if (reason === "no-remove") people = [participant("target", { canRemove: false })];
    else if (reason === "confirmed") event = { ...event, status: "CONFIRMED" };
    else if (reason === "read-only") event = { ...event, readOnly: true };
    await render(<Fixture disabled={reason === "disabled"} />);
    await screen.findByText(reason === "self" ? "@owner" : "@target");
    expect(screen.queryByRole("button", { name: /Manage participant:/ })).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("requires explicit event-wide removal consent and leaves group membership untouched on cancellation", async () => {
  await render(<Fixture />);
  await openRemoval();
  expect(
    screen.getByText(
      "All active registrations for this person in this event will be removed. Group membership stays unchanged.",
    ),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await userEvent
    .setup()
    .press(
      within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: "Cancel" }),
    );
  expect(screen.getByText("@target")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("removes only the reviewed participant's event registrations using the captured event version", async () => {
  await render(<Fixture />);
  await openRemoval();
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Remove from event",
    }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes).toEqual([
    { path: `/api/events/${event.id}/participants/target`, input: { version: 1 } },
  ]);
  await waitFor(() => expect(screen.queryByText("@target")).toBeNull());
  expect(reads.every((url) => !url.pathname.startsWith("/api/groups"))).toBe(true);
});

it.each(["version", "capability", "person-missing"] as const)(
  "expires an open participant decision after %s changes",
  async (reason) => {
    const record = event;
    const view = await render(<Fixture record={record} />);
    await openRemoval();
    if (reason === "person-missing") {
      const query = eventParticipantsQuery(options(), event.id, {
        mode: "review",
        groupId: event.groupId,
      });
      await act(() => client.setQueryData(query.queryKey, { pages: [page([])], pageParams: [""] }));
    } else
      await view.rerender(
        <Fixture
          record={{
            ...record,
            ...(reason === "version" ? { version: 2 } : { canManage: false, managementRole: null }),
          }}
        />,
      );
    expect(
      await screen.findByText("Event details changed. Close and reopen this action."),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("confirmation-dialog")).queryByRole("button", {
        name: "Remove from event",
      }),
    ).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("rolls back a rejected participant removal and retains a real feedback failure", async () => {
  writeCode = 400;
  await render(<Fixture />);
  await openRemoval();
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Remove from event",
    }),
  );
  await waitFor(() => expect(boundary.feedback.onError).toHaveBeenCalled());
  expect(await screen.findByText("@target")).toBeVisible();
});

it("reveals cached participants progressively and uses explicit Load more without modifying canonical pages", async () => {
  const query = eventParticipantsQuery(options(), event.id, {
    mode: "review",
    groupId: event.groupId,
  });
  const cached = {
    pages: [page(people, "next"), page(nextPeople, null)],
    pageParams: ["", "next"],
  };
  client.setQueryData(query.queryKey, cached);
  await render(<Fixture />);
  expect(screen.getByText("@target")).toBeVisible();
  expect(screen.queryByText("@next-player")).toBeNull();
  await press("Load more");
  expect(await screen.findByText("@next-player")).toBeVisible();
  expect(client.getQueryData(query.queryKey)).toBe(cached);
  expect(reads).toHaveLength(0);
});

it("ignores hidden list end events then requests the next page only after active user scrolling", async () => {
  nextCursor = "next";
  const view = await render(<Fixture active={false} />);
  await screen.findByText("@target");
  await end();
  expect(reads.filter((url) => url.searchParams.has("cursor"))).toHaveLength(0);
  await view.rerender(<Fixture active />);
  await end(1264);
  expect(await screen.findByText("@next-player")).toBeVisible();
  expect(reads.filter((url) => url.searchParams.has("cursor"))).toHaveLength(1);
});
