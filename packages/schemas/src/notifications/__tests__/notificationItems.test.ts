import { describe, expect, it } from "vitest";
import { changeEventVoteSchema } from "../../events/dto/eventRecords";
import {
  notificationAttentionTargetSchema,
  readNotificationAttentionSchema,
} from "../dto/notificationAttention";
import { notificationItemId, notificationItemIdSchema } from "../notificationItems";

const scope = "11111111-1111-4111-8111-111111111111",
  option = "22222222-2222-4222-8222-222222222222";
describe("precise notification item identity", () => {
  it.each(["date", "location"] as const)("requires a canonical %s option", (field) => {
    expect(
      notificationItemIdSchema.safeParse(notificationItemId(scope, field, option)).success,
    ).toBe(true);
    expect(notificationItemIdSchema.safeParse(notificationItemId(scope, field)).success).toBe(
      false,
    );
  });
  it("validates numeric games, section/invitation identities and the strict read boundary", () => {
    expect(notificationItemIdSchema.parse(notificationItemId(scope, "game", 1))).toBe(
      notificationItemId(scope, "game", "1"),
    );
    for (const value of [null, "", "0", "-1", "a", "9007199254740992"])
      expect(
        notificationItemIdSchema.safeParse(JSON.stringify(["table", scope, "game", value])).success,
      ).toBe(false);
    for (const field of [
      "invitation",
      "dates",
      "locations",
      "games",
      "overview",
      "tables",
    ] as const) {
      const id = notificationItemId(scope, field);
      expect(notificationAttentionTargetSchema.parse({ kind: "item", id })).toEqual({
        kind: "item",
        id,
      });
      expect(
        readNotificationAttentionSchema.safeParse({
          target: { kind: "item", id },
          through: "2027-01-01T00:00:00.000Z",
        }).success,
      ).toBe(true);
      expect(
        notificationItemIdSchema.safeParse(notificationItemId(scope, field, option)).success,
      ).toBe(false);
    }
    for (const value of [
      "not json",
      "null",
      "[]",
      JSON.stringify(["event", scope, "unknown", null]),
      JSON.stringify(["event", "bad", "dates", null]),
      "x".repeat(1001),
    ])
      expect(notificationItemIdSchema.safeParse(value).success).toBe(false);
    expect(
      readNotificationAttentionSchema.safeParse({
        target: { kind: "item", id: notificationItemId(scope, "dates") },
        through: "bad",
      }).success,
    ).toBe(false);
  });
  it("namespaces identities so coincident Group/Event/Table UUIDs can never acknowledge each other", () => {
    const group = notificationItemId(scope, "invitation"),
      table = notificationItemId(scope, "invitation", undefined, "table");
    expect(group).not.toBe(table);
    expect(notificationItemIdSchema.safeParse(table).success).toBe(true);
    expect(notificationItemId(scope, "overview")).not.toBe(
      notificationItemId(scope, "overview", undefined, "table"),
    );
    for (const [resource, field] of [
      ["group", "overview"],
      ["event", "game"],
      ["table", "date"],
      ["event", "invitation"],
    ])
      expect(
        notificationItemIdSchema.safeParse(JSON.stringify([resource, scope, field, null])).success,
      ).toBe(false);
  });
  it("admits an optional source cutoff only with a valid vote, retaining every original validation", () => {
    for (const kind of ["date", "location", "game"] as const) {
      const body =
        kind === "game"
          ? { kind, tableId: scope, gameId: 1, vote: "YES" }
          : { kind, optionId: option, vote: "NO" };
      expect(changeEventVoteSchema.safeParse(body).success).toBe(true);
      expect(
        changeEventVoteSchema.safeParse({ ...body, attentionThrough: "2027-01-01T00:00:00.000Z" })
          .success,
      ).toBe(true);
      expect(changeEventVoteSchema.safeParse({ ...body, attentionThrough: "bad" }).success).toBe(
        false,
      );
      expect(
        changeEventVoteSchema.safeParse({
          ...body,
          vote: "UNKNOWN",
          attentionThrough: "2027-01-01T00:00:00.000Z",
        }).success,
      ).toBe(false);
    }
  });
});
