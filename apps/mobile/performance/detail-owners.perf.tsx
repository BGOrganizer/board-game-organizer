import { URL } from "node:url";
import {
  type EventParticipantResponse,
  type GroupPersonResponse,
  type GroupRecordResponse,
  type NotificationAttentionTarget,
  notificationAttentionTargetSchema,
  notificationItemId,
  type PlannedEventResponse,
  type PlannedTableResponse,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  contactSuggestionsKey,
  eventItemTargets,
  eventParticipantsQuery,
  eventRecordKeys,
  eventRecordQuery,
  eventRecordsQuery,
  groupPeopleQuery,
  groupRecordDetailQuery,
  notificationAttentionQuery,
  notificationChangesQuery,
  recordTableQuery,
  recordTablesQuery,
  relationshipListKey,
  tableItemTargets,
} from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import {
  defaultScheduler,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import type { ContextType, ReactNode } from "react";
import { View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EventScreen from "@/app/event/[eventId]";
import EventTableScreen from "@/app/event/table";
import GroupScreen from "@/app/group/[groupId]";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import {
  detailAttentionSnapshot,
  detailChangePage,
  groupDetailNotices,
  noticeSnapshotAt,
} from "../../web/performance/detailNoticeFixtures";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
  seat,
} from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  params: {} as { eventId?: string; groupId?: string; tableId?: string },
  push: vi.fn(),
  replace: vi.fn(),
  dismissTo: vi.fn(),
  getToken: vi.fn(async () => "fixture-owner"),
}));
const API = "https://detail-performance-fixtures.test";
const options = { apiUrl: API, userId: "owner", enabled: true, getToken: boundary.getToken };
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "detail-performance-owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
// Keep real application header actions; the SDK owns their native placement.
vi.mock("expo-router", () => ({
  useRouter: () => boundary,
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => boundary.params,
  Stack: {
    Screen: ({ options: config }: { options: { headerRight?: () => ReactNode } }) => (
      <View>{config.headerRight?.()}</View>
    ),
  },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://detail-performance-fixtures.test" } } },
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: vi.fn(), dismiss: vi.fn() },
}));
const focusedNavigation = {
  isFocused: () => true,
  addListener: () => () => undefined,
} as unknown as NonNullable<ContextType<typeof NavigationContext>>;

const group: GroupRecordResponse = { ...groupRecord, memberCount: 6, eventCount: 2 };
const memberIds = ["owner", "guest", "member-2", "member-3", "member-4", "member-5"];
const members: GroupPersonResponse[] = memberIds.map((userId, index) => ({
  userId,
  name: `Member ${index}`,
  username: userId,
  avatarUrl: null,
  isAdmin: userId === "owner",
  ban: null,
  membership: {
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    groupId: group.id,
    userId,
    kind: "REQUEST",
    status: "ACCEPTED",
    version: 1,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  },
}));
const roster: TableSeatResponse[] = ["owner", "guest"].map((userId, index) => ({
  ...seat(userId),
  id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
  seatIndex: index,
  sequence: index + 1,
}));
const event: PlannedEventResponse = {
  ...plannedEvent,
  groupId: group.id,
  groupName: group.name,
  groupType: group.type,
  canManage: true,
  managementRole: "admin",
  tableCount: 2,
  participantCount: 6,
  myRegistrations: [roster[0]],
};
const table: PlannedTableResponse = {
  ...plannedTable,
  groupId: group.id,
  groupName: group.name,
  groupType: group.type,
  canManage: true,
  managementRole: "admin",
  myRegistration: roster[0],
  myPosition: "SEATED",
  canRegister: false,
  acceptedCount: 2,
  seatedCount: 2,
  occupiedSeatIndices: [0, 1],
  eventVersion: event.version,
};
const tables = [
  table,
  {
    ...table,
    id: "44444444-4444-4444-8444-444444444444",
    name: "Second table",
    order: 1,
    acceptedCount: 4,
    seatedCount: 4,
    occupiedSeatIndices: [0, 1, 2, 3],
    myRegistration: null,
    myPosition: null,
  },
];
const groupEvents = [
  event,
  {
    ...event,
    id: "55555555-5555-4555-8555-555555555555",
    name: "Saturday games",
    myRegistrations: [],
    tableCount: 0,
    participantCount: 0,
  },
];
const participants: EventParticipantResponse[] = members.map((member) => {
  if (!member.name || !member.username) throw new Error("Named benchmark participants required");
  return {
    id: member.userId,
    userId: member.userId,
    name: member.name,
    username: member.username,
    avatarUrl: null,
    position: "SEATED",
    accepted: true,
    pendingInvitation: false,
    waiting: false,
    demonstrator: false,
    managementRole: member.isAdmin ? "admin" : null,
    canRemove: member.userId !== "owner",
    canBanGroup: false,
  };
});
const notices = groupDetailNotices(event, members[1], members[2]).initial;
const participantView = { mode: "review" as const, groupId: group.id };
const page = <T,>(items: T[]) => ({ pages: [{ items, nextCursor: null }], pageParams: [""] });
const seatsKey = [...eventRecordKeys.root(options), "seats", event.id, table.id, false, ""];
const participantsKey = eventParticipantsQuery(options, event.id, participantView).queryKey;

