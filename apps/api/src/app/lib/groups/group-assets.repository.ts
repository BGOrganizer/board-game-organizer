import type { GroupAsset } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "../db";

export class GroupAssetsRepository {
  private assets;
  private opts;
  constructor(db: Db, session?: ClientSession) {
    this.assets = db.collection<GroupAsset>(COLLECTIONS.GROUP_ASSETS);
    this.opts = session ? { session } : {};
  }
  find(id: string) {
    return this.assets.findOne({ id }, { ...this.opts, projection: { _id: 0 } });
  }
  expireUnused(id: string, groupId: string) {
    return this.assets.updateOne(
      { id, groupId, status: "READY" },
      { $set: { expiresAt: new Date() }, $unset: { groupId: "" } },
      this.opts,
    );
  }
  countUnclaimed(ownerUserId: string) {
    return this.assets.countDocuments(
      { ownerUserId, groupId: { $exists: false }, expiresAt: { $gt: new Date() } },
      this.opts,
    );
  }
  async create(asset: GroupAsset) {
    await this.assets.insertOne(asset, this.opts);
    return asset;
  }
  append(id: string, ownerUserId: string, offset: number, base64: string, byteLength: number) {
    return this.assets.findOneAndUpdate(
      {
        id,
        ownerUserId,
        status: "UPLOADING",
        receivedBytes: offset,
        byteLength: { $gte: offset + byteLength },
        expiresAt: { $gt: new Date() },
      },
      { $push: { chunks: { offset, base64 } }, $inc: { receivedBytes: byteLength } },
      { ...this.opts, returnDocument: "after", projection: { _id: 0 } },
    );
  }
  ready(
    id: string,
    ownerUserId: string,
    byteLength: number,
    prepared: Pick<GroupAsset, "base64" | "previewBase64" | "thumbnailBase64">,
  ) {
    return this.assets.findOneAndUpdate(
      {
        id,
        ownerUserId,
        status: "UPLOADING",
        receivedBytes: byteLength,
        expiresAt: { $gt: new Date() },
      },
      { $set: { ...prepared, status: "READY", mimeType: "image/webp" }, $unset: { chunks: "" } },
      { ...this.opts, returnDocument: "after", projection: { _id: 0 } },
    );
  }
  claim(id: string, ownerUserId: string, groupId: string) {
    return this.assets.findOneAndUpdate(
      {
        id,
        ownerUserId,
        status: "READY",
        $and: [
          { $or: [{ groupId: { $exists: false } }, { groupId }] },
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
        ],
      },
      { $set: { groupId }, $unset: { expiresAt: "" } },
      { ...this.opts, returnDocument: "after", projection: { _id: 0 } },
    );
  }
}
