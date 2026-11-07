import {
  type NotificationAttentionCount,
  type NotificationAttentionSnapshot,
  notificationItemId,
} from "@board-game-organizer/schemas";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import {
  attentionMatches,
  attentionReference,
  emptyAttentionSummary,
  projectAttentionSnapshot,
  readReference,
  subtractAttention,
} from "../notificationAttention";
import { notificationReadAliases, projectAttentionRead } from "../notificationAttentionCache";
import { notificationDestination, notificationWebHref } from "../notificationDestination";
import { projectNotificationItemRead } from "../notificationItemRead";

const groupId = "11111111-1111-4111-8111-111111111111",
  eventId = "22222222-2222-4222-8222-222222222222",
  tableId = "33333333-3333-4333-8333-333333333333";
const group = { kind: "group", id: groupId } as const,
  event = { kind: "event", id: eventId } as const,
  table = { kind: "table", id: tableId } as const;
const through = "2027-01-01T00:00:00.000Z",
  later = "2027-01-01T00:00:01.000Z";
const member = { kind: "item", id: notificationItemId(groupId, "member", "user_member") } as const;
const members = { kind: "item", id: notificationItemId(groupId, "members") } as const;
const summary = { ...emptyAttentionSummary(), groups: 1, tables: 1, events: 1 };
const row: NotificationAttentionCount = {
  target: member,
  count: 1,
  direct: 1,
  events: 0,
  signal: `${through}|source`,
  sections: summary.sections,
  readEffect: {
    unread: 1,
    summary: { ...emptyAttentionSummary(), groups: 1 },
    targets: [member, members, group].map((target) => ({
      target,
      count: 1,
      direct: target.kind === "item" ? 1 : 0,
      events: 0,
    })),
  },
};
const snapshot = (): NotificationAttentionSnapshot => ({
  asOf: through,
  unreadCount: 3,
  summary,
  targets: [member, members, group, event, table].map((target) => ({ ...row, target })),
});

it("matches only source-authorized tab scopes, never treating navigation as an entity or direct read", () => {
  const mine = { kind: "event-list", id: "mine" } as const;
  const available = { kind: "event-list", id: "available" } as const;
  const grouped = { kind: "event-list", id: groupId } as const;
  const privateGroups = { kind: "group-list", id: "PRIVATE" } as const;
  const reference = { target: event, containers: [event], lists: [mine, grouped] };
  expect(attentionMatches(reference, mine)).toBe(true);
  expect(attentionMatches(reference, mine, true)).toBe(false);
  expect(attentionMatches(reference, grouped)).toBe(true);
  expect(attentionMatches(reference, available)).toBe(false);
  expect(attentionMatches(reference, privateGroups)).toBe(false);
  expect(attentionMatches({ target: group }, privateGroups)).toBe(false);
  expect(attentionMatches({ target: event, eventId, groupId }, grouped)).toBe(false);
  const direct = { ...row, target: event, count: 2, direct: 1, lists: [mine, grouped] };
  expect(readReference(direct).lists).toEqual([mine, grouped]);
  const data = snapshot();
  data.targets.push(
    ...[mine, grouped, available, privateGroups].map((target) => ({
      ...row,
      target,
      count: 2,
      direct: 0,
    })),
  );
  const next = projectAttentionSnapshot(data, readReference(direct), 1)!;
  expect(next.targets.slice(-4).map((value) => [value.count, value.direct])).toEqual([
    [1, 0],
    [1, 0],
    [2, 0],
    [2, 0],
  ]);
  expect(next.summary.groups).toBe(1);
});

it("prunes tab attribution when its actual owner points are read, retaining unrelated owner scopes", () => {
  const mine = { kind: "event-list", id: "mine" } as const;
  const grouped = { kind: "event-list", id: groupId } as const;
  const groups = { kind: "group-list", id: "PUBLIC" } as const;
  const note = {
    kind: "event_updated" as const,
    href: `/events/${eventId}`,
    attention: { target: event, containers: [event, group, table], lists: [mine, grouped, groups] },
    attentionItems: [
      { id: notificationItemId(eventId, "overview"), revision: 1, readAt: through },
      {
        id: notificationItemId(groupId, "overview", undefined, "group"),
        revision: 1,
        readAt: null,
      },
      { id: notificationItemId(tableId, "game", 1), revision: 1, readAt: null },
    ],
  };
  expect(attentionReference(note)?.lists).toEqual([groups]);
  expect(attentionMatches(attentionReference(note), mine)).toBe(false);
  expect(attentionMatches(attentionReference(note), groups)).toBe(true);
  note.attentionItems[0].readAt = null;
  note.attentionItems[1].readAt = through;
  expect(attentionReference(note)?.lists).toEqual([mine, grouped]);
});

