import {
  type NotificationChangesReceipt,
  type NotificationDto,
  notificationItemId,
  type ReadNotificationChangesInput,
} from "@board-game-organizer/schemas";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { beginOptimisticOperation } from "../../common/optimisticOperation";
import { emptyAttentionSummary } from "../notificationAttention";
import { notificationFilters } from "../notificationAttentionCache";
import {
  notificationChangesReadEffect,
  reconcileNotificationChangesRead,
} from "../notificationChangeReconciliation";
import { projectNotificationItemRead } from "../notificationItemRead";

const id = "11111111-1111-4111-8111-111111111111",
  asOf = "2026-01-01T00:00:00.000Z",
  future = "2026-01-02T00:00:00.000Z";
const itemId = notificationItemId(id, "overview", undefined, "table");
const reference = {
  notificationId: "111111111111111111111111",
  itemId,
  revision: 1,
  effectiveAt: asOf,
};
const input: ReadNotificationChangesInput = {
  scope: { kind: "table", id, tab: "details" },
  through: asOf,
  references: [reference],
};
const tabs = { details: 0, members: 0, tables: 0, participants: 0 };
const target = { kind: "table" as const, id };
const attentionRow = {
  target,
  count: 1,
  direct: 1,
  events: 0,
  sections: { connections: 0, requests: 0, search: 0 },
};
const summary = { ...emptyAttentionSummary(), tables: 1 };
const receipt: NotificationChangesReceipt = {
  updated: 1,
  readReferences: [reference],
  snapshot: { asOf, unreadCount: 1, summary, targets: [attentionRow] },
  tabCounts: { ...tabs, participants: 1 },
  effects: {
    unread: 1,
    summary,
    targets: [{ target, count: 1, direct: 1, events: 0 }],
    tabCounts: { ...tabs, details: 1 },
  },
};
const note: NotificationDto = {
  id: reference.notificationId,
  kind: "event_updated",
  title: "Updated",
  description: "Updated",
  href: "/events/fixture",
  readAt: null,
  createdAt: asOf,
};
const key = ["notifications", "api", "user"];
const inbox = (notifications: NotificationDto[], attention = true) => ({
  pages: [
    {
      notifications,
      unreadCount: 2,
      nextCursor: null,
      ...(attention ? { attention: { ...summary, tables: 2 } } : {}),
    },
  ],
  pageParams: [undefined],
});
const reconcile = (data: unknown, k = key, r = receipt) =>
  reconcileNotificationChangesRead(data, k, r, input);

