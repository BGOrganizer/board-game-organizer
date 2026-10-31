import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  emptyRecordQuery,
  eventListQuery,
  eventSeatsQuery,
  groupListQuery,
  groupPeopleQuery,
  recordPageQuery,
  recordQuery,
} from "../record-query";
import { communityBody, communityId, communityUserId } from "../request";

const id = "11111111-1111-4111-8111-111111111111",
  cursor = `2030-06-01T12:00:00.000Z|${id}`;
const req = (query = "") => new Request(`https://api.test/api/groups${query ? `?${query}` : ""}`);
describe("unified request boundaries", () => {
  it("reuses raw JSON across transaction retries but validates each schema independently", async () => {
    const request = new Request("https://api.test", { method: "POST", body: '{"version":2}' });
    expect(await communityBody(request, z.object({ version: z.number() }).strict())).toEqual({
      version: 2,
    });
    expect(await communityBody(request, z.object({ version: z.number() }).strict())).toEqual({
      version: 2,
    });
    await expect(communityBody(request, z.object({ name: z.string() }).strict())).rejects.toThrow(
      "INVALID_REQUEST",
    );
    const invalid = new Request("https://api.test", { method: "POST", body: "{" });
    await expect(communityBody(invalid, z.unknown())).rejects.toThrow("INVALID_REQUEST");
    await expect(communityBody(invalid, z.unknown())).rejects.toThrow("INVALID_REQUEST");
  });
  it("separates resource UUIDs from application Clerk identities", () => {
    expect(communityId(id)).toBe(id);
    expect(() => communityId("wrong")).toThrow("INVALID_ID");
    expect(communityUserId(" user_clerk ")).toBe("user_clerk");
    expect(() => communityUserId(" ")).toThrow("INVALID_ID");
  });
  it("preserves canonical list roles, local-day periods and source cursors", () => {
    expect(recordQuery(req(), groupListQuery)).toEqual({ scope: "mine", limit: 20 });
    expect(recordQuery(req("roles=accepted,admin,accepted"), groupListQuery).roles).toEqual([
      "admin",
      "accepted",
    ]);
    expect(recordQuery(req("roles="), groupListQuery).roles).toEqual([]);
    expect(recordQuery(req("scope=public&query=club"), groupListQuery).scope).toBe("public");
    expect(recordQuery(req(`cursor=${encodeURIComponent(cursor)}`), recordPageQuery).cursor).toBe(
      cursor,
    );
    expect(recordQuery(req("cursor=owner"), groupPeopleQuery).cursor).toBe("owner");
    expect(recordQuery(req("periods=future,past,future"), eventListQuery).periods).toEqual([
      "past",
      "future",
    ]);
    expect(recordQuery(req("periods="), eventListQuery).periods).toEqual([]);
    expect(
      recordQuery(
        req(`cursor=${encodeURIComponent(`2030-06-01T12:00:00.000Z|2|${id}`)}&pending=true`),
        eventSeatsQuery,
      ).pending,
    ).toBe(true);
    expect(recordQuery(req(), eventSeatsQuery).pending).toBe(false);
    expect(recordQuery(req("x-vercel-protection-bypass=opaque"), emptyRecordQuery)).toEqual({});
  });
  it.each([
    "unknown=yes",
    "limit=0",
    "limit=51",
    "limit=1.5",
    "limit=2&limit=3",
    "query=abc",
    "cursor=bad",
    `cursor=${encodeURIComponent(`2030-02-30T12:00:00.000Z|${id}`)}`,
    "x-vercel-protection-bypass=",
    "x-vercel-protection-bypass=one&x-vercel-protection-bypass=two",
  ])("rejects invalid or duplicated query: %s", (query) => {
    expect(() => recordQuery(req(query), recordPageQuery)).toThrow("INVALID_QUERY");
  });
  it("rejects invalid scopes, role leakage, member-feed sentinels and malformed priority cursors", () => {
    for (const query of [
      "scope=private",
      "scope=public",
      "scope=moderation&roles=admin",
      "roles=owner",
    ])
      expect(() => recordQuery(req(query), groupListQuery)).toThrow("INVALID_QUERY");
    expect(() => recordQuery(req("mode=pending&cursor=owner"), groupPeopleQuery)).toThrow(
      "INVALID_QUERY",
    );
    for (const value of [
      "bad",
      `2030-06-01T12:00:00.000Z|-1|${id}`,
      `2030-06-01T12:00:00.000Z|9007199254740992|${id}`,
      `2030-06-01T12:00:00.000Z|0|wrong`,
    ])
      expect(() =>
        recordQuery(req(`cursor=${encodeURIComponent(value)}`), eventSeatsQuery),
      ).toThrow("INVALID_QUERY");
    expect(() => recordQuery(req("periods=never"), eventListQuery)).toThrow("INVALID_QUERY");
  });
});