it("reading the last Event point clears its top tabs immediately while retaining Table/Group entity state", () => {
  const point = { kind: "item", id: notificationItemId(eventId, "overview") } as const;
  const mine = { kind: "event-list", id: "mine" } as const;
  const grouped = { kind: "event-list", id: groupId } as const;
  const privateGroups = { kind: "group-list", id: "PRIVATE" } as const;
  const source: NotificationAttentionCount = {
    ...row,
    target: point,
    readEffect: {
      unread: 0,
      summary: { ...emptyAttentionSummary(), events: 1 },
      targets: [point, event, mine, grouped].map((target) => ({
        target,
        count: 1,
        direct: target.kind === "item" ? 1 : 0,
        events: 0,
      })),
    },
  };
  const data = snapshot();
  data.targets = [
    source,
    ...[event, table, group, mine, grouped, privateGroups].map((target) => ({
      ...row,
      target,
      count: 1,
      direct: 0,
    })),
  ];
  const next = projectNotificationItemRead(
    data,
    ["notification-attention"],
    source,
    through,
    later,
  ) as NotificationAttentionSnapshot;
  expect(next.targets.map((value) => value.count)).toEqual([0, 0, 1, 1, 0, 0, 1]);
  expect(next.unreadCount).toBe(data.unreadCount);
  expect(next.summary).toEqual({ ...data.summary, events: 0 });
});

it("derives mixed notification ownership from unread canonical item IDs, never shared ancestry or old tableIds", () => {
  const reference = { target: event, eventId, groupId, tableIds: [tableId] };
  const note = {
    kind: "event_updated" as const,
    href: `/events/${eventId}`,
    attention: reference,
    attentionItems: [
      { id: notificationItemId(eventId, "overview"), revision: 1, readAt: null },
      { id: notificationItemId(tableId, "game", 1), revision: 1, readAt: null },
      { id: "malformed", revision: 1, readAt: null },
      { id: notificationItemId(tableId, "games"), revision: 1, readAt: null },
      {
        id: notificationItemId(groupId, "overview", undefined, "group"),
        revision: 1,
        readAt: through,
      },
    ],
  };
  const owned = attentionReference(note)!;
  expect(owned.containers).toEqual([event, table]);
  expect(attentionMatches(owned, group)).toBe(false);
  expect(attentionMatches(owned, event)).toBe(true);
  expect(attentionMatches(owned, table, true)).toBe(true);
  expect(subtractAttention(summary, owned, 1)).toEqual({ ...summary, tables: 0, events: 0 });
  const complete = snapshot();
  complete.summary = { ...summary, tables: 2, events: 2 };
  complete.unreadCount = 4;
  for (const value of complete.targets.filter(
    (row) => row.target.kind === "event" || row.target.kind === "table",
  ))
    value.count = 2;
  const read = projectAttentionSnapshot(complete, owned, 1)!;
  expect(
    read.targets
      .filter((row) => row.target.kind === "event" || row.target.kind === "table")
      .map((row) => [row.count, row.direct]),
  ).toEqual([
    [1, 1],
    [1, 1],
  ]);
  const tableOnly = attentionReference({ ...note, attentionItems: note.attentionItems.slice(1) })!;
  expect(tableOnly.containers).toEqual([table]);
  expect(attentionMatches(tableOnly, event)).toBe(false);
  // Even a syntactically valid foreign scope is not authority supplied by this notification.
  expect(
    attentionReference({ ...note, attention: { ...reference, containers: [event] } })?.containers,
  ).toEqual([event]);
});

it("retains actual Group item ownership without Event/Table ancestry and projects whole-notice reads to its own item", () => {
  const note = {
    kind: "group_membership_updated" as const,
    href: `/groups/${groupId}`,
    attention: { target: group, groupId },
    attentionItems: [{ id: member.id, revision: 2, readAt: null }],
  };
  const reference = attentionReference(note)!;
  expect(reference.containers).toEqual([group]);
  expect(readReference({ ...row, containers: [group] }).containers).toEqual([group]);
  const data = snapshot();
  data.targets[2].count = 2;
  data.summary = { ...summary, groups: 2 };
  data.unreadCount = 4;
  const next = projectAttentionSnapshot(data, reference, 1)!;
  expect(next.targets[0].direct).toBe(0);
  expect(next.targets[2]).toMatchObject({ count: 1, direct: 1 });
  expect(next.targets.find((value) => value.target.kind === "event")?.count).toBe(1);
});
it("routes real and source-derived historical member points to Members, not Overview", () => {
  const note = {
    kind: "group_membership_updated" as const,
    href: `/groups/${groupId}`,
    attention: { target: group, groupId, containers: [group], itemIds: [member.id, members.id] },
  };
  expect(notificationDestination(note)).toEqual({
    href: note.href,
    itemId: member.id,
    section: "members",
  });
  expect(notificationWebHref(note)).toBe(
    `${note.href}?tab=members&attention=${encodeURIComponent(member.id)}#attention-${encodeURIComponent(member.id)}`,
  );
});

