import type { OrganizationAsset } from "@board-game-organizer/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), moderator: vi.fn() }));
vi.mock("../organization-logo", () => ({ prepareOrganizationLogo: mocks.prepare }));
vi.mock("../community-role", () => ({ requireBgoModerator: mocks.moderator }));

import { OrganizationAssetsService } from "../organization-assets.service";

const id = "11111111-1111-4111-8111-111111111111";
const owner = "user_owner";
const asset: OrganizationAsset = {
  id,
  ownerUserId: owner,
  mimeType: "image/png",
  byteLength: 3,
  receivedBytes: 0,
  base64: "",
  chunks: [],
  status: "UPLOADING",
  createdAt: "2027-01-01T00:00:00Z",
};
const ready = {
  ...asset,
  status: "READY" as const,
  previewBase64: "preview",
  thumbnailBase64: "thumb",
};
const assets = {
  find: vi.fn(),
  countUnclaimed: vi.fn(),
  create: vi.fn(),
  append: vi.fn(),
  ready: vi.fn(),
};
const organizations = { find: vi.fn() };
const users = { lock: vi.fn() };
const service = new OrganizationAssetsService(
  assets as unknown as ConstructorParameters<typeof OrganizationAssetsService>[0],
  organizations as unknown as ConstructorParameters<typeof OrganizationAssetsService>[1],
  users as unknown as ConstructorParameters<typeof OrganizationAssetsService>[2],
);
beforeEach(() => {
  vi.resetAllMocks();
  assets.find.mockResolvedValue(asset);
  assets.countUnclaimed.mockResolvedValue(0);
  assets.append.mockResolvedValue({ ...asset, receivedBytes: 3 });
  assets.ready.mockResolvedValue(ready);
  mocks.prepare.mockResolvedValue({
    base64: "optimized",
    previewBase64: "preview",
    thumbnailBase64: "thumb",
  });
});

