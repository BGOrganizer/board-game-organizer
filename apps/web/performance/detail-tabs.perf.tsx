import {
  type EventParticipantResponse,
  type EventParticipantsResponse,
  type GroupPersonResponse,
  type GroupRecordResponse,
  type NotificationAttentionSnapshot,
  type NotificationAttentionTarget,
  type NotificationDto,
  notificationItemId,
  type PlannedEventResponse,
  type PlannedTableResponse,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  eventItemTargets,
  eventParticipantsQuery,
  eventRecordKeys,
  eventRecordQuery,
  eventRecordsQuery,
  groupPeopleQuery,
  groupRecordDetailQuery,
  notificationAttentionQuery,
  notificationChangesQuery,
  notificationsPageQuery,
  recordTableQuery,
  recordTablesQuery,
  tableItemTargets,
} from "@board-game-organizer/shared";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EventDetail } from "@/components/events/EventDetail";
import { EventTable } from "@/components/events/EventTable";
import { GroupDetail } from "@/components/groups/GroupDetail";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";
import {
  detailAttentionSnapshot,
  detailChangePage,
  detailNoticeList,
  detailReadReceipt,
  groupDetailNotices,
  noticeReceiptAt,
  noticeSnapshotAt,
} from "./detailNoticeFixtures";

const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "cached-detail-token"),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
const options = {
  apiUrl: "https://detail-render-fixtures.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => boundary,
  useSearchParams: () => new URLSearchParams(),
}));

const group: GroupRecordResponse = {
  ...groupRecord,
  memberCount: 6,
  eventCount: 2,
  canSocialInteract: false,
};
const members: GroupPersonResponse[] = Array.from({ length: 6 }, (_, index) => {
  const userId = index ? `member-${index}` : "owner";
  return {
    userId,
    name: index ? `Member ${index}` : "Owner",
    username: userId,
    avatarUrl: null,
    isAdmin: index === 0,
    ban: null,
    membership: index
      ? {
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          groupId: group.id,
          userId,
          kind: "INVITATION",
          status: "ACCEPTED",
          role: "MEMBER",
          version: 1,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        }
      : null,
  };
});
const ownerSeat: TableSeatResponse = { ...seat("owner"), name: "Owner" };
const event: PlannedEventResponse = {
  ...plannedEvent,
  groupId: group.id,
  groupName: group.name,
  groupType: "PRIVATE",
  canManage: true,
  myRegistrations: [ownerSeat],
  canVote: true,
  participantCount: 6,
  tableCount: 2,
  allowParticipantDates: false,
  allowParticipantLocations: false,
};
const otherEvent: PlannedEventResponse = {
  ...event,
  id: "44444444-4444-4444-8444-444444444444",
  name: "Saturday games",
  tableCount: 1,
  myRegistrations: [],
  participantCount: 0,
};
const table: PlannedTableResponse = {
  ...plannedTable,
  groupId: group.id,
  groupName: group.name,
  groupType: "PRIVATE",
  eventName: event.name,
  canManage: true,
  eventVersion: event.version,
  myRegistration: ownerSeat,
  myPosition: "SEATED",
  seatedCount: 3,
  acceptedCount: 3,
  allowParticipantGames: false,
  canRegister: false,
};
const otherTable: PlannedTableResponse = {
  ...table,
  id: "55555555-5555-4555-8555-555555555555",
  name: "Second table",
  order: 1,
  myRegistration: null,
  myPosition: null,
};
const participants: EventParticipantResponse[] = members.map((person, index) => ({
  id: person.userId,
  userId: person.userId,
  name: person.name ?? person.userId,
  username: person.username,
  avatarUrl: person.avatarUrl,
  position: "SEATED",
  accepted: true,
  pendingInvitation: false,
  waiting: false,
  demonstrator: false,
  canRemove: index !== 0,
  managementRole: index ? null : "admin",
  canBanGroup: false,
}));
const seats: TableSeatResponse[] = members.slice(0, 3).map((person, index) => ({
  ...seat(person.userId),
  id: index ? `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}` : ownerSeat.id,
  name: person.name ?? person.userId,
  username: person.username,
  sequence: index + 1,
}));
const tables = [table, otherTable];
const groupEvents = [event, otherEvent];
const participantView = { mode: "review" as const, groupId: group.id };
const acceptedKey = groupPeopleQuery(options, group.id, "accepted").queryKey;
const eventTablesKey = recordTablesQuery(options, event.id).queryKey;
const seatsKey = [...eventRecordKeys.root(options), "seats", event.id, table.id, false, ""];
const participantPage: EventParticipantsResponse = {
  items: participants,
  nextCursor: null,
  eventVersion: event.version,
  groupId: group.id,
  status: event.status,
};
const groupTargets: NotificationAttentionTarget[] = [
  { kind: "group", id: group.id },
  { kind: "event-list", id: group.id },
  { kind: "item", id: notificationItemId(group.id, "invitation") },
  { kind: "item", id: notificationItemId(group.id, "members") },
  { kind: "item", id: notificationItemId(group.id, "overview", undefined, "group") },
];
const eventTargets: NotificationAttentionTarget[] = [
  { kind: "event", id: event.id },
  ...eventItemTargets(event),
  ...tables.map((row) => ({ kind: "table" as const, id: row.id })),
];
const tableTargets: NotificationAttentionTarget[] = [
  { kind: "table", id: table.id },
  { kind: "event", id: event.id },
  ...tableItemTargets(table),
];

