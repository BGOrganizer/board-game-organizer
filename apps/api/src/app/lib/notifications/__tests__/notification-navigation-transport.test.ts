import type {
  NotificationAttentionCount,
  NotificationAttentionSnapshot,
  NotificationChangesReceipt,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import { notificationAttentionSnapshotSchema } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { notificationNavigationReply } from "../notification-navigation-transport";
import {
  notificationAttentionCountSchema as installedCount,
  notificationAttentionReceiptSchema as installedReceipt,
  notificationAttentionReferenceSchema as installedReference,
  notificationAttentionSnapshotSchema as installedSnapshot,
} from "./fixtures/installed-notification-attention";

const id = "11111111-1111-4111-8111-111111111111";
const summary = {
  tables: 1,
  events: 2,
  groups: 0,
  contacts: 0,
  sections: { connections: 0, requests: 0, search: 0 },
};
const effect: NonNullable<NotificationAttentionCount["readEffect"]> = {
  unread: 3,
  summary,
  targets: [
    { target: { kind: "event-list", id: "mine" }, count: 1, direct: 1, events: 0 },
    { target: { kind: "event-list", id: "terminated" }, count: 2, direct: 0, events: 0 },
    { target: { kind: "table", id }, count: 1, direct: 1, events: 0 },
  ],
};
const row: NotificationAttentionCount = {
  target: { kind: "event-list", id: "terminated" },
  count: 2,
  direct: 0,
  events: 0,
  sections: summary.sections,
  tableIds: [id],
  historyTableIds: [id],
  containers: [{ kind: "table", id }],
  lists: [
    { kind: "event-list", id: "terminated" },
    { kind: "event-list", id: "mine" },
    { kind: "event-list", id },
  ],
  readEffect: effect,
};
const snapshot: NotificationAttentionSnapshot = {
  asOf: "2027-01-01T00:00:00.000Z",
  unreadCount: 3,
  summary,
  targets: [
    row,
    { target: { kind: "table", id }, count: 1, direct: 1, events: 0, sections: summary.sections },
  ],
};

it("projects the frozen installed strict snapshot without mutating source or counter ownership", () => {
  expect(installedSnapshot.safeParse(snapshot).success).toBe(false);
  expect(notificationAttentionSnapshotSchema.safeParse(snapshot).success).toBe(true);
  const before = structuredClone(snapshot);
  const result = notificationNavigationReply(snapshot);
  expect(installedSnapshot.parse(result)).toEqual(result);
  expect(result.summary).toEqual(summary);
  expect(result.targets[0]).toMatchObject({
    target: { kind: "event-list", id: "mine" },
    tableIds: [id],
    containers: row.containers,
    lists: [
      { kind: "event-list", id: "mine" },
      { kind: "event-list", id },
    ],
  });
  expect(result.targets[0]).not.toHaveProperty("historyTableIds");
  expect(result.targets[0].readEffect).toMatchObject({
    unread: 3,
    summary,
    targets: [
      { target: { kind: "event-list", id: "mine" }, count: 3, direct: 1, events: 0 },
      effect.targets[2],
    ],
  });
  expect(snapshot).toEqual(before);
});

it("keeps modern negotiated responses intact by identity", () => {
  expect(notificationNavigationReply(snapshot, "history")).toBe(snapshot);
});

it("projects both receipts, including server-generated effects and extended snapshot scopes", () => {
  const receipt = { updated: 2, snapshot };
  expect(
    installedReceipt.parse(notificationNavigationReply(receipt)).snapshot.targets[0].target,
  ).toEqual({ kind: "event-list", id: "mine" });
  const changes: NotificationChangesReceipt = {
    ...receipt,
    readReferences: [],
    tabCounts: { details: 1, members: 0, tables: 0, participants: 0 },
    effects: { ...effect, tabCounts: { details: 1, members: 0, tables: 0, participants: 0 } },
  };
  const result = notificationNavigationReply(changes);
  expect(installedSnapshot.parse(result.snapshot)).toEqual(result.snapshot);
  expect(
    installedCount.shape.readEffect.unwrap().parse({
      unread: result.effects.unread,
      summary: result.effects.summary,
      targets: result.effects.targets,
    }),
  ).toMatchObject({
    targets: [
      { target: { kind: "event-list", id: "mine" }, count: 3 },
      { target: { kind: "table", id } },
    ],
  });
  expect(result.readReferences).toEqual(changes.readReferences);
  expect(result.tabCounts).toEqual(changes.tabCounts);
  expect(result.effects.tabCounts).toEqual(changes.effects.tabCounts);
});

it("projects only inbox attention DTOs and preserves read/null/legacy rows and item identities", () => {
  const inbox: NotificationListResponse = {
    unreadCount: 3,
    nextCursor: null,
    attention: summary,
    notifications: [
      {
        target: row.target,
        lists: row.lists,
        tableIds: row.tableIds,
        historyTableIds: row.historyTableIds,
        containers: row.containers,
      },
      null,
      undefined,
    ].map((attention, index) => ({
      id: String(index),
      kind: "event_updated",
      title: "Event updated",
      description: "Changed",
      href: "/events/" + id,
      readAt: null,
      createdAt: snapshot.asOf,
      attention,
      attentionItems: [],
    })),
  };
  const result = notificationNavigationReply(inbox);
  expect(installedReference.parse(result.notifications[0].attention)).not.toHaveProperty(
    "historyTableIds",
  );
  expect(result.notifications[1].attention).toBeNull();
  expect(result.notifications[2].attention).toBeUndefined();
  expect(result.notifications[0].attentionItems).toEqual([]);
  expect(result.attention).toEqual(summary);
});
