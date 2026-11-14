import {
  type EventRecord,
  notificationItemId,
  type TableRecord,
} from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import {
  attentionMatches,
  attentionReference,
  emptyAttentionSummary,
  readReference,
  subtractAttention,
} from "../notificationAttention";
import {
  notificationDestination,
  notificationWebHref,
  shouldReadOnNotificationOpen,
} from "../notificationDestination";
import {
  eventItemTargets,
  eventNotificationItems,
  removedNotificationItems,
  tableItemTargets,
} from "../notificationItemChanges";
import { projectNotificationItemRead } from "../notificationItemRead";

const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const event: EventRecord = {
  id,
  groupId: other,
  adminUserId: "owner",
  name: "Evening games",
  timeZone: "Europe/Rome",
  startTime: "18:00",
  dates: [{ id, day: "2027-01-03" }],
  locations: [{ id, name: "Club Roma", address: "Via Roma 1", latitude: 41.9, longitude: 12.5 }],
  status: "PLANNING",
  version: 1,
  planningGeneration: 1,
  nextPriority: 0,
  nextTableOrder: 1,
  createdAt: "2027-01-01T00:00:00.000Z",
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const table: TableRecord = {
  id: other,
  eventId: id,
  name: "First table",
  order: 0,
  minPlayers: 2,
  maxPlayers: 4,
  games: [{ gameId: 1, durationMinutes: 60 }],
  rankingEnabled: false,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
};
it("preserves routing ancestry but never attributes event points to child Tables or parents", () => {
  const point = notificationItemId(id, "date", other),
    section = notificationItemId(id, "dates");
  const target = { kind: "event" as const, id },
    tableTarget = { kind: "table" as const, id: other };
  const source = { target, eventId: id, tableIds: [other] };
  const note = {
    kind: "event_updated" as const,
    href: `/events/${id}`,
    attention: source,
    attentionItems: [
      { id: point, revision: 2, readAt: null, sectionId: section },
      { id: section, revision: 1, readAt: null },
      { id: "already-read", revision: 1, readAt: event.createdAt },
    ],
  };
  const reference = attentionReference(note);
  expect(reference?.itemIds).toEqual([point, section]);
  expect(attentionMatches(reference, { kind: "item", id: point })).toBe(true);
  expect(attentionMatches(reference, { kind: "item", id: "absent" })).toBe(false);
  expect(
    attentionMatches({ target: { kind: "item", id: point } }, { kind: "item", id: point }),
  ).toBe(true);
  expect(attentionMatches(reference, tableTarget)).toBe(false);
  expect(attentionMatches(reference, tableTarget, true)).toBe(false);
  expect(subtractAttention({ ...emptyAttentionSummary(), tables: 2 }, source, 1).tables).toBe(2);
  expect(
    readReference({
      target,
      count: 1,
      direct: 1,
      events: 1,
      tableIds: [other],
      sections: emptyAttentionSummary().sections,
    }).tableIds,
  ).toEqual([other]);
  expect(shouldReadOnNotificationOpen(note)).toBe(false);
  expect(shouldReadOnNotificationOpen({ href: `/groups/${id}`, kind: "group_invitation" })).toBe(
    false,
  );
  expect(
    shouldReadOnNotificationOpen({
      href: `/events/${id}/tables/${other}`,
      kind: "table_invitation",
    }),
  ).toBe(false);
  expect(shouldReadOnNotificationOpen({ href: `/events/${id}`, kind: "event_confirmed" })).toBe(
    false,
  );
  expect(
    shouldReadOnNotificationOpen({
      href: "/contacts",
      kind: "friend_request",
      attention: { target: { kind: "contact", id: "friend" }, section: "requests" },
    }),
  ).toBe(true);
  expect(
    shouldReadOnNotificationOpen({
      href: "/contacts",
      kind: "follow",
      attention: { target: { kind: "contacts", id: "connections" } },
    }),
  ).toBe(true);
  expect(shouldReadOnNotificationOpen({ href: "/retired", kind: "match_created" })).toBe(true);
});
it("clears older cached section children only, preserving newer snapshots and unrelated namespaces", () => {
  for (const [field, sectionField] of [
    ["date", "dates"],
    ["location", "locations"],
    ["game", "games"],
  ] as const) {
    const child = {
        kind: "item" as const,
        id: notificationItemId(id, field, field === "game" ? 1 : other),
      },
      parent = { kind: "item" as const, id: notificationItemId(id, sectionField) };
    const row = {
      target: parent,
      count: 1,
      direct: 1,
      events: 0,
      sections: emptyAttentionSummary().sections,
      readEffect: { unread: 1, summary: emptyAttentionSummary(), targets: [] },
    };
    const data = {
      asOf: event.createdAt,
      unreadCount: 1,
      summary: emptyAttentionSummary(),
      targets: [
        { ...row, target: child },
        {
          ...row,
          target: { ...child, id: notificationItemId(other, field, field === "game" ? 1 : other) },
        },
        { ...row, target: { ...child, id: "bad" } },
      ],
    };
    const result = projectNotificationItemRead(
      data,
      ["notification-attention"],
      row,
      event.createdAt,
      event.createdAt,
    ) as typeof data;
    expect(result.targets.map((entry) => entry.count)).toEqual([0, 1, 1]);
    expect(
      (
        projectNotificationItemRead(
          { ...data, asOf: "2028-01-01T00:00:00.000Z" },
          ["notification-attention"],
          row,
          event.createdAt,
          event.createdAt,
        ) as typeof data
      ).targets[0].count,
    ).toBe(1);
    expect(
      (
        projectNotificationItemRead(
          data,
          ["notification-attention"],
          { ...row, target: child },
          event.createdAt,
          event.createdAt,
        ) as typeof data
      ).targets[0].count,
    ).toBe(1);
    const inbox = {
      pages: [{ unreadCount: 1, notifications: [{ createdAt: event.createdAt, readAt: null }] }],
    };
    expect(
      (
        projectNotificationItemRead(
          inbox,
          ["notifications"],
          row,
          event.createdAt,
          event.createdAt,
        ) as typeof inbox
      ).pages[0].unreadCount,
    ).toBe(0);
  }
});
it("detects exact changed points, ignores epochs and preserves canonical resource identities", () => {
  expect(eventNotificationItems(event, { ...event, version: 2 }, [table], [table])).toEqual([]);
  const after = {
    ...event,
    version: 2,
    dates: [{ id: other, day: "2027-01-04" }],
    locations: [{ ...event.locations[0], id: other }],
    name: "New evening",
    endsAt: "2027-01-04T20:00:00.000Z",
  };
  const changed = { ...table, games: [{ gameId: 2, durationMinutes: 90 }], maxPlayers: 5 };
  const items = eventNotificationItems(event, after, [table], [changed]);
  expect(items.map((row) => row.id).sort()).toEqual(
    [
      notificationItemId(id, "date", other),
      notificationItemId(id, "dates"),
      notificationItemId(id, "location", other),
      notificationItemId(id, "locations"),
      notificationItemId(other, "game", 2),
      notificationItemId(other, "games"),
      notificationItemId(other, "overview", undefined, "table"),
      notificationItemId(id, "overview"),
    ].sort(),
  );
  expect(
    items.every(
      (row) =>
        row.eventId === id &&
        row.groupId === other &&
        row.revision === 2 &&
        row.tableIds?.[0] === other,
    ),
  ).toBe(true);
  expect(
    removedNotificationItems(event, after, [table], [changed]).map((row) => [row.from, row.to.id]),
  ).toEqual([
    [notificationItemId(id, "date", id), notificationItemId(id, "dates")],
    [notificationItemId(id, "location", id), notificationItemId(id, "locations")],
    [notificationItemId(other, "game", 1), notificationItemId(other, "games")],
  ]);
  expect(removedNotificationItems(event, event, [table], [table])).toEqual([]);
  expect(eventItemTargets(event).every((row) => row.kind === "item")).toBe(true);
  expect(tableItemTargets(table).map((row) => row.id)).toContain(
    notificationItemId(other, "game", 1),
  );
});
it("covers existing option changes, new/removed tables and standalone changes without inventing a Group", () => {
  const next = {
    ...event,
    groupId: null,
    version: 3,
    timeZone: "UTC",
    startTime: "19:00",
    locations: [
      {
        ...event.locations[0],
        name: "Other club",
        address: "Other road",
        latitude: 42,
        longitude: 13,
        timeZone: "UTC",
      },
    ],
  };
  expect(eventNotificationItems(event, next, [table], [table]).map((row) => row.id)).toEqual([
    notificationItemId(id, "date", id),
    notificationItemId(id, "location", id),
  ]);
  expect(
    eventNotificationItems(event, next, [], [table]).every((row) => row.groupId === undefined),
  ).toBe(true);
  expect(eventNotificationItems(event, event, [table], []).map((row) => row.id)).toEqual([
    notificationItemId(id, "tables"),
  ]);
  expect(removedNotificationItems(event, event, [table], []).map((row) => row.to.id)).toEqual(
    Array(3).fill(notificationItemId(id, "tables")),
  );
  for (const patch of [{ durationMinutes: 90 }, { durationMinutes: undefined }])
    expect(
      eventNotificationItems(
        event,
        event,
        [table],
        [{ ...table, games: [{ ...table.games[0], ...patch }] }],
      ).map((row) => row.id),
    ).toEqual([notificationItemId(other, "game", 1)]);
  for (const patch of [
    { name: "Changed" },
    { minPlayers: 3 },
    { startsAt: "2027-01-03T19:00:00Z" },
    { demonstratorUserId: "demo" },
    { rankingEnabled: true },
  ])
    expect(
      eventNotificationItems(event, event, [table], [{ ...table, ...patch }]).map((row) => row.id),
    ).toEqual([notificationItemId(other, "overview", undefined, "table")]);
  for (const patch of [{ name: "New title" }, { bookingClosesAt: "2027-01-02T19:00:00Z" }])
    expect(
      eventNotificationItems(event, { ...event, ...patch }, [table], [table]).map((row) => row.id),
    ).toEqual([notificationItemId(id, "overview")]);
});
it("links to the exact authorized point, retaining historical and explicitly excluded fallback destinations", () => {
  const point = notificationItemId(other, "game", 1);
  const notification = {
    href: `/events/${id}`,
    kind: "event_updated" as const,
    attentionItems: [{ id: point, revision: 2, readAt: null }],
  };
  expect(notificationDestination(notification)).toEqual({
    href: `/events/${id}/tables/${other}`,
    itemId: point,
  });
  expect(notificationWebHref(notification)).toContain(`#attention-${encodeURIComponent(point)}`);
  expect(
    notificationDestination({
      ...notification,
      attentionItems: [{ id: notificationItemId(id, "date", other), revision: 2, readAt: null }],
    }).href,
  ).toBe(`/events/${id}`);
  expect(notificationWebHref({ ...notification, attention: null })).toBe(notification.href);
  expect(notificationWebHref({ ...notification, attentionItems: [] })).toBe(notification.href);
  expect(
    notificationWebHref({
      ...notification,
      attentionItems: [{ id: "bad", revision: 1, readAt: null }],
    }),
  ).toBe(notification.href);
  expect(
    notificationDestination({
      href: `/groups/${id}`,
      kind: "group_invitation",
      attentionItems: [{ id: notificationItemId(id, "invitation"), revision: 1, readAt: null }],
    }).href,
  ).toBe(`/groups/${id}`);
});
it("projects only source-authoritative item effects, leaves unrelated and newer inbox points intact", () => {
  const target = { kind: "item" as const, id: notificationItemId(id, "date", other) },
    section = notificationItemId(id, "dates"),
    summary = { ...emptyAttentionSummary(), tables: 1, events: 1, groups: 1 };
  const row = {
    target,
    count: 1,
    direct: 1,
    events: 0,
    sections: summary.sections,
    readEffect: {
      unread: 0,
      summary: emptyAttentionSummary(),
      targets: [{ target, count: 1, direct: 1, events: 0 }],
    },
  };
  const data = {
    unreadCount: 1,
    summary,
    asOf: event.createdAt,
    targets: [row, { ...row, target: { kind: "event" as const, id } }],
  };
  expect(
    projectNotificationItemRead(undefined, [], row, event.createdAt, event.createdAt),
  ).toBeUndefined();
  expect(
    projectNotificationItemRead(
      data,
      [],
      { ...row, readEffect: undefined },
      event.createdAt,
      event.createdAt,
    ),
  ).toBe(data);
  const projected = projectNotificationItemRead(
    data,
    ["notification-attention"],
    row,
    event.createdAt,
    event.createdAt,
  ) as typeof data;
  expect(projected.targets.map((value) => value.count)).toEqual([0, 1]);
  expect(projected.summary.events).toBe(1);
  const note = {
    id: "1",
    kind: "event_updated",
    href: `/events/${id}`,
    title: "Updated",
    description: "Updated",
    readAt: null,
    createdAt: event.createdAt,
    attentionItems: [
      { id: target.id, sectionId: section, revision: 1, readAt: null },
      { id: notificationItemId(id, "location", other), revision: 1, readAt: null },
    ],
  };
  const inbox = {
    pages: [
      {
        unreadCount: 1,
        notifications: [
          note,
          { ...note, id: "new", createdAt: "2028-01-01T00:00:00.000Z" },
          { ...note, id: "read", readAt: event.createdAt },
        ],
        nextCursor: null,
        attention: summary,
      },
    ],
    pageParams: [],
  };
  const partial = projectNotificationItemRead(
    inbox,
    ["notifications"],
    row,
    event.createdAt,
    event.createdAt,
  ) as typeof inbox;
  expect(partial.pages[0].notifications[0].attentionItems[0].readAt).toBe(event.createdAt);
  expect(partial.pages[0].notifications[0].readAt).toBeNull();
  expect(partial.pages[0].notifications[1]).toBe(inbox.pages[0].notifications[1]);
  const last = {
    ...row,
    readEffect: {
      unread: 1,
      summary,
      targets: [{ target: { kind: "event" as const, id }, count: 1, direct: 0, events: 0 }],
    },
  };
  const single = {
    ...inbox,
    pages: [
      { ...inbox.pages[0], notifications: [{ ...note, attentionItems: [note.attentionItems[0]] }] },
    ],
  };
  expect(
    (
      projectNotificationItemRead(
        single,
        ["notifications"],
        last,
        event.createdAt,
        event.createdAt,
      ) as typeof single
    ).pages[0].unreadCount,
  ).toBe(0);
  expect(
    (
      projectNotificationItemRead(
        single,
        ["notifications"],
        last,
        event.createdAt,
        event.createdAt,
      ) as typeof single
    ).pages[0].notifications[0].readAt,
  ).toBe(event.createdAt);
  const sectionRow = { ...row, target: { kind: "item" as const, id: section } };
  expect(
    (
      projectNotificationItemRead(
        single,
        ["notifications"],
        sectionRow,
        event.createdAt,
        event.createdAt,
      ) as typeof single
    ).pages[0].notifications[0].readAt,
  ).toBe(event.createdAt);
});