describe("notificationChangeReconciliation transaction-owned union effects", () => {
  it("derives one bounded union effect from same-time before/after aggregates", () => {
    const before = {
      snapshot: {
        ...receipt.snapshot,
        unreadCount: 3,
        targets: [
          { ...attentionRow, count: 3, direct: 2, events: 1 },
          { ...attentionRow, target: { kind: "event" as const, id } },
        ],
      },
      tabCounts: { ...tabs, details: 3 },
    };
    const after = {
      snapshot: { ...receipt.snapshot, unreadCount: 2, targets: [{ ...attentionRow, count: 2 }] },
      tabCounts: { ...tabs, details: 2 },
    };
    expect(notificationChangesReadEffect(before, after)).toMatchObject({
      unread: 1,
      tabCounts: { details: 1 },
      targets: [
        { target, count: 1, direct: 1, events: 1 },
        { target: { kind: "event", id }, count: 1, direct: 1, events: 0 },
      ],
    });
    expect(notificationChangesReadEffect(after, before).unread).toBe(0);
  });
  it("leaves absent/unowned/fresher changes caches alone and subtracts only the selected tab effect", () => {
    expect(reconcile(undefined)).toBeUndefined();
    const data = {
      pages: [
        {
          asOf,
          changes: [],
          nextCursor: null,
          tabCounts: { ...tabs, details: 3, participants: 0 },
        },
        { asOf: future, changes: [], nextCursor: null, tabCounts: { ...tabs, details: 7 } },
      ],
      pageParams: [undefined],
    };
    const own = ["notification-changes", "api", "user", "table", id];
    const result = reconcile(data, own) as typeof data;
    expect(result.pages[0].tabCounts).toEqual({ ...tabs, details: 2 });
    expect(result.pages[1].tabCounts.details).toBe(7);
    for (const k of [
      ["notification-changes", "api", "user", "event", id],
      ["notification-changes", "api", "user", "table", "other"],
    ])
      expect((reconcile(data, k) as typeof data).pages[0].tabCounts.details).toBe(3);
  });
  it("never replaces newer unrelated acknowledgements with stale absolute bell or target counts", () => {
    const unrelated = { ...attentionRow, target: { kind: "event" as const, id } };
    const data = { ...receipt.snapshot, unreadCount: 1, targets: [attentionRow, unrelated] };
    const result = reconcile(data, ["notification-attention"]) as typeof data;
    expect(result.unreadCount).toBe(0);
    expect(result.targets.map((r) => r.count)).toEqual([0, 1]);
    const newer = { ...data, asOf: future };
    expect(reconcile(newer, ["notification-attention"])).toBe(newer);
    const done = inbox([{ ...note, id: "222222222222222222222222", readAt: asOf }]);
    done.pages[0].unreadCount = 0;
    expect((reconcile(done) as typeof done).pages[0].unreadCount).toBe(0);
  });
  it("reconciles exact generic captures, preserving protected, already-read and unrelated rows", () => {
    const other = { ...note, id: "222222222222222222222222" };
    const data = inbox([note, other]);
    expect((reconcile(data) as typeof data).pages[0]).toMatchObject({
      unreadCount: 1,
      notifications: [{ readAt: asOf }, { readAt: null }],
    });
    for (const special of [
      { ...note, readAt: asOf },
      { ...note, requiresResponse: true },
      { ...note, createdAt: future },
    ]) {
      const result = reconcile(inbox([special])) as ReturnType<typeof inbox>;
      expect(result.pages[0].notifications[0]).toEqual(special);
    }
    const absentSummary = inbox([{ ...note, attentionItems: [] }], false);
    expect((reconcile(absentSummary) as typeof absentSummary).pages[0]).toMatchObject({
      unreadCount: 1,
      notifications: [{ readAt: asOf }],
    });
    const generic = {
      ...receipt,
      readReferences: [{ notificationId: note.id, effectiveAt: asOf }],
    };
    expect(
      (reconcile(inbox([note]), key, generic) as ReturnType<typeof inbox>).pages[0].unreadCount,
    ).toBe(1);
    expect(
      (reconcile(inbox([{ ...note, createdAt: future }]), key, generic) as ReturnType<typeof inbox>)
        .pages[0].unreadCount,
    ).toBe(2);
    const hiddenLater = inbox([{ ...other, createdAt: future }]);
    hiddenLater.pages[0].unreadCount = 3;
    expect((reconcile(hiddenLater) as typeof hiddenLater).pages[0].unreadCount).toBe(2);
  });
  it("does not sum point effects or erase revised/later/unread hidden structured points", () => {
    const points = [
      { id: itemId, revision: 1, readAt: null },
      { id: notificationItemId(id, "game", 1), revision: 1, readAt: null },
    ];
    const data = inbox([{ ...note, attentionItems: points }]);
    const partial = { ...receipt, effects: { ...receipt.effects, unread: 0 } };
    const p = reconcile(data, key, partial) as typeof data;
    expect(p.pages[0].unreadCount).toBe(2);
    expect(p.pages[0].notifications[0]).toMatchObject({
      readAt: null,
      attentionItems: [{ readAt: asOf }, { readAt: null }],
    });
    const complete = {
      ...receipt,
      readReferences: [reference, { ...reference, itemId: points[1].id }],
    };
    const done = reconcile(data, key, complete) as typeof data;
    expect(done.pages[0].unreadCount).toBe(1);
    expect(done.pages[0].notifications[0].readAt).toBe(asOf);
    for (const point of [
      { ...points[0], revision: 2 },
      { ...points[0], changedAt: future },
      { ...points[0], readAt: asOf },
    ]) {
      const current = inbox([{ ...note, attentionItems: [point] }]);
      const result = reconcile(current) as typeof current;
      expect(result.pages[0].notifications[0].attentionItems).toEqual([point]);
      expect(result.pages[0].unreadCount).toBe(2);
    }
    const unmatched = inbox([{ ...note, attentionItems: [points[1]] }]);
    expect((reconcile(unmatched) as typeof unmatched).pages[0].notifications[0].readAt).toBeNull();
  });
  it("reconciles each retained inbox page at its own freshness, without a later page suppressing the first-page bell effect", () => {
    const other = { ...note, id: "222222222222222222222222", readAt: asOf };
    const old = inbox([note]),
      fresh = inbox([other]);
    old.pages[0].unreadCount = 2;
    fresh.pages[0].unreadCount = 0;
    const data = { pages: [old.pages[0], fresh.pages[0]], pageParams: [undefined, "next"] };
    const refs = [
      { notificationId: note.id, effectiveAt: asOf },
      { notificationId: other.id, effectiveAt: asOf },
    ];
    const result = reconcile(data, key, {
      ...receipt,
      readReferences: refs,
      effects: { ...receipt.effects, unread: 2 },
    }) as typeof data;
    expect(result.pages.map((page) => page.unreadCount)).toEqual([0, 0]);
    expect(result.pages.every((page) => page.notifications.every((n) => n.readAt === asOf))).toBe(
      true,
    );
  });
  it("commutes a delayed Alert receipt with a disjoint invitation decision across inactive caches", async () => {
    const client = new QueryClient(),
      o = { apiUrl: "api", userId: "user", getToken: async () => "token" };
    const invitationId = notificationItemId(id, "invitation", undefined, "table");
    const b = {
      ...note,
      id: "222222222222222222222222",
      requiresResponse: true,
      kind: "table_invitation" as const,
      attentionItems: [{ id: invitationId, readAt: null }],
    };
    const initial = inbox([note, b]),
      changes = {
        pages: [
          {
            asOf,
            changes: [],
            nextCursor: null,
            tabCounts: { ...tabs, details: 1, participants: 1 },
          },
        ],
        pageParams: [undefined],
      };
    const ck = ["notification-changes", "api", "user", "table", id, "details"];
    for (const k of [key, [...key, "inactive"]]) client.setQueryData(k, initial);
    client.setQueryData(ck, changes);
    client.setQueryData(["notification-attention", "api", "user"], {
      ...receipt.snapshot,
      unreadCount: 2,
      summary: { ...summary, tables: 2 },
      targets: [{ ...attentionRow, count: 2, direct: 2 }],
    });
    const a = await beginOptimisticOperation(
      client,
      [...key, "changes-read"],
      notificationFilters(o),
      (d) => d,
      [[...key, "item", note.id]],
    );
    const decision = {
      ...attentionRow,
      target: { kind: "item" as const, id: invitationId },
      readEffect: { unread: 1, summary, targets: [{ target, count: 1, direct: 1, events: 0 }] },
    };
    const bOperation = await beginOptimisticOperation(
      client,
      ["groups", "api", "user", "decision"],
      notificationFilters(o),
      (d, k) => projectNotificationItemRead(d, k, decision, asOf, asOf, true),
      [[...key, "item", b.id]],
    );
    bOperation.commit();
    a.commit((d, k) => reconcileNotificationChangesRead(d, k, receipt, input));
    for (const k of [key, [...key, "inactive"]]) {
      const result = client.getQueryData<typeof initial>(k)!;
      expect(result.pages[0].unreadCount).toBe(0);
      expect(result.pages[0].notifications.every((n) => n.readAt === asOf)).toBe(true);
    }
    expect(client.getQueryData<typeof changes>(ck)!.pages[0].tabCounts).toEqual(tabs);
    expect(
      client.getQueryData<typeof receipt.snapshot>(["notification-attention", "api", "user"])!
        .unreadCount,
    ).toBe(0);
    client.clear();
  });
});
