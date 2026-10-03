import { describe, expect, it, vi } from "vitest";
import { MatchInvitationsRepository } from "@/app/lib/match-invitations.repository";

function setup() {
  const cursor = {
    sort: vi.fn(function sort() {
      return cursor;
    }),
    toArray: vi.fn(async () => []),
  };
  const collection = {
    insertOne: vi.fn(async () => ({ insertedId: "id" })),
    findOne: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
    find: vi.fn(() => cursor),
    countDocuments: vi.fn(async () => 2),
    findOneAndUpdate: vi.fn(async () => ({ id: "updated" })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    deleteMany: vi.fn(async () => ({ deletedCount: 3 })),
  };
  return { db: { collection: vi.fn(() => collection) }, collection, cursor };
}

describe("MatchInvitationsRepository", () => {
  it("creates one invitation", async () => {
    const { db, collection } = setup();
    const invitation = await new MatchInvitationsRepository(db as never).create(
      "match-id",
      "user_admin",
      "user_guest",
    );
    expect(invitation).toMatchObject({
      matchId: "match-id",
      inviterUserId: "user_admin",
      inviteeUserId: "user_guest",
      status: "PENDING",
    });
    expect(invitation.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(invitation.createdAt).toBe(invitation.updatedAt);
    expect(collection.insertOne).toHaveBeenCalledWith(invitation, {});
  });

  it("creates invitations sequentially with session", async () => {
    const { db, collection } = setup();
    const session = { id: "session" };
    const repo = new MatchInvitationsRepository(db as never, session as never);
    const invitations = await repo.createMany("match-id", "user_admin", ["user_a", "user_b"]);
    expect(invitations).toHaveLength(2);
    expect(collection.insertOne).toHaveBeenNthCalledWith(1, invitations[0], { session });
    expect(collection.insertOne).toHaveBeenNthCalledWith(2, invitations[1], { session });
  });

  it("finds invitations by id and by match/invitee", async () => {
    const { db, collection } = setup();
    collection.findOne.mockResolvedValue({ id: "invitation" });
    const repo = new MatchInvitationsRepository(db as never);
    await expect(repo.findById("invitation")).resolves.toEqual({ id: "invitation" });
    await repo.findByMatchAndInvitee("match-id", "user_guest");
    expect(collection.findOne).toHaveBeenNthCalledWith(
      1,
      { id: "invitation" },
      { projection: { _id: 0 } },
    );
    expect(collection.findOne).toHaveBeenNthCalledWith(
      2,
      { matchId: "match-id", inviteeUserId: "user_guest" },
      { projection: { _id: 0 } },
    );
  });

  it("lists by match, match ids, and invitee with stable sorting", async () => {
    const { db, collection, cursor } = setup();
    const repo = new MatchInvitationsRepository(db as never);
    await repo.listByMatch("match-id");
    expect(collection.find).toHaveBeenNthCalledWith(
      1,
      { matchId: "match-id" },
      { projection: { _id: 0 } },
    );
    expect(cursor.sort).toHaveBeenNthCalledWith(1, { createdAt: 1 });

    await repo.listByMatchIds(["match-id"]);
    expect(collection.find).toHaveBeenNthCalledWith(
      2,
      { matchId: { $in: ["match-id"] } },
      { projection: { _id: 0 } },
    );
    expect(cursor.sort).toHaveBeenNthCalledWith(2, { createdAt: 1 });

    await repo.listByInvitee("user_guest");
    expect(collection.find).toHaveBeenNthCalledWith(
      3,
      { inviteeUserId: "user_guest" },
      { projection: { _id: 0 } },
    );
    expect(cursor.sort).toHaveBeenNthCalledWith(3, { createdAt: -1 });
  });

  it("counts every occupied invitation position", async () => {
    const { db, collection } = setup();
    await expect(
      new MatchInvitationsRepository(db as never).countByMatch("match-id"),
    ).resolves.toBe(2);
    expect(collection.countDocuments).toHaveBeenCalledWith({ matchId: "match-id" }, {});
  });

  it("accepts and declines pending invitations", async () => {
    const { db, collection } = setup();
    const repo = new MatchInvitationsRepository(db as never);
    await repo.respond("invitation", "ACCEPTED");
    await repo.respond("invitation", "DECLINED");
    expect(collection.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { id: "invitation", status: "PENDING" },
      {
        $set: {
          status: "ACCEPTED",
          respondedAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      },
      { returnDocument: "after" },
    );
    expect(collection.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { id: "invitation", status: "PENDING" },
      {
        $set: {
          status: "DECLINED",
          respondedAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      },
      { returnDocument: "after" },
    );
  });

  it("deletes only an accepted invitation owned by invitee", async () => {
    const { db, collection } = setup();
    await new MatchInvitationsRepository(db as never).deleteAccepted("invitation", "user_guest");
    expect(collection.deleteOne).toHaveBeenCalledWith(
      { id: "invitation", inviteeUserId: "user_guest", status: "ACCEPTED" },
      {},
    );
  });

  it("lets admin remove one invitation from a match", async () => {
    const { db, collection } = setup();
    await new MatchInvitationsRepository(db as never).deleteByIdForMatch("invitation", "match-id");
    expect(collection.deleteOne).toHaveBeenCalledWith(
      { id: "invitation", matchId: "match-id" },
      {},
    );
  });

  it("deletes every invitation for a deleted match", async () => {
    const { db, collection } = setup();
    await new MatchInvitationsRepository(db as never).deleteAllByMatch("match-id");
    expect(collection.deleteMany).toHaveBeenCalledWith({ matchId: "match-id" }, {});
  });
});
