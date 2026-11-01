import type {
  NotificationAttentionCount,
  NotificationAttentionReference,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  attentionKey,
  attentionMatches,
  attentionReference,
  emptyAttentionSummary,
  projectAttentionSnapshot,
  readReference,
  subtractAttention,
} from "../notificationAttention";

const eventId = "11111111-1111-4111-8111-111111111111",
  groupId = "22222222-2222-4222-8222-222222222222",
  tableId = "33333333-3333-4333-8333-333333333333";
const target = (kind: "table" | "event" | "group", id: string): NotificationAttentionTarget => ({
  kind,
  id,
});
const table: NotificationAttentionReference = {
  target: target("table", tableId),
  eventId,
  groupId,
};
function row(target: NotificationAttentionTarget, direct = 2): NotificationAttentionCount {
  return {
    target,
    count: 8,
    direct,
    events: 5,
    sections: { connections: 2, requests: 3, search: 1 },
    eventId,
    groupId,
  };
}
function snapshot(): NotificationAttentionSnapshot {
  return {
    asOf: "2027-01-01T00:00:00.000Z",
    unreadCount: 12,
    summary: {
      tables: 4,
      events: 7,
      groups: 9,
      contacts: 6,
      sections: { connections: 2, requests: 3, search: 1 },
    },
    targets: [
      row(target("table", tableId)),
      row(target("event", eventId)),
      row(target("group", groupId)),
      row({ kind: "contact", id: "friend" }),
      row({ kind: "contacts", id: "requests" }),
    ],
  };
}

