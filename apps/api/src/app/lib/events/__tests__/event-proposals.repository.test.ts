import type { EventProposal } from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { EventRecordsRepository } from "../event-records.repository";

const id = "00000000-0000-4000-8000-000000000001";
const proposalId = "00000000-0000-4000-8000-000000000002";
const tableId = "00000000-0000-4000-8000-000000000003";
const at = "2026-11-18T12:00:00.000Z";
const proposal: EventProposal = {
  id: proposalId,
  eventId: id,
  groupId: null,
  userId: "user_player",
  clientRequestId: proposalId,
  requestHash: "a".repeat(64),
  payloadKey: "b".repeat(64),
  payload: { kind: "game", tableId, gameId: 42 },
  label: "Board game",
  status: "PENDING",
  version: 1,
  submittedEventVersion: 2,
  createdAt: at,
  updatedAt: at,
};

function setup(session?: ClientSession) {
  const rows: Document[] = [proposal];
  const cursor = {
    sort: vi.fn((_sort: Document) => cursor),
    limit: vi.fn((_limit: number) => cursor),
    toArray: vi.fn(async () => rows),
  };
  const findOne = vi.fn(
    async (_filter: Document, _options: Document): Promise<Document | null> => null,
  );
  const find = vi.fn((_filter: Document, _options: Document) => cursor);
  const distinct = vi.fn(
    async (_field: string, _filter: Document, _options: Document): Promise<unknown[]> => [],
  );
  const replaceOne = vi.fn(
    async (_filter: Document, _replacement: Document, _options: Document) => ({ modifiedCount: 1 }),
  );
  const aggregate = vi.fn((_pipeline: Document[], _options: Document) => ({
    toArray: async () => rows,
  }));
  const db = {
    collection: vi.fn((_name: string) => ({ findOne, find, distinct, replaceOne, aggregate })),
  };
  return {
    rows,
    cursor,
    findOne,
    find,
    distinct,
    replaceOne,
    aggregate,
    db,
    repo: new EventRecordsRepository(db as unknown as Db, session),
  };
}