function prepare(client: QueryClient) {
  client.clear();
  vi.clearAllMocks();
  client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group);
  for (const mode of ["accepted", "pending", "bans"] as const)
    client.setQueryData(
      groupPeopleQuery(options, group.id, mode).queryKey,
      page(mode === "accepted" ? members : []),
    );
  client.setQueryData(eventRecordQuery(options, event.id).queryKey, event);
  client.setQueryData(
    eventRecordsQuery(options, { groupId: group.id }).queryKey,
    page(groupEvents),
  );
  client.setQueryData(
    eventRecordsQuery(options, { groupId: group.id, query: "Friday" }).queryKey,
    page([event]),
  );
  client.setQueryData(recordTablesQuery(options, event.id).queryKey, page(tables));
  for (const row of tables)
    client.setQueryData(recordTableQuery(options, event.id, row.id).queryKey, row);
  client.setQueryData(participantsKey, {
    pages: [
      {
        items: participants,
        nextCursor: null,
        eventVersion: event.version,
        groupId: group.id,
        status: event.status,
      },
    ],
    pageParams: [""],
  });
  client.setQueryData(seatsKey, page(roster));
  client.setQueryData(
    [...eventRecordKeys.root(options), "seats", event.id, table.id, true, ""],
    page([]),
  );
  for (const type of ["friends", "followers", "following", "pending", "sent", "blocked"] as const)
    client.setQueryData(relationshipListKey(API, "owner", type), {
      pages: [{ rows: [], nextCursor: null }],
      pageParams: [""],
    });
  client.setQueryData(contactSuggestionsKey(API, "owner"), {
    pages: [{ users: [], hasContacts: false, nextCursor: null }],
    pageParams: [""],
  });
  for (const scope of [
    { kind: "group", id: group.id },
    { kind: "event", id: event.id },
    { kind: "table", id: table.id },
  ] as const)
    client.setQueryData(
      notificationChangesQuery({ ...options, locale: "en" }, { ...scope, tab: "all" }).queryKey,
      {
        pages: [detailChangePage(notices, { ...scope, tab: "all" }, noticeSnapshotAt)],
        pageParams: [undefined],
      },
    );
  const targetSets: NotificationAttentionTarget[][] = [
    [
      { kind: "group", id: group.id },
      { kind: "event-list", id: group.id },
      ...[
        notificationItemId(group.id, "invitation"),
        notificationItemId(group.id, "members"),
        notificationItemId(group.id, "overview", undefined, "group"),
      ].map((id) => ({ kind: "item" as const, id })),
    ],
    members.map((member) => ({
      kind: "item",
      id: notificationItemId(group.id, "member", member.userId),
    })),
    groupEvents.map(({ id }) => ({ kind: "event", id })),
    [
      { kind: "event", id: event.id },
      ...eventItemTargets(event),
      ...tables.map(({ id }) => ({ kind: "table" as const, id })),
    ],
    [{ kind: "table", id: table.id }, { kind: "event", id: event.id }, ...tableItemTargets(table)],
  ];
  for (const targets of targetSets)
    client.setQueryData(
      notificationAttentionQuery(options, targets).queryKey,
      detailAttentionSnapshot(notices, targets, noticeSnapshotAt),
    );
}

async function select(name: string) {
  const button = await screen.findByRole("tab", {
    name: new RegExp(`^${name}(?: Needs attention)?$`),
  });
  await userEvent.setup().press(button);
  expect(button).toBeSelected();
}

