import { randomUUID } from "node:crypto";
import {
  GROUP_LOGO_CHUNK_BYTES,
  type GroupAsset,
  type StartGroupLogoInput,
  type UploadGroupLogoChunkInput,
} from "@board-game-organizer/schemas";
import { canReadGroup } from "@board-game-organizer/shared";
import { logoUploadQuotaEnabled } from "../community/logo-upload-policy";
import { CommunityError } from "../community.error";
import { requireBgoModerator } from "../organizations/community-role";
import { prepareOrganizationLogo } from "../organizations/organization-logo";
import type { UsersRepository } from "../users/users.repository";
import type { GroupAssetsRepository } from "./group-assets.repository";
import type { GroupRecordsRepository } from "./group-records.repository";

export class GroupAssetsService {
  constructor(
    private assets: GroupAssetsRepository,
    private groups: GroupRecordsRepository,
    private users: UsersRepository,
  ) {}
  async start(userId: string, input: StartGroupLogoInput) {
    await this.users.lock(userId);
    if (logoUploadQuotaEnabled() && (await this.assets.countUnclaimed(userId)) >= 5)
      throw new CommunityError(429, "TOO_MANY_LOGO_UPLOADS");
    const asset: GroupAsset = {
      id: randomUUID(),
      ownerUserId: userId,
      ...input,
      receivedBytes: 0,
      status: "UPLOADING",
      base64: "",
      chunks: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    await this.assets.create(asset);
    return { id: asset.id, receivedBytes: 0 };
  }
  private async owned(userId: string, id: string) {
    const asset = await this.assets.find(id);
    if (
      !asset ||
      asset.ownerUserId !== userId ||
      (asset.expiresAt && asset.expiresAt.getTime() <= Date.now())
    )
      throw new CommunityError(404, "LOGO_NOT_FOUND");
    return asset;
  }
  async append(userId: string, id: string, input: UploadGroupLogoChunkInput) {
    const asset = await this.owned(userId, id);
    if (asset.status !== "UPLOADING") throw new CommunityError(409, "LOGO_ALREADY_COMPLETE");
    const bytes = Buffer.from(input.base64, "base64");
    if (
      bytes.length === 0 ||
      bytes.length > GROUP_LOGO_CHUNK_BYTES ||
      bytes.toString("base64") !== input.base64 ||
      input.offset + bytes.length > asset.byteLength
    )
      throw new CommunityError(400, "INVALID_LOGO_CHUNK");
    const previous = asset.chunks?.find((chunk) => chunk.offset === input.offset);
    if (previous?.base64 === input.base64) return { id, receivedBytes: asset.receivedBytes };
    if (input.offset !== asset.receivedBytes)
      throw new CommunityError(409, "LOGO_UPLOAD_OFFSET_MISMATCH");
    const updated = await this.assets.append(id, userId, input.offset, input.base64, bytes.length);
    if (!updated) throw new CommunityError(409, "LOGO_UPLOAD_OFFSET_MISMATCH");
    return { id, receivedBytes: updated.receivedBytes };
  }
  async complete(userId: string, id: string) {
    const asset = await this.owned(userId, id);
    if (asset.status === "READY")
      return { id, preview: `data:image/webp;base64,${asset.previewBase64}` };
    if (asset.receivedBytes !== asset.byteLength)
      throw new CommunityError(409, "LOGO_UPLOAD_INCOMPLETE");
    const bytes = Buffer.concat(
      (asset.chunks ?? []).map((chunk) => Buffer.from(chunk.base64, "base64")),
    );
    if (bytes.length !== asset.byteLength) throw new CommunityError(409, "LOGO_UPLOAD_INCOMPLETE");
    const prepared = await prepareOrganizationLogo(bytes, asset.mimeType);
    const ready = await this.assets.ready(id, userId, asset.byteLength, prepared);
    if (!ready) throw new CommunityError(409, "LOGO_UPLOAD_CHANGED");
    return { id, preview: `data:image/webp;base64,${ready.previewBase64}` };
  }
  async preview(userId: string, id: string) {
    const asset = await this.assets.find(id);
    if (asset?.status !== "READY" || (asset.expiresAt && asset.expiresAt.getTime() <= Date.now()))
      throw new CommunityError(404, "LOGO_NOT_FOUND");
    if (asset.ownerUserId !== userId) {
      const group = asset.groupId ? await this.groups.find(asset.groupId) : null;
      if (!group) throw new CommunityError(404, "LOGO_NOT_FOUND");
      if (group.approved?.logoAssetId === id) {
        const membership = await this.groups.membership(group.id, userId);
        const ban = await this.groups.ban(group.id, userId);
        if (!canReadGroup(group, userId, membership, ban, Date.now()))
          throw new CommunityError(404, "LOGO_NOT_FOUND");
      } else {
        if (group.type !== "PUBLIC" || group.proposal?.logoAssetId !== id)
          throw new CommunityError(404, "LOGO_NOT_FOUND");
        await requireBgoModerator(userId);
      }
    }
    return { id, preview: `data:image/webp;base64,${asset.previewBase64}` };
  }
}
