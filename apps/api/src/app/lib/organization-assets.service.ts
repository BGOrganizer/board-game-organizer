import { randomUUID } from "node:crypto";
import {
  ORGANIZATION_LOGO_CHUNK_BYTES,
  type OrganizationAsset,
  type StartOrganizationLogoInput,
  type UploadOrganizationLogoChunkInput,
} from "@board-game-organizer/schemas";
import { CommunityError } from "./community.error";
import { requireBgoModerator } from "./community-role";
import type { OrganizationAssetsRepository } from "./organization-assets.repository";
import { prepareOrganizationLogo } from "./organization-logo";
import type { OrganizationsRepository } from "./organizations.repository";
import type { UsersRepository } from "./users.repository";

export class OrganizationAssetsService {
  constructor(
    private assets: OrganizationAssetsRepository,
    private organizations: OrganizationsRepository,
    private users: UsersRepository,
  ) {}

  async start(userId: string, input: StartOrganizationLogoInput) {
    await this.users.lock(userId);
    if ((await this.assets.countUnclaimed(userId)) >= 5)
      throw new CommunityError(429, "TOO_MANY_LOGO_UPLOADS");
    const asset: OrganizationAsset = {
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
    ) {
      throw new CommunityError(404, "LOGO_NOT_FOUND");
    }
    return asset;
  }

  async append(userId: string, id: string, input: UploadOrganizationLogoChunkInput) {
    const asset = await this.owned(userId, id);
    if (asset.status !== "UPLOADING") throw new CommunityError(409, "LOGO_ALREADY_COMPLETE");
    const bytes = Buffer.from(input.base64, "base64");
    if (
      bytes.length === 0 ||
      bytes.length > ORGANIZATION_LOGO_CHUNK_BYTES ||
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
    if (asset?.status !== "READY" || (asset.expiresAt && asset.expiresAt.getTime() <= Date.now())) {
      throw new CommunityError(404, "LOGO_NOT_FOUND");
    }
    if (asset.ownerUserId !== userId) {
      const organization = asset.organizationId
        ? await this.organizations.find(asset.organizationId)
        : null;
      if (organization?.approved?.logoAssetId !== id) await requireBgoModerator(userId);
    }
    return { id, preview: `data:image/webp;base64,${asset.previewBase64}` };
  }
}