describe("bounded private logo uploads", () => {
  it("serializes owner quota and expires incomplete uploads", async () => {
    const result = await service.start(owner, { mimeType: "image/png", byteLength: 3 });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.receivedBytes).toBe(0);
    expect(users.lock).toHaveBeenCalledWith(owner);
    expect(users.lock.mock.invocationCallOrder[0]).toBeLessThan(
      assets.countUnclaimed.mock.invocationCallOrder[0] ?? 0,
    );
    expect(assets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: owner,
        status: "UPLOADING",
        chunks: [],
        expiresAt: expect.any(Date),
      }),
    );
    assets.countUnclaimed.mockResolvedValue(5);
    await expect(
      service.start(owner, { mimeType: "image/png", byteLength: 3 }),
    ).rejects.toMatchObject({ status: 429 });
    expect(assets.create).toHaveBeenCalledTimes(1);
  });
  it("rejects missing, foreign and expired upload identifiers", async () => {
    for (const row of [
      null,
      { ...asset, ownerUserId: "foreign" },
      { ...asset, expiresAt: new Date(0) },
    ]) {
      assets.find.mockResolvedValue(row);
      await expect(service.append(owner, id, { offset: 0, base64: "YWJj" })).rejects.toMatchObject({
        status: 404,
      });
    }
  });
  it("accepts only exact, bounded, canonical chunks at the expected offset", async () => {
    expect(await service.append(owner, id, { offset: 0, base64: "YWJj" })).toEqual({
      id,
      receivedBytes: 3,
    });
    expect(assets.append).toHaveBeenCalledWith(id, owner, 0, "YWJj", 3);
    for (const input of [
      { offset: 0, base64: "" },
      { offset: 0, base64: "AB==" },
      { offset: 0, base64: Buffer.alloc(256_001).toString("base64") },
      { offset: 2, base64: "YWJj" },
    ])
      await expect(service.append(owner, id, input)).rejects.toMatchObject({ status: 400 });
    assets.find.mockResolvedValue({ ...asset, expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.append(owner, id, { offset: 1, base64: "YQ==" })).rejects.toMatchObject({
      status: 409,
    });
    assets.append.mockResolvedValue(null);
    await expect(service.append(owner, id, { offset: 0, base64: "YWJj" })).rejects.toMatchObject({
      status: 409,
    });
  });
  it("retries identical chunks idempotently but never overwrites previous bytes", async () => {
    assets.find.mockResolvedValue({
      ...asset,
      receivedBytes: 3,
      chunks: [{ offset: 0, base64: "YWJj" }],
    });
    expect(await service.append(owner, id, { offset: 0, base64: "YWJj" })).toEqual({
      id,
      receivedBytes: 3,
    });
    expect(assets.append).not.toHaveBeenCalled();
    await expect(service.append(owner, id, { offset: 0, base64: "ZGVm" })).rejects.toMatchObject({
      status: 409,
    });
    assets.find.mockResolvedValue(ready);
    await expect(service.append(owner, id, { offset: 0, base64: "YWJj" })).rejects.toMatchObject({
      status: 409,
    });
  });
  it("assembles exact bytes, validates/optimizes server-side and completes once", async () => {
    assets.find.mockResolvedValue({
      ...asset,
      receivedBytes: 3,
      chunks: [{ offset: 0, base64: "YWJj" }],
    });
    expect(await service.complete(owner, id)).toEqual({
      id,
      preview: "data:image/webp;base64,preview",
    });
    expect(mocks.prepare).toHaveBeenCalledWith(Buffer.from("abc"), "image/png");
    expect(assets.ready).toHaveBeenCalledWith(
      id,
      owner,
      3,
      expect.objectContaining({ base64: "optimized" }),
    );
    assets.find.mockResolvedValue(ready);
    await service.complete(owner, id);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });
  it("rejects incomplete/corrupt snapshots, changed uploads and invalid images", async () => {
    await expect(service.complete(owner, id)).rejects.toMatchObject({ status: 409 });
    assets.find.mockResolvedValue({ ...asset, receivedBytes: 3 });
    await expect(service.complete(owner, id)).rejects.toMatchObject({ status: 409 });
    assets.find.mockResolvedValue({ ...asset, receivedBytes: 3, chunks: undefined });
    await expect(service.complete(owner, id)).rejects.toMatchObject({ status: 409 });
    assets.find.mockResolvedValue({
      ...asset,
      receivedBytes: 3,
      chunks: [{ offset: 0, base64: "YWJj" }],
    });
    assets.ready.mockResolvedValue(null);
    await expect(service.complete(owner, id)).rejects.toMatchObject({ status: 409 });
    const invalid = new Error("Invalid image");
    mocks.prepare.mockRejectedValue(invalid);
    await expect(service.complete(owner, id)).rejects.toBe(invalid);
  });
  it("keeps proposal images private but exposes approved previews to authenticated viewers", async () => {
    for (const row of [null, asset, { ...ready, expiresAt: new Date(0) }]) {
      assets.find.mockResolvedValue(row);
      await expect(service.preview(owner, id)).rejects.toMatchObject({ status: 404 });
    }
    assets.find.mockResolvedValue({ ...ready, expiresAt: new Date(Date.now() + 60_000) });
    expect(await service.preview(owner, id)).toEqual({
      id,
      preview: "data:image/webp;base64,preview",
    });
    await service.preview("user_viewer", id);
    expect(mocks.moderator).toHaveBeenCalledWith("user_viewer");
    assets.find.mockResolvedValue({ ...ready, organizationId: id });
    organizations.find.mockResolvedValue({ approved: { logoAssetId: id } });
    mocks.moderator.mockClear();
    await service.preview("user_viewer", id);
    expect(mocks.moderator).not.toHaveBeenCalled();
    organizations.find.mockResolvedValue(null);
    await service.preview("user_viewer", id);
    expect(mocks.moderator).toHaveBeenCalledTimes(1);
    mocks.moderator.mockRejectedValue(new Error("Denied"));
    await expect(service.preview("user_viewer", id)).rejects.toThrow("Denied");
  });
});