let activeClient: QueryClient | undefined;
function currentClient() {
  if (!activeClient) throw new Error("Expected the current measured detail Query owner");
  return activeClient;
}
const notices = groupDetailNotices(event, members[1], members[2]);
let unreadScenario = false;
let currentNotices: NotificationDto[] = [];
function seedAttention(client: QueryClient, targets: NotificationAttentionTarget[], asOf: string) {
  const snapshot =
    asOf === noticeReceiptAt
      ? detailReadReceipt(currentNotices, targets).snapshot
      : detailAttentionSnapshot(currentNotices, targets, asOf);
  client.setQueryData(notificationAttentionQuery(options, targets).queryKey, snapshot);
}
function publishNoticeCaches(client: QueryClient, asOf: string) {
  for (const scope of [
    { kind: "group", id: group.id },
    { kind: "event", id: event.id },
    { kind: "table", id: table.id },
  ] as const)
    client.setQueryData(
      notificationChangesQuery({ ...options, locale: "en" }, { ...scope, tab: "all" }).queryKey,
      {
        pages: [detailChangePage(currentNotices, { ...scope, tab: "all" }, asOf)],
        pageParams: [undefined],
      },
    );
  client.setQueryData(notificationsPageQuery({ ...options, locale: "en" }).queryKey, {
    pages: [detailNoticeList(currentNotices)],
    pageParams: [undefined],
  });
  seedAttention(client, groupTargets, asOf);
  seedAttention(
    client,
    members
      .filter((person) => person.membership?.status === "ACCEPTED")
      .map((person) => ({
        kind: "item" as const,
        id: notificationItemId(group.id, "member", person.userId),
      })),
    asOf,
  );
  seedAttention(
    client,
    groupEvents.map((row) => ({ kind: "event" as const, id: row.id })),
    asOf,
  );
  seedAttention(client, eventTargets, asOf);
  seedAttention(client, tableTargets, asOf);
}
function renderCached(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  activeClient = client;
  currentNotices = unreadScenario ? notices.initial : [];
  client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group);
  for (const mode of ["accepted", "pending", "bans"] as const)
    client.setQueryData(groupPeopleQuery(options, group.id, mode).queryKey, {
      pages: [{ items: mode === "accepted" ? members : [], nextCursor: null }],
      pageParams: [""],
    });
  client.setQueryData(eventRecordQuery(options, event.id).queryKey, event);
  client.setQueryData(eventRecordsQuery(options, { groupId: group.id }).queryKey, {
    pages: [{ items: groupEvents, nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(eventTablesKey, {
    pages: [{ items: tables, nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(eventParticipantsQuery(options, event.id, participantView).queryKey, {
    pages: [participantPage],
    pageParams: [""],
  });
  for (const row of tables)
    client.setQueryData(recordTableQuery(options, event.id, row.id).queryKey, row);
  client.setQueryData(seatsKey, { pages: [{ items: seats, nextCursor: null }], pageParams: [""] });
  client.setQueryData([...eventRecordKeys.root(options), "seats", event.id, table.id, true, ""], {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [""],
  });
  publishNoticeCaches(client, noticeSnapshotAt);
  return renderWithI18n(
    <>
      <header></header>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </>,
  );
}
function cleanupCached() {
  cleanup();
  activeClient?.clear();
  activeClient = undefined;
}
configure({
  testingLibrary: { render: renderCached, cleanup: cleanupCached },
  runs: 10,
  warmupRuns: 1,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected network read in a cached-detail render scenario");
    }),
  );
});
afterEach(() => {
  cleanupCached();
  vi.unstubAllGlobals();
});
async function selectTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
  expect(screen.getByRole("tab", { name, selected: true })).toBeVisible();
}

const cases: {
  name: string;
  element: ReactElement;
  scenario: () => Promise<void>;
  unread?: boolean;
}[] = [
  {
    name: "GroupDetail: cached Members and Events entry and reentry keeps the common header",
    element: <GroupDetail groupId={group.id} />,
    scenario: async () => {
      const header = screen.getByRole("heading", { name: group.name });
      await selectTab("Members");
      expect(await screen.findByText("@member-5")).toBeVisible();
      await selectTab("Events");
      expect(await screen.findByRole("link", { name: "Open event: Saturday games" })).toBeVisible();
      await selectTab("Details");
      expect(screen.getByRole("heading", { name: group.name })).toBe(header);
      await selectTab("Members");
      expect(await screen.findByText("@member-1")).toBeVisible();
      await selectTab("Events");
      expect(await screen.findByRole("link", { name: `Open event: ${event.name}` })).toBeVisible();
      expect(screen.getByRole("heading", { name: group.name })).toBe(header);
    },
  },
  {
    name: "GroupDetail: reentry displays fresh canonical member and group snapshots",
    element: <GroupDetail groupId={group.id} />,
    scenario: async () => {
      const header = screen.getByRole("heading", { name: group.name });
      await selectTab("Members");
      await screen.findByText("@member-1");
      await selectTab("Events");
      await screen.findByRole("link", { name: "Open event: Saturday games" });
      act(() => {
        currentClient().setQueryData(acceptedKey, {
          pages: [
            {
              items: members.map((person) =>
                person.userId === "member-1" ? { ...person, username: "updated-member" } : person,
              ),
              nextCursor: null,
            },
          ],
          pageParams: [""],
        });
        currentClient().setQueryData(groupRecordDetailQuery(options, group.id).queryKey, {
          ...group,
          name: "Updated Friday group",
          version: 2,
        });
      });
      expect(await screen.findByRole("heading", { name: "Updated Friday group" })).toBe(header);
      await selectTab("Members");
      expect(await screen.findByText("@updated-member")).toBeVisible();
      expect(screen.queryByText("@member-1")).toBeNull();
      expect(group.name).toBe(groupRecord.name);
    },
  },
  {
    name: "EventDetail: cached Participants and Tables entry and reentry keeps the event header",
    element: <EventDetail eventId={event.id} fromGroup={group.id} />,
    scenario: async () => {
      const header = screen.getByRole("heading", { name: event.name });
      await selectTab("Participants");
      expect(await screen.findByText("@member-5")).toBeVisible();
      await selectTab("Tables");
      expect(await screen.findByRole("link", { name: "Open table: Table #2" })).toBeVisible();
      await selectTab("Details");
      expect(screen.getByRole("heading", { name: "Dates and times" })).toBeVisible();
      await selectTab("Participants");
      expect(await screen.findByText("@member-1")).toBeVisible();
      await selectTab("Tables");
      expect(await screen.findByRole("link", { name: "Open table: Table #1" })).toBeVisible();
      expect(screen.getByRole("heading", { name: event.name })).toBe(header);
    },
  },
  {
    name: "EventDetail: table reentry displays the new authoritative event name and numbered table title",
    element: <EventDetail eventId={event.id} fromGroup={group.id} />,
    scenario: async () => {
      const header = screen.getByRole("heading", { name: event.name });
      await selectTab("Tables");
      await screen.findByRole("link", { name: "Open table: Table #1" });
      await selectTab("Participants");
      await screen.findByText("@member-1");
      act(() => {
        const changedTable = {
          ...table,
          name: "Refreshed first table",
          order: 2,
          eventName: "Refreshed Friday games",
          eventVersion: 2,
        };
        currentClient().setQueryData(eventRecordQuery(options, event.id).queryKey, {
          ...event,
          name: "Refreshed Friday games",
          version: 2,
        });
        currentClient().setQueryData(eventTablesKey, {
          pages: [
            {
              items: [
                changedTable,
                { ...otherTable, eventName: "Refreshed Friday games", eventVersion: 2 },
              ],
              nextCursor: null,
            },
          ],
          pageParams: [""],
        });
        currentClient().setQueryData(
          recordTableQuery(options, event.id, table.id).queryKey,
          changedTable,
        );
      });
      expect(await screen.findByRole("heading", { name: "Refreshed Friday games" })).toBe(header);
      await selectTab("Tables");
      expect(await screen.findByRole("link", { name: "Open table: Table #3" })).toBeVisible();
      expect(screen.queryByRole("link", { name: "Open table: Table #1" })).toBeNull();
      expect(table.name).toBe(plannedTable.name);
    },
  },
  {
    name: "EventTable: cached Participants reentry retains the hidden actual seats and common header",
    element: <EventTable eventId={event.id} tableId={table.id} />,
    scenario: async () => {
      const header = screen.getByRole("heading", { name: "Table #1" });
      expect(
        within(screen.getByRole("region", { name: "Board games" })).getByText("Chess"),
      ).toBeVisible();
      await selectTab("Participants");
      const person = await screen.findByText("@member-1");
      expect(person).toBeVisible();
      expect(screen.getByRole("region", { name: "Seats list" })).toBeVisible();
      await selectTab("Details");
      expect(person).not.toBeVisible();
      await selectTab("Participants");
      expect(screen.getByText("@member-1")).toBe(person);
      expect(person).toBeVisible();
      expect(screen.getByRole("heading", { name: "Table #1" })).toBe(header);
    },
  },
  {
    name: "EventTable: hidden roster remains reactive to authoritative player and table updates",
    element: <EventTable eventId={event.id} tableId={table.id} />,
    scenario: async () => {
      const header = screen.getByRole("heading", { name: "Table #1" });
      await selectTab("Participants");
      const person = await screen.findByText("@member-1");
      await selectTab("Details");
      act(() => {
        currentClient().setQueryData(seatsKey, {
          pages: [
            {
              items: seats.map((row) =>
                row.userId === "member-1"
                  ? { ...row, username: "fresh-seat-player", version: 2 }
                  : row,
              ),
              nextCursor: null,
            },
          ],
          pageParams: [""],
        });
        currentClient().setQueryData(recordTableQuery(options, event.id, table.id).queryKey, {
          ...table,
          name: "Updated first table",
        });
      });
      expect(await screen.findByRole("heading", { name: "Updated first table" })).toBe(header);
      await selectTab("Participants");
      expect(await screen.findByText("@fresh-seat-player")).toBe(person);
      expect(person).toBeVisible();
      expect(screen.queryByText("@member-1")).toBeNull();
      expect(seats[1].username).toBe("member-1");
    },
  },

  {
    name: "GroupDetail: unread Members and Events survive cached first entry and repeated switching",
    element: <GroupDetail groupId={group.id} />,
    unread: true,
    scenario: async () => {
      const header = screen.getByRole("heading", { name: group.name });
      for (const label of ["Members", "Events"])
        expect(
          within(screen.getByRole("tab", { name: label })).getByRole("img", {
            name: "Needs attention",
          }),
        ).toBeVisible();
      // Exercise Events first, matching the original six-member/two-event lag.
      for (let repeat = 0; repeat < 2; repeat++) {
        await selectTab("Events");
        await screen.findByRole("link", { name: "Open event: Saturday games" });
        const link = screen.getByRole("link", { name: `Open event: ${event.name}` });
        const card = link.closest(".card");
        if (!(card instanceof HTMLElement)) throw new Error("Expected the actual event card");
        expect(within(card).getByRole("img", { name: "Unread updates" })).toBeVisible();
        await selectTab("Members");
        const member = await screen.findByText("@member-1");
        const row = member.closest("li");
        if (!row) throw new Error("Expected the canonical member row");
        expect(within(row).getByRole("img", { name: "Unread updates" })).toBeVisible();
        for (const label of ["Members", "Events"])
          expect(
            within(screen.getByRole("tab", { name: label })).getByRole("img", {
              name: "Needs attention",
            }),
          ).toBeVisible();
      }
      expect(screen.getByRole("heading", { name: group.name })).toBe(header);
      expect(
        currentNotices.every(
          (notice) =>
            notice.readAt === null &&
            notice.attentionItems?.every((point) => point.readAt === null),
        ),
      ).toBe(true);
      expect(currentClient().getMutationCache().getAll()).toHaveLength(0);
    },
  },
  {
    name: "GroupDetail: fresh scoped notice moves the member dot without resetting cached people or events",
    element: <GroupDetail groupId={group.id} />,
    unread: true,
    scenario: async () => {
      const peopleSnapshot = currentClient().getQueryData(acceptedKey);
      const eventsKey = eventRecordsQuery(options, { groupId: group.id }).queryKey;
      const eventsSnapshot = currentClient().getQueryData(eventsKey);
      await selectTab("Members");
      const first = (await screen.findByText("@member-1")).closest("li");
      const second = screen.getByText("@member-2").closest("li");
      if (!first || !second) throw new Error("Expected both actual member rows");
      expect(within(first).getByRole("img", { name: "Unread updates" })).toBeVisible();
      expect(within(second).queryByRole("img", { name: "Unread updates" })).toBeNull();
      await selectTab("Events");
      await screen.findByRole("link", { name: "Open event: Saturday games" });
      // An external canonical receipt reads the old point while a delayed,
      // separately identified member notice arrives. Navigation does neither.
      act(() => {
        currentNotices = notices.received;
        publishNoticeCaches(currentClient(), noticeReceiptAt);
      });
      await selectTab("Members");
      const changedFirst = (await screen.findByText("@member-1")).closest("li");
      const changedSecond = screen.getByText("@member-2").closest("li");
      if (!changedFirst || !changedSecond)
        throw new Error("Expected unchanged authorized member identities");
      expect(within(changedFirst).queryByRole("img", { name: "Unread updates" })).toBeNull();
      expect(within(changedSecond).getByRole("img", { name: "Unread updates" })).toBeVisible();
      for (const label of ["Members", "Events"])
        expect(
          within(screen.getByRole("tab", { name: label })).getByRole("img", {
            name: "Needs attention",
          }),
        ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "New changes" }));
      const popover = await screen.findByRole("dialog");
      expect(await within(popover).findByText(notices.nextNotice.description)).toBeVisible();
      expect(within(popover).queryByText(notices.firstNotice.description)).toBeNull();
      fireEvent.keyDown(popover, { key: "Escape", code: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(currentClient().getQueryData(acceptedKey)).toBe(peopleSnapshot);
      expect(currentClient().getQueryData(eventsKey)).toBe(eventsSnapshot);
      expect(currentClient().getQueryData(groupRecordDetailQuery(options, group.id).queryKey)).toBe(
        group,
      );
      const snapshot = currentClient().getQueryData<NotificationAttentionSnapshot>(
        notificationAttentionQuery(options, groupTargets).queryKey,
      );
      expect(snapshot?.unreadCount).toBe(2);
      expect(
        snapshot?.targets.find(
          (row) =>
            row.target.kind === "item" && row.target.id === notificationItemId(group.id, "members"),
        )?.signal,
      ).toBe(`${members[2].membership?.updatedAt}|${notices.nextNotice.id}`);
      expect(notices.firstNotice.readAt).toBeNull();
      expect(currentClient().getMutationCache().getAll()).toHaveLength(0);
    },
  },
];
for (const { name, element, scenario, unread = false } of cases) {
  test(name, async () => {
    unreadScenario = unread;
    const result = await measureRenders(element, {
      scenario: async () => {
        await scenario();
        expect(fetch).not.toHaveBeenCalled();
        expect(boundary.getToken).not.toHaveBeenCalled();
        expect(boundary.push).not.toHaveBeenCalled();
        expect(boundary.replace).not.toHaveBeenCalled();
      },
    });
    // Unknown scenario names intentionally fail until two actual runs establish
    // their observed commit ceilings; completed raw samples are retained first.
    assertRenderMeasurement(result, name);
  });
}
