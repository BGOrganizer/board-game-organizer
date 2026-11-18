import type { Group, GroupInvitation } from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { GroupsRepository } from "../groups.repository";

const id = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";
const now = "2026-11-18T12:00:00.000Z";
const createdAt = "2026-11-17T10:00:00.000Z";
const group: Group = {
  id,
  adminUserId: "user_admin",
  name: "Legacy group",
  isPublic: true,
  createdAt,
  updatedAt: createdAt,
};
const membership: GroupInvitation = {
  id: invitationId,
  groupId: id,
  inviterUserId: "user_admin",
  inviteeUserId: "user_member",
  status: "ACCEPTED",
  createdAt,
  updatedAt: createdAt,
};

function setup(session?: ClientSession) {
  const rows: Group[] = [group];
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn(async () => rows),
  };
  const groups = {
    find: vi.fn((_filter: Document, _options: Document) => cursor),
    findOneAndUpdate: vi.fn(
      async (_filter: Document, _update: Document, _options: Document): Promise<Group | null> =>
        null,
    ),
  };
  const invitations = {
    countDocuments: vi.fn(async (_filter: Document, _options: Document) => 3),
    findOne: vi.fn(
      async (_filter: Document, _options: Document): Promise<GroupInvitation | null> => null,
    ),
    find: vi.fn((_filter: Document, _options: Document) => ({
      toArray: async () => [{ inviteeUserId: membership.inviteeUserId }],
    })),
  };
  const db = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.GROUPS) return groups;
      if (name === COLLECTIONS.GROUP_INVITATIONS) return invitations;
      throw new Error(`Unexpected retained repository collection: ${name}`);
    }),
  };
  // The only substitute is the Mongo driver port; every repository method is real.
  return {
    groups,
    invitations,
    cursor,
    rows,
    db,
    repo: new GroupsRepository(db as unknown as Db, session),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("retained GroupsRepository Mongo port contracts (unit, not replica-set acceptance)", () => {
  it.each([undefined, "", createdAt, `|${id}`, `${createdAt}|`])(
    "keeps an absent or incomplete public cursor (%s) out of the bounded discovery filter",
    async (cursor) => {
      const fixture = setup();
      await expect(fixture.repo.listPublic({ cursor, limit: 2 })).resolves.toBe(fixture.rows);
      expect(fixture.db.collection).toHaveBeenCalledExactlyOnceWith(COLLECTIONS.GROUPS);
      expect(fixture.groups.find).toHaveBeenCalledExactlyOnceWith(
        {
          isPublic: true,
          archivedAt: { $exists: false },
          name: { $regex: "", $options: "i" },
        },
        { projection: { _id: 0, membershipRevision: 0 } },
      );
      expect(fixture.cursor.sort).toHaveBeenCalledExactlyOnceWith({ createdAt: -1, id: -1 });
      expect(fixture.cursor.limit).toHaveBeenCalledExactlyOnceWith(3);
      expect(fixture.cursor.toArray).toHaveBeenCalledOnce();
    },
  );

  it.each([false, true])(
    "escapes public discovery text and preserves cursor tie-breakers/session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const fixture = setup(session);
      await expect(
        fixture.repo.listPublic({ query: "A.*[B]", cursor: `${createdAt}|${id}`, limit: 8 }),
      ).resolves.toBe(fixture.rows);
      expect(fixture.groups.find).toHaveBeenCalledExactlyOnceWith(
        {
          isPublic: true,
          archivedAt: { $exists: false },
          name: { $regex: "A\\.\\*\\[B\\]", $options: "i" },
          $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }],
        },
        { projection: { _id: 0, membershipRevision: 0 }, ...(session ? { session } : {}) },
      );
      expect(fixture.cursor.sort).toHaveBeenCalledExactlyOnceWith({ createdAt: -1, id: -1 });
      expect(fixture.cursor.limit).toHaveBeenCalledExactlyOnceWith(9);
      expect(fixture.invitations.find).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "counts only accepted invitations in the requested group/session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const fixture = setup(session);
      const count = transactional ? 3 : 0;
      fixture.invitations.countDocuments.mockResolvedValueOnce(count);
      await expect(fixture.repo.countAccepted(id)).resolves.toBe(count);
      expect(fixture.db.collection).toHaveBeenCalledExactlyOnceWith(COLLECTIONS.GROUP_INVITATIONS);
      expect(fixture.invitations.countDocuments).toHaveBeenCalledExactlyOnceWith(
        { groupId: id, status: "ACCEPTED" },
        session ? { session } : {},
      );
      expect(fixture.groups.find).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "looks up only the exact user's accepted membership/session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const fixture = setup(session);
      const result = transactional ? membership : null;
      fixture.invitations.findOne.mockResolvedValueOnce(result);
      await expect(fixture.repo.findMembership(id, "user_member")).resolves.toBe(result);
      expect(fixture.invitations.findOne).toHaveBeenCalledExactlyOnceWith(
        { groupId: id, inviteeUserId: "user_member", status: "ACCEPTED" },
        { projection: { _id: 0 }, ...(session ? { session } : {}) },
      );
      expect(fixture.db.collection).toHaveBeenCalledExactlyOnceWith(COLLECTIONS.GROUP_INVITATIONS);
    },
  );

  it.each([false, true])(
    "updates only an unarchived group owned by the caller and returns the driver result/session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const fixture = setup(session);
      const updated = { ...group, name: "Renamed legacy group", isPublic: false, updatedAt: now };
      const result = transactional ? updated : null;
      fixture.groups.findOneAndUpdate.mockResolvedValueOnce(result);
      await expect(fixture.repo.update(id, "user_admin", updated.name, false)).resolves.toBe(
        result,
      );
      expect(fixture.groups.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
        { id, adminUserId: "user_admin", archivedAt: { $exists: false } },
        { $set: { name: updated.name, isPublic: false, updatedAt: now } },
        {
          returnDocument: "after",
          projection: { _id: 0, membershipRevision: 0 },
          ...(session ? { session } : {}),
        },
      );
      expect(fixture.db.collection).toHaveBeenCalledExactlyOnceWith(COLLECTIONS.GROUPS);
      expect(fixture.invitations.findOne).not.toHaveBeenCalled();
    },
  );

  it("does not query Mongo for an empty accepted-member subset", async () => {
    const fixture = setup();
    await expect(fixture.repo.listAcceptedMembers(id, [])).resolves.toEqual([]);
    expect(fixture.db.collection).not.toHaveBeenCalled();
    expect(fixture.invitations.find).not.toHaveBeenCalled();
  });

  it("keeps nonempty accepted-member lookup scoped by group, users and transaction", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    await expect(fixture.repo.listAcceptedMembers(id, ["user_member"])).resolves.toEqual([
      { inviteeUserId: "user_member" },
    ]);
    expect(fixture.invitations.find).toHaveBeenCalledExactlyOnceWith(
      { groupId: id, inviteeUserId: { $in: ["user_member"] }, status: "ACCEPTED" },
      { projection: { inviteeUserId: 1, _id: 0 }, session },
    );
  });

  it("propagates a failed public cursor read instead of reporting empty discovery success", async () => {
    const fixture = setup();
    const failure = new Error("Mongo cursor read failed");
    fixture.cursor.toArray.mockRejectedValueOnce(failure);
    await expect(fixture.repo.listPublic({ limit: 2 })).rejects.toBe(failure);
    expect(fixture.cursor.limit).toHaveBeenCalledExactlyOnceWith(3);
  });
});
