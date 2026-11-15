import { expect, it } from "vitest";
import {
  PROFILE_ACTIVITY_INDEXES,
  profileActivityKindSchema,
  profileActivityQuerySchema,
  profileGameQuerySchema,
  profileHistoryQuerySchema,
} from "../dto/profileView";

it("accepts bounded pages, seven durable kinds and actual UTC/UUID cursors", () => {
  expect(profileActivityQuerySchema.parse({})).toEqual({ limit: 10 });
  const cursor = "2030-06-03T12:00:00.000Z|11111111-1111-4111-8111-111111111111";
  for (const kind of profileActivityKindSchema.options)
    expect(profileActivityQuerySchema.parse({ kind, limit: "5", cursor })).toEqual({
      kind,
      limit: 5,
      cursor,
    });
  expect(profileActivityQuerySchema.parse({ limit: 10 })).toEqual({ limit: 10 });
  expect(PROFILE_ACTIVITY_INDEXES[0]).toEqual({
    key: { userId: 1, source: 1, kind: 1 },
    unique: true,
  });
});
it("rejects invented history types, malformed dates/IDs, additional cursor segments and unbounded queries", () => {
  for (const value of [
    { limit: 50 },
    { limit: "no" },
    { kind: "won" },
    { extra: "x" },
    { cursor: "2030-99-03T12:00:00.000Z|11111111-1111-4111-8111-111111111111" },
    { cursor: "2030-06-03T12:00:00.000Z|------------------------------------" },
    { cursor: "2030-06-03T12:00:00.000Z|11111111-1111-4111-8111-111111111111|extra" },
    { cursor: "x".repeat(101) },
  ])
    expect(profileActivityQuerySchema.safeParse(value).success).toBe(false);
});
it("keeps games and ordinal history separate, rejecting unsafe offsets without fabricating dates", () => {
  expect(profileGameQuerySchema.parse({})).toEqual({ query: "", cursor: 0 });
  expect(profileGameQuerySchema.parse({ query: " chess ", cursor: "20" })).toEqual({
    query: "chess",
    cursor: 20,
  });
  expect(profileHistoryQuerySchema.parse({ cursor: "101" })).toEqual({ cursor: 101 });
  for (const value of [
    { cursor: -1 },
    { cursor: 0.5 },
    { cursor: Number.MAX_SAFE_INTEGER + 1 },
    { query: "x".repeat(121) },
    { scope: "GROUP" },
  ])
    expect(profileGameQuerySchema.safeParse(value).success).toBe(false);
  expect(profileHistoryQuerySchema.safeParse({ cursor: 0 }).success).toBe(false);
  expect(profileHistoryQuerySchema.safeParse({ date: "2030-01-01" }).success).toBe(false);
});
