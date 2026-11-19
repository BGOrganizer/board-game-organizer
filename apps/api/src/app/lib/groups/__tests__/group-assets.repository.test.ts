import type { GroupAsset } from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { GroupAssetsRepository } from "../group-assets.repository";

const now = new Date("2026-11-18T12:00:00.000Z");
const asset: GroupAsset = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerUserId: "user_owner",
  mimeType: "image/png",
  byteLength: 12,
  receivedBytes: 0,
  status: "UPLOADING",
  base64: "",
  createdAt: now.toISOString(),
  expiresAt: new Date("2026-11-18T13:00:00.000Z"),
};
const groupId = "00000000-0000-4000-8000-000000000002";

function setup(session?: ClientSession) {
  const collection = {
    findOne: vi.fn(async (): Promise<GroupAsset | null> => null),
    findOneAndUpdate: vi.fn(
      async (
        _filter: Document,
        _update: Document,
        _options: Document,
      ): Promise<GroupAsset | null> => null,
    ),
    updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
    countDocuments: vi.fn(async () => 2),
    insertOne: vi.fn(async () => ({ acknowledged: true })),
  };
  const db = { collection: vi.fn(() => collection) };
  return { ...collection, db, repo: new GroupAssetsRepository(db as unknown as Db, session) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe("GroupAssetsRepository guarded upload writes", () => {
  it.each([false, true])(
    "preserves find/create/count/expiry filters with session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const opts = session ? { session } : {};
      const fixture = setup(session);
      fixture.findOne.mockResolvedValueOnce(asset);
      await expect(fixture.repo.find(asset.id)).resolves.toBe(asset);
      await expect(fixture.repo.find("missing")).resolves.toBeNull();
      expect(fixture.findOne).toHaveBeenCalledWith(
        { id: asset.id },
        { ...opts, projection: { _id: 0 } },
      );
      await expect(fixture.repo.create(asset)).resolves.toBe(asset);
      expect(fixture.insertOne).toHaveBeenCalledExactlyOnceWith(asset, opts);
      await expect(fixture.repo.countUnclaimed("user_owner")).resolves.toBe(2);
      expect(fixture.countDocuments).toHaveBeenCalledExactlyOnceWith(
        { ownerUserId: "user_owner", groupId: { $exists: false }, expiresAt: { $gt: now } },
        opts,
      );
      await fixture.repo.expireUnused(asset.id, groupId);
      expect(fixture.updateOne).toHaveBeenCalledExactlyOnceWith(
        { id: asset.id, groupId, status: "READY" },
        { $set: { expiresAt: now }, $unset: { groupId: "" } },
        opts,
      );
      expect(fixture.db.collection).toHaveBeenCalledExactlyOnceWith(COLLECTIONS.GROUP_ASSETS);
    },
  );

  it("atomically appends only an owned, unexpired upload at the expected offset with enough capacity", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const advanced = {
      ...asset,
      receivedBytes: 8,
      chunks: [
        { offset: 0, base64: "YWJjZA==" },
        { offset: 4, base64: "Ynl0ZXM=" },
      ],
    };
    fixture.findOneAndUpdate.mockResolvedValueOnce(advanced);
    await expect(fixture.repo.append(asset.id, "user_owner", 4, "Ynl0ZXM=", 4)).resolves.toBe(
      advanced,
    );
    expect(fixture.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
      {
        id: asset.id,
        ownerUserId: "user_owner",
        status: "UPLOADING",
        receivedBytes: 4,
        byteLength: { $gte: 8 },
        expiresAt: { $gt: now },
      },
      { $push: { chunks: { offset: 4, base64: "Ynl0ZXM=" } }, $inc: { receivedBytes: 4 } },
      { session, returnDocument: "after", projection: { _id: 0 } },
    );
    await expect(fixture.repo.append(asset.id, "user_other", 0, "YQ==", 1)).resolves.toBeNull();
  });

  it("finalizes only a fully received owned upload and removes temporary chunks", async () => {
    const fixture = setup();
    const prepared = { base64: "full", previewBase64: "preview", thumbnailBase64: "thumb" };
    const ready = {
      ...asset,
      ...prepared,
      receivedBytes: 12,
      status: "READY" as const,
      mimeType: "image/webp" as const,
    };
    fixture.findOneAndUpdate.mockResolvedValueOnce(ready);
    await expect(fixture.repo.ready(asset.id, "user_owner", 12, prepared)).resolves.toBe(ready);
    expect(fixture.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
      {
        id: asset.id,
        ownerUserId: "user_owner",
        status: "UPLOADING",
        receivedBytes: 12,
        expiresAt: { $gt: now },
      },
      { $set: { ...prepared, status: "READY", mimeType: "image/webp" }, $unset: { chunks: "" } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  });

  it("claims a ready asset only for its owner and the same/unassigned group before expiry", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const claimed = {
      ...asset,
      groupId,
      receivedBytes: 12,
      status: "READY" as const,
      mimeType: "image/webp" as const,
    };
    delete claimed.expiresAt;
    fixture.findOneAndUpdate.mockResolvedValueOnce(claimed);
    await expect(fixture.repo.claim(asset.id, "user_owner", groupId)).resolves.toBe(claimed);
    expect(fixture.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
      {
        id: asset.id,
        ownerUserId: "user_owner",
        status: "READY",
        $and: [
          { $or: [{ groupId: { $exists: false } }, { groupId }] },
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
        ],
      },
      { $set: { groupId }, $unset: { expiresAt: "" } },
      { session, returnDocument: "after", projection: { _id: 0 } },
    );
    await expect(fixture.repo.claim(asset.id, "user_other", groupId)).resolves.toBeNull();
  });

  it("does not turn failed inserts or guarded writes into successful asset transitions", async () => {
    const fixture = setup();
    const error = new Error("transaction aborted");
    fixture.insertOne.mockRejectedValueOnce(error);
    fixture.findOneAndUpdate.mockRejectedValueOnce(error);
    await expect(fixture.repo.create(asset)).rejects.toBe(error);
    await expect(fixture.repo.claim(asset.id, "user_owner", groupId)).rejects.toBe(error);
  });
});
