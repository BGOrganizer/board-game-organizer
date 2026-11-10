import { describe, expect, it } from "vitest";
import { changeEventVoteSchema } from "../../events/dto/eventRecords";
import {
  notificationChangesPageSchema,
  notificationChangesQuerySchema,
  readNotificationChangesSchema,
} from "../dto/notificationChanges";

const scope = { kind: "table", id: "11111111-1111-4111-8111-111111111111", tab: "participants" };
const reference = {
  notificationId: "111111111111111111111111",
  effectiveAt: "2026-01-01T00:00:00.000Z",
};
describe("notificationChanges DTOs", () => {
  it("bounds source pages, captures exact stable cursors and supports counts-only tabs", () => {
    expect(notificationChangesQuerySchema.parse(scope).limit).toBe(8);
    expect(notificationChangesQuerySchema.parse({ ...scope, tab: "none", limit: "50" }).tab).toBe(
      "none",
    );
    const cursor = { ...reference, itemId: "", asOf: reference.effectiveAt };
    expect(
      notificationChangesQuerySchema.parse({ ...scope, cursor: JSON.stringify(cursor) }).cursor,
    ).toEqual(cursor);
    for (const invalid of [
      { limit: 0 },
      { limit: 51 },
      { cursor: "bad JSON" },
      { cursor: "{}" },
      { id: "bad" },
      { tab: "all" },
      { extra: true },
    ])
      expect(notificationChangesQuerySchema.safeParse({ ...scope, ...invalid }).success).toBe(
        false,
      );
  });
  it("requires complete source tab counts and protected state", () => {
    const result = {
      asOf: reference.effectiveAt,
      nextCursor: null,
      tabCounts: { details: 0, members: 0, tables: 0, participants: 1 },
      changes: [
        {
          ...reference,
          messageCode: "invitation",
          requiresResponse: true,
          readReference: reference,
        },
      ],
    };
    expect(notificationChangesPageSchema.parse(result)).toEqual(result);
    expect(
      notificationChangesPageSchema.safeParse({ ...result, tabCounts: { participants: 1 } })
        .success,
    ).toBe(false);
    expect(
      notificationChangesPageSchema.safeParse({
        ...result,
        changes: [{ ...result.changes[0], messageCode: "invented_old_name" }],
      }).success,
    ).toBe(false);
  });
  it("accepts displayed exact selections only, not duplicate or arbitrary hidden-page bulk reads", () => {
    const input = { scope, through: reference.effectiveAt, references: [reference] };
    expect(readNotificationChangesSchema.parse(input)).toEqual(input);
    expect(readNotificationChangesSchema.parse({ ...input, references: [] }).references).toEqual(
      [],
    );
    expect(
      readNotificationChangesSchema.safeParse({ ...input, references: [reference, reference] })
        .success,
    ).toBe(false);
    expect(
      readNotificationChangesSchema.safeParse({
        ...input,
        references: Array.from({ length: 51 }, () => reference),
      }).success,
    ).toBe(false);
    expect(
      readNotificationChangesSchema.safeParse({
        ...input,
        references: [{ ...reference, requiresResponse: false }],
      }).success,
    ).toBe(false);
  });
  it.each(["date", "location", "game"] as const)(
    "accepts legacy validated vote cutoffs for %s without changing vote validation",
    (kind) => {
      const vote =
        kind === "game"
          ? { kind, tableId: scope.id, gameId: 1, vote: "YES" }
          : { kind, optionId: scope.id, vote: "YES" };
      expect(changeEventVoteSchema.safeParse(vote).success).toBe(true);
      expect(
        changeEventVoteSchema.safeParse({ ...vote, attentionThrough: reference.effectiveAt })
          .success,
      ).toBe(true);
      expect(
        changeEventVoteSchema.safeParse({ ...vote, attentionThrough: "invalid" }).success,
      ).toBe(false);
      expect(changeEventVoteSchema.safeParse({ ...vote, vote: "MAYBE" }).success).toBe(false);
    },
  );
});