describe("EventRecordsRepository actual proposal persistence and paging", () => {
  it("looks up a source proposal, idempotent request and pending duplicate with different exact identities", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    fixture.findOne.mockResolvedValueOnce(proposal);
    await expect(fixture.repo.proposal(proposalId)).resolves.toBe(proposal);
    await expect(fixture.repo.proposalRequest(id, "user_player", proposalId)).resolves.toBeNull();
    await expect(
      fixture.repo.duplicateProposal(id, "user_player", proposal.payloadKey),
    ).resolves.toBeNull();
    expect(fixture.findOne.mock.calls).toEqual([
      [{ id: proposalId }, { session, projection: { _id: 0 } }],
      [
        { eventId: id, userId: "user_player", clientRequestId: proposalId },
        { session, projection: { _id: 0 } },
      ],
      [
        { eventId: id, userId: "user_player", payloadKey: proposal.payloadKey, status: "PENDING" },
        { session, projection: { _id: 0 } },
      ],
    ]);
    expect(fixture.db.collection).toHaveBeenLastCalledWith(COLLECTIONS.EVENT_PROPOSALS);
  });

  it.each([false, true])(
    "upserts and returns the actual versioned proposal with session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const fixture = setup(session);
      await expect(fixture.repo.saveProposal(proposal)).resolves.toBe(proposal);
      expect(fixture.replaceOne).toHaveBeenCalledExactlyOnceWith({ id: proposalId }, proposal, {
        ...(session ? { session } : {}),
        upsert: true,
      });
    },
  );

  it("reads all members of the exact game, choice key or review batch without crossing events", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    await expect(fixture.repo.gameProposals(id, tableId, 42)).resolves.toBe(fixture.rows);
    await expect(fixture.repo.choiceProposals(id, proposal.payloadKey)).resolves.toBe(fixture.rows);
    await expect(fixture.repo.proposalBatch(id, proposalId)).resolves.toBe(fixture.rows);
    expect(fixture.find.mock.calls).toEqual([
      [
        { eventId: id, "payload.kind": "game", "payload.tableId": tableId, "payload.gameId": 42 },
        { session, projection: { _id: 0 } },
      ],
      [
        { eventId: id, payloadKey: proposal.payloadKey },
        { session, projection: { _id: 0 } },
      ],
      [
        { eventId: id, reviewBatchId: proposalId },
        { session, projection: { _id: 0 } },
      ],
    ]);
  });

  it("limits own proposed game IDs to numeric values from the exact user/event/table", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    fixture.distinct.mockResolvedValueOnce([42, "42", null, 7]);
    await expect(fixture.repo.ownProposedGames(id, tableId, "user_player")).resolves.toEqual([
      42, 7,
    ]);
    await expect(fixture.repo.ownProposedGames(id, tableId, "user_other")).resolves.toEqual([]);
    expect(fixture.distinct.mock.calls[0]).toEqual([
      "payload.gameId",
      { eventId: id, userId: "user_player", "payload.kind": "game", "payload.tableId": tableId },
      { session },
    ]);
  });

  it.each(["date", "location", "game"] as const)(
    "groups %s proposal reviews before the representative cursor and page limit",
    async (kind) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      const page = {
        limit: 8,
        cursor: `${at}|${proposalId}`,
        ...(kind === "game" ? { tableId } : {}),
      };
      await expect(fixture.repo.proposalReviewPage(id, kind, page)).resolves.toBe(fixture.rows);
      expect(fixture.aggregate).toHaveBeenCalledExactlyOnceWith(
        [
          {
            $match: {
              eventId: id,
              "payload.kind": kind,
              ...(kind === "game" ? { "payload.tableId": tableId } : {}),
            },
          },
          {
            $set: {
              pendingOrder: {
                $cond: [
                  { $eq: ["$status", "PENDING"] },
                  2,
                  { $cond: [{ $eq: ["$status", "ACCEPTED"] }, 1, 0] },
                ],
              },
            },
          },
          { $sort: { pendingOrder: -1, createdAt: -1, id: -1 } },
          { $unset: ["pendingOrder", "_id"] },
          {
            $group: {
              _id: kind === "game" ? "$payload.gameId" : "$payloadKey",
              representative: { $first: "$$ROOT" },
              members: { $push: "$$ROOT" },
            },
          },
          ...(kind === "game"
            ? [{ $match: { "representative.status": { $ne: "ACCEPTED" } } }]
            : []),
          {
            $match: {
              $or: [
                { "representative.createdAt": { $lt: at } },
                { "representative.createdAt": at, "representative.id": { $lt: proposalId } },
              ],
            },
          },
          { $sort: { "representative.createdAt": -1, "representative.id": -1 } },
          { $limit: 9 },
        ],
        { session },
      );
    },
  );

  it("routes a first game-review page through the actual grouped review implementation", async () => {
    const fixture = setup();
    await fixture.repo.gameProposalPage(id, tableId, { limit: 2 });
    const [pipeline, options] = fixture.aggregate.mock.calls[0];
    expect(options).toEqual({});
    expect(pipeline[0]).toEqual({
      $match: { eventId: id, "payload.kind": "game", "payload.tableId": tableId },
    });
    expect(pipeline.slice(-3)).toEqual([
      { $match: { "representative.status": { $ne: "ACCEPTED" } } },
      { $sort: { "representative.createdAt": -1, "representative.id": -1 } },
      { $limit: 3 },
    ]);
    expect(pipeline).toHaveLength(8);
  });

  it("pages an owner's exact kind/table/request before fetching extra rows for the next cursor", async () => {
    const fixture = setup();
    await expect(
      fixture.repo.proposals(id, "user_player", {
        kind: "game",
        tableId,
        clientRequestId: proposalId,
        cursor: `${at}|${proposalId}`,
        limit: 8,
      }),
    ).resolves.toBe(fixture.rows);
    expect(fixture.find).toHaveBeenCalledExactlyOnceWith(
      {
        eventId: id,
        "payload.kind": "game",
        userId: "user_player",
        "payload.tableId": tableId,
        clientRequestId: proposalId,
        $or: [{ createdAt: { $lt: at } }, { createdAt: at, id: { $lt: proposalId } }],
      },
      { projection: { _id: 0 } },
    );
    expect(fixture.cursor.sort).toHaveBeenCalledExactlyOnceWith({ createdAt: -1, id: -1 });
    expect(fixture.cursor.limit).toHaveBeenCalledExactlyOnceWith(9);
  });

  it("keeps the authorized manager's unfiltered first proposal page event- and kind-scoped", async () => {
    const fixture = setup();
    fixture.rows.splice(0);
    await expect(fixture.repo.proposals(id, null, { kind: "date", limit: 2 })).resolves.toEqual([]);
    expect(fixture.find).toHaveBeenCalledExactlyOnceWith(
      { eventId: id, "payload.kind": "date" },
      { projection: { _id: 0 } },
    );
    expect(fixture.cursor.limit).toHaveBeenCalledWith(3);
  });

  it("propagates a failed proposal write rather than returning a success receipt", async () => {
    const fixture = setup();
    const error = new Error("duplicate request");
    fixture.replaceOne.mockRejectedValueOnce(error);
    await expect(fixture.repo.saveProposal(proposal)).rejects.toBe(error);
  });
});
