import type { ClientSession, Db, Document } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { type EventRecordPage, EventRecordsRepository } from "../event-records.repository";

const id = "00000000-0000-4000-8000-000000000001";
const now = "2026-11-18T12:00:00.000Z";
const query = "A.*[B]";
const escapedQuery = "A\\.\\*\\[B\\]";

function setup(session?: ClientSession) {
  const rows: Document[] = [{ id }];
  const aggregate = vi.fn((_name: string, _pipeline: Document[], _options: Document) => ({
    toArray: async () => rows,
  }));
  const db = {
    collection: (name: string) => ({
      aggregate: (pipeline: Document[], options: Document) => aggregate(name, pipeline, options),
    }),
  };
  return { rows, aggregate, repo: new EventRecordsRepository(db as unknown as Db, session) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("EventRecordsRepository main-list and historical-table source guards", () => {
  it.each([
    { prefix: "", discoverPublic: false },
    { prefix: "", discoverPublic: true },
    { prefix: "event.", discoverPublic: false },
    { prefix: "event.", discoverPublic: true },
  ])(
    "builds group visibility with exact $prefix source and discovery=$discoverPublic",
    ({ prefix, discoverPublic }) => {
      const pipeline = setup().repo.visibleGroups(
        "user_viewer",
        now,
        prefix,
        discoverPublic,
      ) as Document[];
      expect(pipeline[0].$lookup).toEqual({
        from: COLLECTIONS.GROUPS,
        localField: "groupId",
        foreignField: "id",
        as: "parentGroup",
      });
      expect(pipeline[1].$lookup).toMatchObject({
        from: COLLECTIONS.GROUP_MEMBERSHIPS,
        pipeline: [
          {
            $match: {
              userId: "user_viewer",
              status: "ACCEPTED",
              $expr: { $eq: ["$groupId", "$$group"] },
            },
          },
        ],
      });
      expect(pipeline[2].$lookup).toMatchObject({
        from: COLLECTIONS.GROUP_BANS,
        pipeline: [
          {
            $match: {
              userId: "user_viewer",
              revokedAt: { $exists: false },
              $or: [{ until: null }, { until: { $gt: now } }],
              $expr: { $eq: ["$groupId", "$$group"] },
            },
          },
        ],
      });
      expect(pipeline[3].$lookup.let.confirmedAt).toBe(`$${prefix}confirmed.at`);
      expect(pipeline[4].$lookup).toMatchObject({
        from: COLLECTIONS.TABLE_REGISTRATIONS,
        let: { event: `$${prefix}id` },
        pipeline: [
          {
            $match: {
              userId: "user_viewer",
              status: "ACCEPTED",
              $expr: { $eq: ["$eventId", "$$event"] },
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.EVENT_TABLES,
              localField: "tableId",
              foreignField: "id",
              pipeline: [{ $match: { removedAt: { $exists: false } } }],
              as: "liveTable",
            },
          },
          { $match: { "liveTable.0": { $exists: true } } },
          { $limit: 1 },
          { $project: { _id: 0, id: 1 } },
        ],
      });
      expect(pipeline[5].$lookup).toMatchObject({
        from: COLLECTIONS.EVENT_TABLES,
        let: { event: `$${prefix}id`, status: `$${prefix}status` },
        pipeline: [
          {
            $match: {
              removedAt: { $exists: false },
              confirmed: { $exists: true },
              $or: [
                { "confirmed.playerIds": "user_viewer" },
                { demonstratorUserId: "user_viewer" },
              ],
              $expr: {
                $and: [
                  { $eq: ["$eventId", "$$event"] },
                  { $in: ["$$status", ["CONFIRMED", "TERMINATED"]] },
                ],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 0, id: 1 } },
        ],
      });
      expect(pipeline[6].$lookup).toMatchObject({
        from: COLLECTIONS.BLOCKS,
        let: { admin: `$${prefix}adminUserId` },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $and: [
                      { $eq: ["$fromUserId", "user_viewer"] },
                      { $eq: ["$toUserId", "$$admin"] },
                    ],
                  },
                  {
                    $and: [
                      { $eq: ["$toUserId", "user_viewer"] },
                      { $eq: ["$fromUserId", "$$admin"] },
                    ],
                  },
                ],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 0, fromUserId: 1 } },
        ],
      });
      const visibility = pipeline.at(-1)?.$match.$or;
      expect(visibility[0]).toEqual({ groupId: null, "publicEventBlock.0": { $exists: false } });
      expect(visibility[1].$and).toEqual([
        { personalAccessOnly: true },
        { "parentGroup.0.approved": { $exists: true } },
        { "publicEventBlock.0": { $exists: false } },
        ...(prefix
          ? [
              {
                $or: [
                  { "confirmed.playerIds": "user_viewer" },
                  { demonstratorUserId: "user_viewer" },
                ],
              },
            ]
          : []),
      ]);
      expect(visibility[2].$and.slice(0, 3)).toEqual([
        { personalAccessOnly: false },
        { "groupBan.0": { $exists: false } },
        { "parentGroup.0.approved": { $exists: true } },
      ]);
      expect(visibility[2].$and[3].$or[2].$and).toEqual([
        { "parentGroup.type": "PUBLIC" },
        { [`${prefix}visibility`]: { $ne: "PRIVATE" } },
        ...(discoverPublic ? [] : [{ "publicRegistration.0": { $exists: true } }]),
        { "publicEventBlock.0": { $exists: false } },
      ]);
    },
  );

  it("builds participation from active pending/accepted registrations and valid current demonstration", () => {
    const pipeline = setup().repo.participationStages("user_viewer") as Document[];
    expect(pipeline[0].$lookup).toMatchObject({
      from: COLLECTIONS.TABLE_REGISTRATIONS,
      localField: "id",
      foreignField: "eventId",
      pipeline: [
        { $match: { userId: "user_viewer", status: { $in: ["PENDING", "ACCEPTED"] } } },
        {
          $lookup: {
            from: COLLECTIONS.EVENT_TABLES,
            localField: "tableId",
            foreignField: "id",
            pipeline: [{ $match: { removedAt: { $exists: false } } }],
            as: "activeTable",
          },
        },
        { $match: { "activeTable.0": { $exists: true } } },
        { $limit: 1 },
      ],
    });
    expect(pipeline[1].$lookup).toMatchObject({
      from: COLLECTIONS.EVENT_TABLES,
      pipeline: [
        {
          $match: {
            demonstratorUserId: "user_viewer",
            removedAt: { $exists: false },
            $expr: {
              $or: [
                { $eq: ["$$eventStatus", "PLANNING"] },
                { $ne: [{ $ifNull: ["$confirmed", null] }, null] },
              ],
            },
          },
        },
        { $limit: 1 },
      ],
    });
  });

  it.each([
    { section: undefined, states: ["PLANNING", "CONFIRMED", "TERMINATED"] },
    { section: "mine" as const, states: ["PLANNING", "CONFIRMED"] },
    { section: "available" as const, states: ["PLANNING"] },
    { section: "terminated" as const, states: ["TERMINATED"] },
  ])(
    "keeps the $section event section inside its allowed statuses before paging",
    async ({ section, states }) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      await expect(
        fixture.repo.list("user_viewer", { section, limit: 8, query, cursor: `${now}|${id}` }),
      ).resolves.toBe(fixture.rows);
      const [collection, pipeline, options] = fixture.aggregate.mock.calls[0];
      expect(collection).toBe(COLLECTIONS.EVENTS);
      expect(options).toEqual({ session });
      expect(pipeline[0]).toEqual({ $match: { status: { $in: states } } });
      expect(pipeline.slice(-5, -3)).toEqual([
        { $match: { name: { $regex: escapedQuery, $options: "i" } } },
        { $match: { $or: [{ createdAt: { $lt: now } }, { createdAt: now, id: { $lt: id } }] } },
      ]);
      expect(pipeline.at(-3)).toEqual({ $sort: { createdAt: -1, id: -1 } });
      expect(pipeline.at(-2)).toEqual({ $limit: 9 });
      expect(pipeline.at(-1)?.$project).toMatchObject({
        _id: 0,
        transactionLock: 0,
        parentGroup: 0,
        groupMembership: 0,
        groupBan: 0,
        personalAccessOnly: 0,
        myRegistration: 0,
        myDemonstration: 0,
      });
      const eligibility = pipeline.at(-6)?.$match;
      if (section === "available") {
        expect(eligibility).toMatchObject({
          "myRegistration.0": { $exists: false },
          "myDemonstration.0": { $exists: false },
          "personalFrozenTable.0": { $exists: false },
        });
        expect(eligibility.$expr.$and[0]).toEqual({ $eq: ["$status", "PLANNING"] });
        expect(eligibility.$expr.$and[1]).toHaveProperty("$not");
        expect(eligibility.$expr.$and[4].$or[1].$gt).toEqual([
          { $convert: { input: "$bookingClosesAt", to: "date", onError: null, onNull: null } },
          new Date(now),
        ]);
      } else if (section === "terminated") {
        expect(eligibility.$expr.$and[0]).toEqual({ $eq: ["$status", "TERMINATED"] });
        expect(eligibility.$expr.$and[1].$or[1]).toEqual({
          $gt: [{ $size: "$personalFrozenTable" }, 0],
        });
      } else {
        expect(eligibility.$or.slice(0, 3)).toEqual([
          { "myRegistration.0": { $exists: true } },
          { "myDemonstration.0": { $exists: true } },
          { "personalFrozenTable.0": { $exists: true } },
        ]);
        expect(eligibility.$or[3].$expr.$or).toContainEqual({
          $in: ["MODERATOR", "$groupMembership.role"],
        });
      }
    },
  );

  it("intersects explicit main-list statuses without expanding them and keeps group lists source-scoped", async () => {
    const fixture = setup();
    await fixture.repo.list("user_viewer", {
      section: "mine",
      statuses: ["CONFIRMED", "TERMINATED"],
      limit: 2,
    });
    expect(fixture.aggregate.mock.calls[0][1][0]).toEqual({
      $match: { status: { $in: ["CONFIRMED"] } },
    });
    await fixture.repo.list(
      "user_viewer",
      { section: "available", statuses: ["TERMINATED"], limit: 2 },
      id,
    );
    const groupPipeline = fixture.aggregate.mock.calls[1][1];
    expect(groupPipeline[0]).toEqual({ $match: { status: { $in: ["TERMINATED"] }, groupId: id } });
    expect(groupPipeline.some((stage) => stage.$lookup?.as === "myRegistration")).toBe(false);
    expect(groupPipeline.at(-2)).toEqual({ $limit: 3 });
  });

  it.each(["past", "future"] as const)(
    "applies a %s period match before event sorting/paging with the stored timezone",
    async (period) => {
      const fixture = setup();
      await fixture.repo.list("user_viewer", { limit: 2, periods: [period] });
      const pipeline = fixture.aggregate.mock.calls[0][1];
      const periodMatch = pipeline.find((stage) => stage.$match?.$expr?.$let);
      expect(periodMatch?.$match.$expr.$let.in.$or[1]).toEqual({
        [period === "past" ? "$lt" : "$gte"]: [
          "$$day",
          { $dateToString: { date: new Date(now), timezone: "$timeZone", format: "%Y-%m-%d" } },
        ],
      });
      expect(pipeline.indexOf(periodMatch as Document)).toBeLessThan(pipeline.length - 3);
    },
  );

  it("preserves explicitly empty period selection instead of silently expanding to every event", async () => {
    const fixture = setup();
    await fixture.repo.list("user_viewer", { limit: 2, periods: [] });
    expect(fixture.aggregate.mock.calls[0][1]).toContainEqual({ $match: { id: { $in: [] } } });
  });

  it.each([undefined, "waiting", "mine", "available"] as EventRecordPage["section"][])(
    "uses historical or $section table source guards before candidate paging",
    async (section) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      await expect(
        fixture.repo.personalTables("user_viewer", {
          section,
          limit: 8,
          query,
          cursor: `${now}|${id}`,
        }),
      ).resolves.toBe(fixture.rows);
      const [collection, pipeline, options] = fixture.aggregate.mock.calls[0];
      expect(collection).toBe(COLLECTIONS.EVENT_TABLES);
      expect(options).toEqual({ session });
      expect(pipeline[0]).toEqual({ $match: { removedAt: { $exists: false } } });
      expect(pipeline[3]).toEqual({
        $match: {
          "event.status": {
            $in: section ? ["PLANNING", "CONFIRMED", "TERMINATED"] : ["TERMINATED"],
          },
          $or: [{ "event.status": "PLANNING" }, { "confirmed.gameId": { $exists: true } }],
        },
      });
      expect(pipeline[4].$lookup).toMatchObject({
        from: COLLECTIONS.TABLE_REGISTRATIONS,
        pipeline: [{ $match: { userId: "user_viewer", status: { $in: ["PENDING", "ACCEPTED"] } } }],
      });
      const eligibility = pipeline[5].$match;
      if (section === "waiting")
        expect(eligibility).toEqual({
          "ownRows.0": { $exists: true },
          demonstratorUserId: { $ne: "user_viewer" },
          $nor: [{ "event.status": { $ne: "PLANNING" }, "confirmed.playerIds": "user_viewer" }],
        });
      else if (!section)
        expect(eligibility.$or).toEqual([
          { "confirmed.playerIds": "user_viewer" },
          { demonstratorUserId: "user_viewer" },
          { "event.adminUserId": "user_viewer", "event.groupId": null },
          { "event.groupId": { $ne: null } },
        ]);
      else
        expect(eligibility.$or[0]).toEqual(
          section === "mine"
            ? { ownRows: { $elemMatch: { status: "ACCEPTED" } } }
            : { "ownRows.0": { $exists: true } },
        );
      const authority = pipeline.find((stage) =>
        stage.$match?.$or?.some(
          (condition: Document) => condition.$expr?.$and?.[0]?.$ne?.[0] === "$personalAccessOnly",
        ),
      );
      expect(Boolean(authority)).toBe(!section);
      if (authority)
        expect(authority.$match.$or[2].$expr.$and[1].$or).toContainEqual({
          $in: ["MODERATOR", "$groupMembership.role"],
        });
      expect(pipeline.slice(-8, -6)).toEqual([
        {
          $set: {
            _confirmedTitleGameId: {
              $cond: [{ $eq: ["$event.status", "PLANNING"] }, null, "$confirmed.gameId"],
            },
          },
        },
        {
          $lookup: {
            from: COLLECTIONS.BOARD_GAMES,
            localField: "_confirmedTitleGameId",
            foreignField: "id",
            pipeline: [{ $project: { _id: 0, name: 1 } }],
            as: "_titleGames",
          },
        },
      ]);
      const titleAlternatives = pipeline.at(-6)?.$match.$expr.$let.in.$cond;
      expect(titleAlternatives[1].$regexMatch).toEqual({
        input: "$$game",
        regex: escapedQuery,
        options: "i",
      });
      expect(titleAlternatives[2].$or.map((entry: Document) => entry.$regexMatch.input)).toEqual([
        { $concat: ["Table #", { $toString: { $add: ["$order", 1] } }] },
        { $concat: ["Tavolo #", { $toString: { $add: ["$order", 1] } }] },
      ]);
      expect(pipeline.slice(-5)).toEqual([
        { $match: { $or: [{ createdAt: { $lt: now } }, { createdAt: now, id: { $lt: id } }] } },
        { $sort: { createdAt: -1, id: -1 } },
        { $limit: 9 },
        { $replaceWith: "$originalTable" },
        { $project: { _id: 0, event: 0, ownRows: 0 } },
      ]);
    },
  );

  it("intersects explicitly selected historical table statuses and forwards event-prefixed periods", async () => {
    const fixture = setup();
    await fixture.repo.personalTables("user_viewer", {
      limit: 2,
      statuses: ["PLANNING", "CONFIRMED"],
      periods: ["past"],
    });
    const pipeline = fixture.aggregate.mock.calls[0][1];
    expect(pipeline[3].$match["event.status"]).toEqual({ $in: [] });
    const period = pipeline.find((stage) => stage.$match?.$expr?.$let);
    expect(period?.$match.$expr.$let.in.$or[1].$lt[1].$dateToString.timezone).toBe(
      "$event.timeZone",
    );
    expect(pipeline.slice(-4)).toEqual([
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: 3 },
      { $replaceWith: "$originalTable" },
      { $project: { _id: 0, event: 0, ownRows: 0 } },
    ]);
  });

  it("does not convert a source authorization/query failure into successful empty history", async () => {
    const fixture = setup();
    const error = new Error("Mongo aggregate failed");
    fixture.aggregate.mockImplementationOnce(() => ({
      toArray: async () => {
        throw error;
      },
    }));
    await expect(fixture.repo.personalTables("user_viewer", { limit: 8 })).rejects.toBe(error);
    fixture.rows.splice(0);
    await expect(fixture.repo.list("user_viewer", { limit: 8 })).resolves.toEqual([]);
  });
});