it("clears member, section, own Group and navigation immediately, leaving Event/Table points intact", () => {
  const data = snapshot();
  const next = projectNotificationItemRead(
    data,
    ["notification-attention"],
    row,
    through,
    later,
  ) as NotificationAttentionSnapshot;
  expect(next.targets.map((value) => value.count)).toEqual([0, 0, 0, 1, 1]);
  expect(next.unreadCount).toBe(2);
  expect(next.summary).toEqual({ ...summary, groups: 0 });
  const inbox = {
    pages: [
      {
        unreadCount: 3,
        notifications: [
          {
            createdAt: through,
            readAt: null,
            attention: { target: group, itemIds: [member.id, members.id] },
          },
        ],
      },
    ],
    pageParams: [undefined],
  };
  const changed = projectNotificationItemRead(
    inbox,
    ["notifications"],
    row,
    through,
    later,
  ) as typeof inbox;
  expect(changed.pages[0].notifications[0].readAt).toBe(later);
  expect(changed.pageParams).toBe(inbox.pageParams);
  const sectionRead = { ...row, target: members };
  expect(
    (
      projectNotificationItemRead(
        data,
        ["notification-attention"],
        sectionRead,
        through,
        later,
      ) as NotificationAttentionSnapshot
    ).targets[0].count,
  ).toBe(0);
});

it("generic entry reads never consume structured, source-derived or pending invitation notifications", () => {
  const base = {
    id: "generic",
    kind: "group_membership_updated" as const,
    href: `/groups/${groupId}`,
    title: "Fixture",
    description: "Fixture",
    createdAt: through,
    readAt: null,
    attention: { target: group },
  };
  const data = {
    pages: [
      {
        unreadCount: 5,
        notifications: [
          base,
          {
            ...base,
            id: "structured",
            attentionItems: [{ id: member.id, revision: 1, readAt: null }],
          },
          { ...base, id: "derived", attention: { target: group, itemIds: [member.id] } },
          { ...base, id: "group-invitation", kind: "group_invitation" },
          {
            ...base,
            id: "table-invitation",
            kind: "table_invitation",
            attention: { target: table },
          },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [undefined],
  };
  const next = projectAttentionRead(
    data,
    ["notifications"],
    { target: group },
    1,
    through,
    later,
  ) as typeof data;
  expect(next.pages[0].notifications.map((row) => row.readAt)).toEqual([
    later,
    null,
    null,
    null,
    null,
  ]);
  expect(next.pages[0].unreadCount).toBe(4);
  const client = new QueryClient(),
    options = { apiUrl: "https://api.test", userId: "owner" };
  try {
    client
      .getQueryCache()
      .build(client, { queryKey: ["notifications", options.apiUrl, options.userId, "empty"] });
    client.setQueryData(["notifications", options.apiUrl, options.userId, "en"], {
      ...data,
      pages: [
        {
          ...data.pages[0],
          notifications: [
            ...data.pages[0].notifications,
            { ...base, id: "read", readAt: through },
            { ...base, id: "later", createdAt: later },
            { ...base, id: "other", attention: { target: event } },
          ],
        },
      ],
    });
    client.setQueryData(["notifications", options.apiUrl, "other", "en"], data);
    expect(notificationReadAliases(client, options, group, through).map((key) => key[4])).toEqual([
      "generic",
    ]);
    expect(notificationReadAliases(client, options, member, through).map((key) => key[4])).toEqual([
      "structured",
      "derived",
    ]);
  } finally {
    client.clear();
  }
});
it("preserves a newer revision of the same point, including retargeted items on an older notification", () => {
  const data = snapshot();
  data.asOf = later;
  data.targets[0].signal = `${later}|source`;
  expect(projectNotificationItemRead(data, ["notification-attention"], row, through, later)).toBe(
    data,
  );
  const inbox = {
    pages: [
      {
        unreadCount: 1,
        notifications: [
          {
            createdAt: through,
            readAt: null,
            attentionItems: [{ id: member.id, revision: 1, readAt: null, changedAt: later }],
          },
        ],
      },
    ],
  };
  const next = projectNotificationItemRead(
    inbox,
    ["notifications"],
    row,
    through,
    later,
  ) as typeof inbox;
  expect(next.pages[0].notifications[0]).toBe(inbox.pages[0].notifications[0]);
  expect(next.pages[0].unreadCount).toBe(1);
});
