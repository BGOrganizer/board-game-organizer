import {
  type CommunityActivity,
  type GroupRecordResponse,
  groupRecordMemberRoles,
  type NotificationAttentionSnapshot,
  type NotificationAttentionTarget,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  communityActivitiesQuery,
  eventRecordsQuery,
  groupRecordsPageQuery,
  notificationAttentionQuery,
  recordTablesQuery,
} from "@board-game-organizer/shared";
import type { QueryClient } from "@tanstack/react-query";
import { groupRecord, plannedEvent, plannedTable } from "../src/test-fixtures/eventRecords";

export type MainListOwner = "groups" | "events" | "history";
type RefreshKind = MainListOwner | "community";
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const pages = <T>(first: T, second: T) => ({
  pages: [
    { items: [first], nextCursor: "retained" },
    { items: [second], nextCursor: null },
  ],
  pageParams: ["", "retained"],
});
const onePage = <T>(item: T) => ({
  pages: [{ items: [item], nextCursor: null }],
  pageParams: [""],
});

/** Pure canonical DTO/cache fixtures shared by the two real platform owners. */
export function seedMainListOwners(client: QueryClient, options: CommunityApiOptions) {
  const privateGroup: GroupRecordResponse = {
    ...groupRecord,
    id: id(1),
    name: "Cached private group",
    approved: { name: "Cached private group" },
  };
  const secondGroup: GroupRecordResponse = {
    ...privateGroup,
    id: id(2),
    name: "Retained private group",
    approved: { name: "Retained private group" },
  };
  const publicGroup: GroupRecordResponse = {
    ...privateGroup,
    id: id(3),
    type: "PUBLIC",
    name: "Cached public group",
    approved: { name: "Cached public group", location: plannedEvent.locations[0] },
  };
  const scheduled: PlannedEventResponse = {
    ...plannedEvent,
    id: id(100),
    name: "Cached scheduled event",
    canManage: true,
  };
  const secondEvent: PlannedEventResponse = {
    ...scheduled,
    id: id(101),
    name: "Retained scheduled event",
  };
  const available: PlannedEventResponse = {
    ...scheduled,
    id: id(102),
    name: "Cached available event",
    groupId: publicGroup.id,
    groupName: publicGroup.name,
    groupType: "PUBLIC",
    adminUserId: "other-owner",
    role: "viewer",
    canManage: false,
    canEdit: false,
    canInvite: false,
    bookingClosesAt: "2099-06-02T18:00:00.000Z",
    endsAt: "2099-06-03T22:00:00.000Z",
  };
  const terminated: PlannedEventResponse = {
    ...scheduled,
    id: id(103),
    name: "Cached terminated event",
    status: "TERMINATED",
  };
  const table: PlannedTableResponse = {
    ...plannedTable,
    id: id(200),
    name: "Cached history table",
    eventStatus: "TERMINATED",
    canManage: true,
    confirmed: {
      gameId: 1,
      playerIds: ["owner", "other-player"],
      startsAt: "2030-06-03T18:00:00.000Z",
    },
  };
  const secondTable: PlannedTableResponse = {
    ...table,
    id: id(201),
    name: "Retained history table",
  };
  const activity: CommunityActivity = {
    id: id(300),
    kind: "played",
    outcome: "played",
    occurredAt: "2030-06-03T18:00:00.000Z",
    context: "Cached activity table",
    href: `/events/${scheduled.id}/tables/${table.id}`,
    visibility: "authorized",
    author: {
      id: "network-author",
      name: "Network Player",
      username: "network-player",
      avatarUrl: null,
    },
  };
  const secondActivity: CommunityActivity = {
    ...activity,
    id: id(301),
    context: "Retained activity table",
  };
  const keys = {
    groups: groupRecordsPageQuery(options, "mine", "", groupRecordMemberRoles, "PRIVATE").queryKey,
    publicGroups: groupRecordsPageQuery(options, "mine", "", groupRecordMemberRoles, "PUBLIC")
      .queryKey,
    events: eventRecordsQuery(options, {
      section: "mine",
      statuses: ["CONFIRMED", "PLANNING"],
      query: "",
    }).queryKey,
    available: eventRecordsQuery(options, {
      section: "available",
      statuses: ["PLANNING"],
      query: "",
    }).queryKey,
    terminated: eventRecordsQuery(options, {
      section: "terminated",
      statuses: ["TERMINATED"],
      query: "",
    }).queryKey,
    history: recordTablesQuery(options, null, { statuses: ["TERMINATED"], query: "" }).queryKey,
    community: communityActivitiesQuery(options, "all").queryKey,
  };
  const snapshots = {
    groups: pages(privateGroup, secondGroup),
    events: pages(scheduled, secondEvent),
    history: pages(table, secondTable),
    community: pages(activity, secondActivity),
  };
  for (const kind of ["groups", "events", "history", "community"] as const)
    client.setQueryData(keys[kind], snapshots[kind]);
  client.setQueryData(keys.publicGroups, onePage(publicGroup));
  client.setQueryData(keys.available, onePage(available));
  client.setQueryData(keys.terminated, onePage(terminated));
  // The real Events root warms its actual source-filtered creation picker.
  client.setQueryData(
    groupRecordsPageQuery(options, "mine", "", ["admin"]).queryKey,
    onePage(privateGroup),
  );

  const attention = (targets: NotificationAttentionTarget[]) => {
    const snapshot: NotificationAttentionSnapshot = {
      asOf: "2030-06-01T10:00:00.000Z",
      unreadCount: 0,
      summary: {
        groups: 0,
        events: 0,
        tables: 0,
        contacts: 0,
        sections: { connections: 0, requests: 0, search: 0 },
      },
      targets: targets.map((target) => ({
        target,
        count: 0,
        direct: 0,
        events: 0,
        sections: { connections: 0, requests: 0, search: 0 },
      })),
    };
    client.setQueryData(notificationAttentionQuery(options, targets).queryKey, snapshot);
  };
  attention(
    (["PRIVATE", "PUBLIC", "search"] as const).map((value) => ({ kind: "group-list", id: value })),
  );
  attention(
    (["mine", "available", "terminated"] as const).map((value) => ({
      kind: "event-list",
      id: value,
    })),
  );
  for (const [kind, rows] of [
    ["group", [privateGroup, secondGroup]],
    ["group", [publicGroup]],
    ["event", [scheduled, secondEvent]],
    ["event", [available]],
    ["event", [terminated]],
    ["table", [table, secondTable]],
  ] as const) {
    for (let length = 1; length <= rows.length; length++)
      attention(rows.slice(0, length).map((row) => ({ kind, id: row.id })));
  }
  const foreignKey = groupRecordsPageQuery(
    { ...options, userId: "foreign-owner" },
    "mine",
    "",
    groupRecordMemberRoles,
    "PRIVATE",
  ).queryKey;
  const foreignSnapshot = onePage({ ...privateGroup, id: id(900), name: "Foreign private group" });
  client.setQueryData(foreignKey, foreignSnapshot);

  let allowed: RefreshKind | undefined;
  const reads: string[] = [];
  const unexpected: string[] = [];
  const updated = {
    groups: pages(
      {
        ...privateGroup,
        name: "Updated private group",
        approved: { name: "Updated private group" },
        version: 2,
      },
      secondGroup,
    ),
    events: pages({ ...scheduled, name: "Updated scheduled event", version: 2 }, secondEvent),
    history: pages({ ...table, name: "Updated history table" }, secondTable),
    community: pages({ ...activity, context: "Updated activity table" }, secondActivity),
  };
  return {
    keys,
    snapshots,
    foreignKey,
    foreignSnapshot,
    reads,
    unexpected,
    // Only an explicit test-initiated refresh may cross this synthetic HTTP port.
    read(url: URL) {
      const paths = {
        groups: "/api/groups",
        events: "/api/events",
        history: "/api/tables",
        community: "/api/community/activities",
      };
      if (!allowed || url.pathname !== paths[allowed]) {
        unexpected.push(`${url.pathname}${url.search}`);
        throw new Error(`Unexpected cached-owner read: ${url.pathname}${url.search}`);
      }
      const cursor = url.searchParams.get("cursor");
      if (cursor !== null && cursor !== "retained") throw new Error("Unexpected retained cursor");
      if (
        allowed === "groups" &&
        (url.searchParams.get("scope") !== "mine" ||
          url.searchParams.get("type") !== "PRIVATE" ||
          url.searchParams.get("roles") !== groupRecordMemberRoles.join(","))
      )
        throw new Error("Group refresh escaped its authorized source filters");
      if (
        allowed === "events" &&
        (url.searchParams.get("section") !== "mine" ||
          url.searchParams.get("statuses") !== "CONFIRMED,PLANNING")
      )
        throw new Error("Event refresh escaped Scheduled");
      if (allowed === "history" && url.searchParams.get("statuses") !== "TERMINATED")
        throw new Error("History refresh escaped finished tables");
      if (allowed === "community" && url.searchParams.get("network") !== "all")
        throw new Error("Community refresh escaped its network");
      reads.push(`${allowed}:${cursor ?? "first"}`);
      return updated[allowed].pages[cursor ? 1 : 0];
    },
    async refresh(kind: RefreshKind) {
      allowed = kind;
      try {
        await client.refetchQueries({ queryKey: keys[kind], exact: true });
      } finally {
        allowed = undefined;
      }
    },
  };
}
