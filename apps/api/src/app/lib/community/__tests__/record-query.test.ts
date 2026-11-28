import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  emptyRecordQuery,
  eventListQuery,
  eventSeatsQuery,
  groupListQuery,
  groupPeopleQuery,
  personalTablesQuery,
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
  it("accepts empty public discovery and combines text, friends and paired coordinates", () => {
    expect(recordQuery(req("scope=public"), groupListQuery)).toEqual({
      scope: "public",
      limit: 20,
    });
    expect(recordQuery(req("scope=public&query=%20"), groupListQuery).query).toBe("");
    expect(
      recordQuery(
        req("scope=public&query=%20C%20&friends=true&nearLat=0&nearLng=-179.5"),
        groupListQuery,
      ),
    ).toEqual({
      scope: "public",
      limit: 20,
      query: "C",
      friends: true,
      nearLat: 0,
      nearLng: -179.5,
    });
  });
  it.each([1, 25, 100])("accepts an explicit radius of %i km for public discovery", (radiusKm) => {
    expect(
      recordQuery(req(`scope=public&nearLat=0&nearLng=0&radiusKm=${radiusKm}`), groupListQuery)
        .radiusKm,
    ).toBe(radiusKm);
  });
  it.each([
    "scope=mine&query=%20",
    "scope=mine&friends=true",
    "scope=mine&nearLat=10&nearLng=20",
    "scope=moderation&friends=true",
    "scope=moderation&nearLat=10&nearLng=20",
    "scope=public&friends=false",
    "scope=public&friends=true&friends=true",
    "scope=public&nearLat=10",
    "scope=public&nearLng=20",
    "scope=public&nearLat=&nearLng=20",
    "scope=public&nearLat=NaN&nearLng=20",
    "scope=public&nearLat=10&nearLng=Infinity",
    "scope=public&nearLat=90.1&nearLng=20",
    "scope=public&nearLat=10&nearLng=-181",
    "scope=public&radiusKm=50",
    "scope=public&nearLat=10&radiusKm=50",
    "scope=mine&nearLat=10&nearLng=20&radiusKm=50",
    "scope=moderation&nearLat=10&nearLng=20&radiusKm=50",
    ...["", "0", "-1", "1.5", "101", "1e2", "Infinity", "25&radiusKm=50"].map(
      (radius) => `scope=public&nearLat=10&nearLng=20&radiusKm=${radius}`,
    ),
  ])("rejects invalid or non-discovery search filters (%s)", (query) => {
    expect(() => recordQuery(req(query), groupListQuery)).toThrow("INVALID_QUERY");
  });
  it("canonicalizes exact and legacy group roles and preserves the name cursor", () => {
    const nameCursor = `name:Games | Sunday|${id}`;
    expect(
      recordQuery(
        req(
          new URLSearchParams({
            roles: "pending,member,moderator,administrator,pending,invited",
            sort: "name",
            direction: "asc",
            cursor: nameCursor,
          }).toString(),
        ),
        groupListQuery,
      ),
    ).toEqual({
      scope: "mine",
      limit: 20,
      roles: ["invited", "administrator", "moderator", "member", "pending"],
      sort: "name",
      direction: "asc",
      cursor: nameCursor,
    });
    expect(
      recordQuery(
        req(`sort=date&direction=desc&cursor=${encodeURIComponent(cursor)}`),
        groupListQuery,
      ),
    ).toMatchObject({ sort: "date", direction: "desc", cursor });
  });
  it.each([
    "roles=member,",
    "sort=rating",
    "direction=ascending",
    "sort=name&sort=date",
    "scope=public&query=club&sort=name",
    "scope=moderation&direction=asc",
    `sort=name&cursor=${encodeURIComponent(cursor)}`,
    `sort=date&cursor=${encodeURIComponent(`name:Games|${id}`)}`,
    `sort=name&cursor=${encodeURIComponent(`name:|${id}`)}`,
    "sort=name&cursor=name:Games%7Cwrong",
    `sort=name&cursor=${encodeURIComponent(`Games|${id}`)}`,
  ])("rejects invalid group role, ordering or cursor inputs (%s)", (query) => {
    expect(() => recordQuery(req(query), groupListQuery)).toThrow("INVALID_QUERY");
  });
  it("canonicalizes Scheduled and Terminated roles and accepts sorting for Available", () => {
    const nameCursor = `name:Games | Sunday|${id}`;
    expect(
      recordQuery(
        req(
          new URLSearchParams({
            section: "mine",
            roles: "pending,participant,moderator,participant,admin",
            sort: "name",
            direction: "desc",
            cursor: nameCursor,
          }).toString(),
        ),
        eventListQuery,
      ),
    ).toMatchObject({
      section: "mine",
      roles: ["admin", "moderator", "participant", "pending"],
      sort: "name",
      direction: "desc",
      cursor: nameCursor,
    });
    expect(
      recordQuery(req("section=terminated&roles=participant,admin"), eventListQuery).roles,
    ).toEqual(["admin", "participant"]);
    expect(recordQuery(req("section=terminated&roles="), eventListQuery).roles).toEqual([]);
    expect(recordQuery(req("section=mine&roles="), eventListQuery).roles).toEqual([]);
    expect(
      recordQuery(
        req(`section=available&sort=date&direction=asc&cursor=${encodeURIComponent(cursor)}`),
        eventListQuery,
      ),
    ).toMatchObject({ section: "available", sort: "date", direction: "asc", cursor });
    expect(recordQuery(req("section=mine"), eventListQuery).sort).toBeUndefined();
  });

  it("allows a Group's events to be ordered by name or date", () => {
    for (const sort of ["name", "date"] as const) {
      expect(
        recordQuery(req(`groupId=${id}&sort=${sort}&direction=desc`), eventListQuery),
      ).toMatchObject({ groupId: id, sort, direction: "desc" });
    }
  });

  it.each([
    "section=mine&roles=participant,",
    "section=mine&roles=demonstrator",
    "section=mine&sort=rating",
    "section=mine&direction=ascending",
    "section=terminated&roles=admin,pending",
    "section=available&roles=",
    "section=available&roles=participant",
    "roles=admin",
    "sort=date",
    "direction=asc",
    `groupId=${id}&roles=participant`,
    `section=available&sort=name&cursor=${encodeURIComponent(cursor)}`,
    `section=mine&sort=date&cursor=${encodeURIComponent(`name:Games|${id}`)}`,
    `section=mine&cursor=${encodeURIComponent(`name:Games|${id}`)}`,
  ])("rejects disallowed Event role, sorting or cursor parameters (%s)", (query) => {
    expect(() => recordQuery(req(query), eventListQuery)).toThrow("INVALID_QUERY");
  });

  it("accepts one-character list filters and strict section partitions without weakening discovery", () => {
    for (const query of ["a", "ab", "abc", ".*"]) {
      expect(recordQuery(req(`query=${encodeURIComponent(query)}`), eventListQuery).query).toBe(
        query,
      );
      expect(
        recordQuery(req(`query=${encodeURIComponent(query)}`), personalTablesQuery).query,
      ).toBe(query);
      expect(
        recordQuery(req(`scope=mine&query=${encodeURIComponent(query)}`), groupListQuery).query,
      ).toBe(query);
      expect(
        recordQuery(req(`scope=public&query=${encodeURIComponent(query)}`), groupListQuery).query,
      ).toBe(query);
      expect(() =>
        recordQuery(req(`scope=moderation&query=${encodeURIComponent(query)}`), groupListQuery),
      ).toThrow("INVALID_QUERY");
    }
    expect(recordQuery(req("section=mine"), eventListQuery).section).toBe("mine");
    expect(recordQuery(req("section=available"), eventListQuery).section).toBe("available");
    expect(recordQuery(req("section=waiting"), personalTablesQuery).section).toBe("waiting");
    expect(() => recordQuery(req("section=waiting"), eventListQuery)).toThrow("INVALID_QUERY");
    expect(() => recordQuery(req("section=available"), personalTablesQuery)).toThrow(
      "INVALID_QUERY",
    );
    expect(() => recordQuery(req(`groupId=${id}&section=mine`), eventListQuery)).toThrow(
      "INVALID_QUERY",
    );
    expect(() => recordQuery(req("section=mine&section=available"), eventListQuery)).toThrow(
      "INVALID_QUERY",
    );
    expect(() => recordQuery(req("query="), eventListQuery)).toThrow("INVALID_QUERY");
    expect(() => recordQuery(req("query=" + "a".repeat(121)), personalTablesQuery)).toThrow(
      "INVALID_QUERY",
    );
  });
  it("accepts History ordering and validates cursors against the sort field", () => {
    for (const [sort, value] of [
      ["name", "a|b"],
      ["date", cursor.split("|")[0]],
      ["participants", "4"],
    ]) {
      const token = [sort + ":" + value, id].join("|");
      expect(personalTablesQuery.parse({ sort, direction: "asc", cursor: token })).toMatchObject({
        sort,
        direction: "asc",
        cursor: token,
      });
      expect(personalTablesQuery.parse({ sort }).sort).toBe(sort);
    }
    for (const invalid of [
      { direction: "asc" },
      { section: "mine", sort: "name" },
      { sort: "name", cursor },
      { sort: "name", cursor: "name:|" + id },
      { sort: "name", cursor: "name:test|not-an-id" },
      { sort: "participants", cursor: "participants:-1|" + id },
      { sort: "participants", cursor: "participants:9007199254740992|" + id },
      { sort: "date", cursor: "date:invalid|" + id },
      { cursor: "invalid-cursor" },
    ])
      expect(personalTablesQuery.safeParse(invalid).success).toBe(false);
  });
  it.each(["", "CONFIRMED", "PLANNING,TERMINATED", "TERMINATED,CONFIRMED,PLANNING"])(
    "combines lifecycle and literal name filters without changing cursors: %s",
    (statuses) => {
      const query = `statuses=${statuses}&query=${encodeURIComponent("a.*")}&cursor=${encodeURIComponent(cursor)}`;
      const event = recordQuery(req(query), eventListQuery),
        table = recordQuery(req(query), personalTablesQuery);
      const expected = ["CONFIRMED", "PLANNING", "TERMINATED"].filter((status) =>
        statuses.split(",").includes(status),
      );
      expect(event).toMatchObject({ statuses: expected, query: "a.*", cursor, limit: 20 });
      expect(table).toMatchObject({ statuses: expected, query: "a.*", cursor, limit: 20 });
    },
  );
  it.each([
    "statuses=DRAFT",
    "statuses=confirmed",
    "statuses=CONFIRMED,",
    "statuses=CONFIRMED&statuses=PLANNING",
    "statuses=CONFIRMED,%20PLANNING",
    "statuses=" + "x".repeat(101),
  ])("rejects unsupported/duplicated lifecycle query: %s", (query) => {
    expect(() => recordQuery(req(query), eventListQuery)).toThrow("INVALID_QUERY");
    expect(() => recordQuery(req(query), personalTablesQuery)).toThrow("INVALID_QUERY");
  });
  it.each(["PRIVATE", "PUBLIC"])(
    "accepts a source type filter only for owned Group lists (%s)",
    (type) => {
      expect(
        recordQuery(req(`scope=mine&type=${type}&roles=accepted,admin`), groupListQuery),
      ).toEqual({
        scope: "mine",
        type,
        roles: ["admin", "accepted"],
        limit: 20,
      });
    },
  );
  it.each([
    "type=private",
    "type=",
    "type=LEGACY",
    "type=PRIVATE&type=PUBLIC",
    "scope=public&query=club&type=PRIVATE",
    "scope=public&query=club&type=PUBLIC",
    "scope=moderation&type=PUBLIC",
  ])("rejects invalid, duplicate or discovery/moderation type filters (%s)", (query) => {
    expect(() => recordQuery(req(query), groupListQuery)).toThrow("INVALID_QUERY");
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
    for (const query of ["scope=private", "scope=moderation&roles=admin", "roles=owner"])
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