beforeEach(async () => {
  await installNativePopoverMeasurements();
  // The real Query observers deliver updates inside the measured React act turn.
  // A timer racing the next tab gesture otherwise splits the same update arbitrarily.
  notifyManager.setScheduler(queueMicrotask);
});
afterEach(() => {
  notifyManager.setScheduler(defaultScheduler);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["group", "event", "table"] as const)(
  "actual %s detail owner: cached tab reentry preserves native content and accepts authoritative receipts",
  async (kind) => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    const writes: string[] = [];
    const resourceReads: string[] = [];
    // Only HTTP is controlled. Unexpected canonical reads expose an unseeded cache path.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (url.origin !== API) throw new Error(`Unexpected detail fixture origin ${url.origin}`);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-owner");
        const method = init?.method ?? "GET";
        if (method !== "GET") {
          writes.push(`${method} ${url.pathname}`);
          throw new Error("No benchmark interaction grants notification or resource write consent");
        }
        if (url.pathname === "/api/notifications/attention") {
          const targets = notificationAttentionTargetSchema
            .array()
            .parse(JSON.parse(url.searchParams.get("targets") ?? "[]"));
          return Response.json(detailAttentionSnapshot(notices, targets, noticeSnapshotAt));
        }
        if (url.pathname === "/api/relationships")
          return Response.json({ rows: [], nextCursor: null });
        if (url.pathname === "/api/users/suggestions")
          return Response.json({ users: [], hasContacts: false, nextCursor: null });
        resourceReads.push(url.pathname);
        throw new Error(`Unexpected read outside the seeded canonical cache ${url.pathname}`);
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <NavigationContext.Provider value={focusedNavigation}>
            {children}
          </NavigationContext.Provider>
        </NativeTestProviders>
      </QueryClientProvider>
    );
    const ui =
      kind === "group" ? (
        <GroupScreen />
      ) : kind === "event" ? (
        <EventScreen />
      ) : (
        <EventTableScreen />
      );
    try {
      const result = await measureRenders(ui, {
        wrapper,
        beforeEach: () => {
          prepare(client);
          boundary.params =
            kind === "group"
              ? { groupId: group.id }
              : kind === "event"
                ? { eventId: event.id }
                : { eventId: event.id, tableId: table.id };
          writes.length = resourceReads.length = 0;
        },
        scenario: async () => {
          expect(
            await screen.findByRole("header", {
              name: kind === "group" ? group.name : kind === "event" ? event.name : "Table #1",
            }),
          ).toBeVisible();
          if (kind === "group") {
            for (const name of ["Members", "Events"])
              expect(
                within(screen.getByRole("tab", { name: new RegExp(`^${name}`) })).getByLabelText(
                  "Needs attention",
                ),
              ).toBeVisible();
            await select("Members");
            const member = await screen.findByText("@member-5");
            await select("Events");
            const title = await screen.findByText(event.name);
            const filter = screen.getByPlaceholderText("Filter events");
            await fireEvent.changeText(filter, "Friday");
            const key = eventRecordsQuery(options, { groupId: group.id, query: "Friday" }).queryKey;
            await waitFor(() =>
              expect(
                client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount(),
              ).toBeGreaterThan(0),
            );
            const header = screen.getByRole("header", { name: group.name });
            await select("Members");
            expect(screen.getByText("@member-5")).toBe(member);
            await select("Events");
            expect(screen.getByPlaceholderText("Filter events")).toBe(filter);
            expect(filter).toHaveDisplayValue("Friday");
            expect(screen.getByText(event.name)).toBe(title);
            await act(() =>
              client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, {
                ...group,
                name: "Updated Friday group",
                approved: { ...group.approved, name: "Updated Friday group" },
                version: 2,
              }),
            );
            expect(await screen.findByRole("header", { name: "Updated Friday group" })).toBe(
              header,
            );
          } else if (kind === "event") {
            const dates = screen.getByText("Dates and times");
            await select("Tables");
            const tableName = await screen.findByText("Table #1");
            await select("Participants");
            const member = await screen.findByText("@member-5");
            await select("Details");
            expect(screen.getByText("Dates and times")).toBe(dates);
            await select("Tables");
            expect(screen.getByText("Table #1")).toBe(tableName);
            await select("Participants");
            expect(screen.getByText("@member-5")).toBe(member);
            const header = screen.getByRole("header", { name: event.name });
            await act(() => {
              client.setQueryData(eventRecordQuery(options, event.id).queryKey, {
                ...event,
                name: "Updated Friday event",
                version: 2,
              });
              client.setQueryData(participantsKey, {
                pages: [
                  {
                    items: participants.map((row) =>
                      row.userId === "member-5" ? { ...row, username: "updated-member" } : row,
                    ),
                    nextCursor: null,
                    eventVersion: 2,
                    groupId: group.id,
                    status: event.status,
                  },
                ],
                pageParams: [""],
              });
            });
            expect(await screen.findByRole("header", { name: "Updated Friday event" })).toBe(
              header,
            );
            expect(await screen.findByText("@updated-member")).toBe(member);
          } else {
            expect(screen.getByText("Chess")).toBeVisible();
            await select("Participants");
            const guest = await screen.findByText("@guest");
            await select("Details");
            expect(screen.getByText("Chess")).toBeVisible();
            await select("Participants");
            expect(screen.getByText("@guest")).toBe(guest);
            const header = screen.getByRole("header", { name: "Table #1" });
            await act(() => {
              client.setQueryData(eventRecordQuery(options, event.id).queryKey, {
                ...event,
                version: 2,
              });
              client.setQueryData(recordTableQuery(options, event.id, table.id).queryKey, {
                ...table,
                name: "Legacy table name",
                eventVersion: 2,
              });
              client.setQueryData(
                seatsKey,
                page(
                  roster.map((row) =>
                    row.userId === "guest"
                      ? { ...row, username: "updated-guest", version: 2 }
                      : row,
                  ),
                ),
              );
            });
            expect(await screen.findByRole("header", { name: "Table #1" })).toBe(header);
            expect(await screen.findByText("@updated-guest")).toBe(guest);
          }
          await waitFor(() => expect(client.isFetching()).toBe(0));
          expect(resourceReads).toEqual([]);
          expect(writes).toEqual([]);
          expect(
            notices.every(
              (notice) =>
                notice.readAt === null &&
                notice.attentionItems?.every((item) => item.readAt === null),
            ),
          ).toBe(true);
          expect(boundary.push).not.toHaveBeenCalled();
          expect(boundary.replace).not.toHaveBeenCalled();
        },
      });
      assertRenderMeasurement(result);
    } finally {
      client.clear();
    }
  },
);