describe("notification attention ownership and hierarchy", () => {
  it("uses explicit server references first and never guesses parents or actor IDs", () => {
    expect(attentionReference({ kind: "table_invitation", href: "/wrong", attention: table })).toBe(
      table,
    );
    expect(attentionReference({ kind: "friend_request", href: "/contacts" })).toBeUndefined();
    expect(
      attentionReference({ kind: "event_confirmed", href: `/events/${eventId}`, attention: null }),
    ).toBeUndefined();
    for (const kind of ["friend_request_accepted", "follow"] as const)
      expect(
        attentionReference({
          kind,
          href: "/contacts",
          attention: { target: { kind: "contact", id: "friend" }, section: "connections" },
        })?.section,
      ).toBe("connections");
    expect(
      attentionReference({
        kind: "table_invitation",
        href: `/events/${eventId}/tables/${tableId}`,
      }),
    ).toEqual({ target: target("table", tableId), eventId });
    expect(attentionReference({ kind: "event_confirmed", href: `/events/${eventId}` })).toEqual({
      target: target("event", eventId),
      eventId,
    });
    for (const path of ["groups", "moderation"])
      expect(
        attentionReference({ kind: "group_review_requested", href: `/${path}/${groupId}` }),
      ).toEqual({ target: target("group", groupId), groupId });
    for (const href of [
      "/groups",
      "/events",
      `/events/${eventId}/tables/${tableId}?other=1`,
      "https://foreign/events/1",
    ])
      expect(attentionReference({ kind: "group_invitation", href })).toBeUndefined();
    for (const href of [
      `/groups/${groupId}`,
      `/events/${eventId}`,
      `/events/${eventId}/tables/${tableId}`,
    ])
      expect(attentionReference({ kind: "organization_invitation", href })).toBeUndefined();
  });
  it("propagates once per ancestor but direct resource reads never consume descendants", () => {
    expect(attentionMatches(undefined, table.target)).toBe(false);
    expect(attentionMatches(table, table.target, true)).toBe(true);
    expect(attentionMatches(table, target("event", eventId))).toBe(true);
    expect(attentionMatches(table, target("group", groupId))).toBe(true);
    expect(attentionMatches(table, target("event", eventId), true)).toBe(false);
    expect(attentionMatches(table, target("group", eventId))).toBe(false);
    expect(
      attentionMatches(
        { target: { kind: "contact", id: "friend" }, section: "requests" },
        { kind: "contacts", id: "requests" },
        true,
      ),
    ).toBe(true);
    expect(attentionMatches(table, { kind: "contacts", id: "requests" })).toBe(false);
    const original = snapshot(),
      next = projectAttentionSnapshot(original, table, 2)!;
    expect(next.unreadCount).toBe(10);
    expect(next.summary).toEqual({ ...original.summary, tables: 2, events: 5, groups: 7 });
    expect(next.targets[0]).toMatchObject({ count: 6, direct: 0 });
    expect(next.targets[1]).toMatchObject({ count: 6, direct: 2 });
    expect(next.targets[2]).toMatchObject({ count: 6, direct: 2, events: 3 });
    expect(next.targets[3]).toBe(original.targets[3]);
    const ownGroup = projectAttentionSnapshot(original, readReference(original.targets[2]), 2)!;
    expect(ownGroup.targets[2]).toMatchObject({ count: 6, direct: 0, events: 5 });
    expect(ownGroup.targets[0]).toBe(original.targets[0]);
    expect(ownGroup.summary).toEqual({ ...original.summary, groups: 7 });
    const ownEvent = projectAttentionSnapshot(original, readReference(original.targets[1]), 2)!;
    expect(ownEvent.summary.tables).toBe(4);
    expect(ownEvent.targets[0].count).toBe(8);
    expect(original.unreadCount).toBe(12);
  });
  it("consumes only selected Contact subsection, including each known person's own slice", () => {
    const original = snapshot(),
      reference: NotificationAttentionReference = {
        target: { kind: "contacts", id: "requests" },
        section: "requests",
      };
    const next = projectAttentionSnapshot(original, reference, 3)!;
    expect(next.summary.contacts).toBe(3);
    expect(next.summary.sections).toEqual({ connections: 2, requests: 0, search: 1 });
    expect(next.targets[3]).toMatchObject({
      count: 5,
      direct: 0,
      sections: { connections: 2, requests: 0, search: 1 },
    });
    expect(next.targets[4]).toMatchObject({ count: 5, direct: 0, sections: { requests: 0 } });
    expect(next.targets[0]).toBe(original.targets[0]);
    expect(
      projectAttentionSnapshot(
        original,
        { target: { kind: "contact", id: "friend" }, section: "connections" },
        1,
      )!.targets[3],
    ).toMatchObject({ count: 7, direct: 1, sections: { connections: 1, requests: 3 } });
    expect(
      projectAttentionSnapshot(
        original,
        { target: { kind: "contact", id: "friend" }, section: "requests" },
        1,
      )!.targets[4],
    ).toMatchObject({ count: 7, direct: 1, sections: { requests: 2 } });
    expect(
      subtractAttention(original.summary, { target: { kind: "contacts", id: "search" } }, 1)
        .sections.search,
    ).toBe(0);
    expect(
      subtractAttention(original.summary, { target: { kind: "contact", id: "friend" } }, 1)
        .contacts,
    ).toBe(5);
  });
  it("preserves missing/unknown data, clamps zeros, and bulk removal clears every hierarchy", () => {
    expect(projectAttentionSnapshot(undefined, table, 1)).toBeUndefined();
    const original = snapshot(),
      unknown = projectAttentionSnapshot(original, undefined, 10)!;
    expect(unknown.summary).toBe(original.summary);
    expect(unknown.targets[0]).toBe(original.targets[0]);
    expect(unknown.unreadCount).toBe(2);
    expect(projectAttentionSnapshot(original, table, 99)!.unreadCount).toBe(0);
    const cleared = projectAttentionSnapshot(original, undefined, 0, true)!;
    expect(cleared.summary).toEqual(emptyAttentionSummary());
    expect(cleared.unreadCount).toBe(0);
    expect(
      cleared.targets.every(
        (value) => value.count === 0 && value.direct === 0 && value.events === 0,
      ),
    ).toBe(true);
  });
  it("builds direct-read references by actual target kind, never child metadata on containers", () => {
    expect(readReference(row(target("group", groupId)))).toEqual({
      target: target("group", groupId),
      groupId,
      eventId: undefined,
      section: undefined,
    });
    expect(readReference(row(target("event", eventId)))).toEqual({
      target: target("event", eventId),
      groupId,
      eventId,
      section: undefined,
    });
    expect(readReference(row(target("table", tableId)))).toEqual(table);
    expect(readReference(row({ kind: "contact", id: "friend" }))).toMatchObject({
      eventId: undefined,
      groupId: undefined,
    });
    expect(
      readReference({ ...row({ kind: "contact", id: "friend" }), section: "connections" }).section,
    ).toBe("connections");
    expect(readReference(row({ kind: "contacts", id: "requests" })).section).toBe("requests");
    expect(attentionKey(table.target)).toBe(`table:${tableId}`);
  });
});
