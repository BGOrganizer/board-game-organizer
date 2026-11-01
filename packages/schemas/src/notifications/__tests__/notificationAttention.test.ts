import { describe, expect, it } from "vitest";
import {
  notificationAttentionQuerySchema,
  notificationAttentionReceiptSchema,
  notificationAttentionSnapshotSchema,
  notificationAttentionTargetSchema,
  readNotificationAttentionSchema,
} from "../dto/notificationAttention";

const id = "11111111-1111-4111-8111-111111111111",
  through = "2027-01-01T00:00:00.000Z";
describe("notification attention boundaries", () => {
  it("accepts only canonical resource IDs and existing Contact sections", () => {
    for (const kind of ["table", "event", "group"])
      expect(notificationAttentionTargetSchema.safeParse({ kind, id }).success).toBe(true);
    for (const section of ["connections", "requests", "search"])
      expect(
        notificationAttentionTargetSchema.safeParse({ kind: "contacts", id: section }).success,
      ).toBe(true);
    expect(
      notificationAttentionTargetSchema.safeParse({ kind: "contact", id: "user_friend" }).success,
    ).toBe(true);
    for (const target of [
      { kind: "table", id: "local-pending-id" },
      { kind: "contacts", id: "all" },
      { kind: "organization", id },
      { kind: "group", id, recipientUserId: "other" },
    ])
      expect(notificationAttentionTargetSchema.safeParse(target).success).toBe(false);
  });
  it("bounds and deduplicates query targets, validates JSON and retains only an optional bypass", () => {
    expect(notificationAttentionQuerySchema.parse({})).toEqual({ targets: [] });
    expect(
      notificationAttentionQuerySchema.safeParse({
        targets: JSON.stringify([{ kind: "table", id }]),
        "x-vercel-protection-bypass": "bypass",
      }).success,
    ).toBe(true);
    for (const targets of [
      "{",
      "null",
      "{}",
      JSON.stringify([
        { kind: "table", id },
        { kind: "table", id },
      ]),
      JSON.stringify(Array.from({ length: 51 }, (_, n) => ({ kind: "contact", id: `user_${n}` }))),
      "x".repeat(16001),
    ])
      expect(notificationAttentionQuerySchema.safeParse({ targets }).success).toBe(false);
    expect(
      notificationAttentionQuerySchema.safeParse({ targets: "[]", recipientUserId: "other" })
        .success,
    ).toBe(false);
  });
  it("pins direct reads to a timestamp and forbids a whole person's cross-section read", () => {
    for (const target of [
      { kind: "table", id },
      { kind: "event", id },
      { kind: "group", id },
      { kind: "contacts", id: "requests" },
    ])
      expect(readNotificationAttentionSchema.safeParse({ target, through }).success).toBe(true);
    for (const input of [
      { target: { kind: "contact", id: "user_friend" }, through },
      { target: { kind: "group", id } },
      { target: { kind: "group", id }, through: "yesterday" },
      { target: { kind: "group", id }, through, recipientUserId: "other" },
    ])
      expect(readNotificationAttentionSchema.safeParse(input).success).toBe(false);
  });
  it("requires complete finite nonnegative snapshots/receipts, not arbitrary partial success data", () => {
    const summary = {
      tables: 0,
      events: 0,
      groups: 0,
      contacts: 0,
      sections: { connections: 0, requests: 0, search: 0 },
    };
    const snapshot = {
      asOf: through,
      unreadCount: 0,
      summary,
      targets: [
        {
          target: { kind: "group", id },
          count: 0,
          direct: 0,
          events: 0,
          sections: summary.sections,
        },
      ],
    };
    expect(notificationAttentionSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    const signal = `${through}|000000000000000000000001`;
    expect(
      notificationAttentionSnapshotSchema.parse({
        ...snapshot,
        targets: [{ ...snapshot.targets[0], signal }],
      }).targets[0].signal,
    ).toBe(signal);
    for (const invalid of [through, "", `${through}|short`, "2027-01-01|000000000000000000000001"])
      expect(
        notificationAttentionSnapshotSchema.safeParse({
          ...snapshot,
          targets: [{ ...snapshot.targets[0], signal: invalid }],
        }).success,
      ).toBe(false);
    expect(notificationAttentionReceiptSchema.safeParse({ updated: 0, snapshot }).success).toBe(
      true,
    );
    expect(notificationAttentionReceiptSchema.safeParse({ updated: -1, snapshot }).success).toBe(
      false,
    );
    expect(
      notificationAttentionSnapshotSchema.safeParse({
        ...snapshot,
        unreadCount: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(
      notificationAttentionSnapshotSchema.safeParse({
        ...snapshot,
        summary: { ...summary, groups: -1 },
      }).success,
    ).toBe(false);
    expect(
      notificationAttentionSnapshotSchema.safeParse({ ...snapshot, summary: { tables: 0 } })
        .success,
    ).toBe(false);
    expect(notificationAttentionReceiptSchema.safeParse({ success: true }).success).toBe(false);
  });
});
