import {
  GROUP_LOGO_CHUNK_BYTES,
  type GroupAsset,
  type GroupBan,
  type GroupMembership,
  type GroupRecord,
  groupAssetSchema,
  groupRecordSchema,
} from "@board-game-organizer/schemas";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupAssetsService } from "../group-assets.service";

const clerk = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser: clerk.getUser } }),
}));

const now = new Date("2026-11-18T12:00:00.000Z");
const owner = "user_owner";
const viewer = "user_viewer";
const id = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const at = now.toISOString();
const upload: GroupAsset = {
  id,
  ownerUserId: owner,
  mimeType: "image/png",
  byteLength: 3,
  receivedBytes: 0,
  status: "UPLOADING",
  base64: "",
  chunks: [],
  createdAt: at,
  expiresAt: new Date(now.getTime() + 60_000),
};
const ready: GroupAsset = {
  ...upload,
  status: "READY",
  mimeType: "image/webp",
  receivedBytes: 3,
  base64: Buffer.from("normalized").toString("base64"),
  previewBase64: Buffer.from("preview").toString("base64"),
  thumbnailBase64: Buffer.from("thumbnail").toString("base64"),
};
const preview = { id, preview: `data:image/webp;base64,${ready.previewBase64}` };
function group(type: "PRIVATE" | "PUBLIC" = "PRIVATE", proposal = false): GroupRecord {
  const revision = {
    name: "Board game club",
    logoAssetId: id,
    ...(type === "PUBLIC"
      ? {
          location: {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Game venue",
            address: "Fixture address",
            latitude: 45,
            longitude: 9,
            timeZone: "Europe/Rome",
          },
        }
      : {}),
  };
  return groupRecordSchema.parse({
    id: groupId,
    adminUserId: "user_group_admin",
    type,
    ...(proposal ? { proposal: revision, reviewStatus: "PENDING" } : { approved: revision }),
    reservedNames: type === "PUBLIC" ? ["board game club"] : [],
    version: 1,
    createdAt: at,
    updatedAt: at,
  });
}
function membership(
  status: GroupMembership["status"] = "ACCEPTED",
  role: GroupMembership["role"] = "MEMBER",
  kind: GroupMembership["kind"] = "INVITATION",
): GroupMembership {
  return {
    id,
    groupId,
    userId: viewer,
    status,
    role,
    kind,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}
const ban: GroupBan = {
  id,
  groupId,
  userId: viewer,
  adminUserId: "user_group_admin",
  until: null,
  createdAt: at,
  updatedAt: at,
};
function setup(asset: GroupAsset | null = upload) {
  const assets = {
    find: vi.fn(async (_id: string): Promise<GroupAsset | null> => asset),
    countUnclaimed: vi.fn(async (_owner: string) => 4),
    create: vi.fn(async (value: GroupAsset) => value),
    append: vi.fn(
      async (
        _id: string,
        _owner: string,
        _offset: number,
        _base64: string,
        _bytes: number,
      ): Promise<GroupAsset | null> => ({ ...upload, receivedBytes: 3 }),
    ),
    ready: vi.fn(
      async (
        _id: string,
        _owner: string,
        _bytes: number,
        prepared: Pick<GroupAsset, "base64" | "previewBase64" | "thumbnailBase64">,
      ): Promise<GroupAsset | null> => ({ ...ready, ...prepared }),
    ),
  };
  const groups = {
    find: vi.fn(async (_id: string): Promise<GroupRecord | null> => group()),
    membership: vi.fn(async (_id: string, _user: string): Promise<GroupMembership | null> => null),
    ban: vi.fn(async (_id: string, _user: string): Promise<GroupBan | null> => null),
  };
  const users = { lock: vi.fn(async (_user: string) => {}) };
  const service = new GroupAssetsService(
    assets as unknown as ConstructorParameters<typeof GroupAssetsService>[0],
    groups as unknown as ConstructorParameters<typeof GroupAssetsService>[1],
    users as unknown as ConstructorParameters<typeof GroupAssetsService>[2],
  );
  return { service, assets, groups, users };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("VERCEL_ENV", "production");
  clerk.getUser.mockReset().mockResolvedValue({ publicMetadata: {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("creates a bounded expiring owner upload after locking/quota checks, without modifying existing group logos", async () => {
  const f = setup();
  const result = await f.service.start(owner, { mimeType: "image/png", byteLength: 3 });
  const created = groupAssetSchema.parse(f.assets.create.mock.calls[0][0]);
  expect(result).toEqual({ id: created.id, receivedBytes: 0 });
  expect(created).toEqual({
    ...upload,
    id: result.id,
    expiresAt: new Date(now.getTime() + 86_400_000),
  });
  expect(f.users.lock).toHaveBeenCalledExactlyOnceWith(owner);
  expect(f.assets.countUnclaimed).toHaveBeenCalledExactlyOnceWith(owner);
  expect(f.users.lock.mock.invocationCallOrder[0]).toBeLessThan(
    f.assets.countUnclaimed.mock.invocationCallOrder[0],
  );
  expect(f.assets.countUnclaimed.mock.invocationCallOrder[0]).toBeLessThan(
    f.assets.create.mock.invocationCallOrder[0],
  );
  expect(f.groups.find).not.toHaveBeenCalled();
});

it.each(["lock", "quota", "create"] as const)(
  "propagates a %s storage failure without running later upload steps",
  async (step) => {
    const f = setup();
    const failure = new Error(`${step} unavailable`);
    if (step === "lock") f.users.lock.mockRejectedValueOnce(failure);
    if (step === "quota") f.assets.countUnclaimed.mockRejectedValueOnce(failure);
    if (step === "create") f.assets.create.mockRejectedValueOnce(failure);
    await expect(f.service.start(owner, { mimeType: "image/png", byteLength: 3 })).rejects.toBe(
      failure,
    );
    expect(f.assets.create).toHaveBeenCalledTimes(step === "create" ? 1 : 0);
    expect(f.assets.countUnclaimed).toHaveBeenCalledTimes(step === "lock" ? 0 : 1);
  },
);

it.each([null, { ...upload, ownerUserId: viewer }, { ...upload, expiresAt: now }])(
  "conceals a missing, foreign or expired upload from both append and completion: %s",
  async (asset) => {
    const f = setup(asset);
    await expect(f.service.append(owner, id, { offset: 0, base64: "YWJj" })).rejects.toMatchObject({
      status: 404,
      code: "LOGO_NOT_FOUND",
    });
    await expect(f.service.complete(owner, id)).rejects.toMatchObject({
      status: 404,
      code: "LOGO_NOT_FOUND",
    });
    expect(f.assets.append).not.toHaveBeenCalled();
    expect(f.assets.ready).not.toHaveBeenCalled();
  },
);

it("appends exact canonical bytes, returns identical retries without rewriting and detects offset races", async () => {
  const f = setup({ ...upload, expiresAt: undefined, chunks: undefined });
  await expect(f.service.append(owner, id, { offset: 0, base64: "YWJj" })).resolves.toEqual({
    id,
    receivedBytes: 3,
  });
  expect(f.assets.append).toHaveBeenCalledExactlyOnceWith(id, owner, 0, "YWJj", 3);
  f.assets.find.mockResolvedValue({
    ...upload,
    receivedBytes: 3,
    chunks: [{ offset: 0, base64: "YWJj" }],
  });
  await expect(f.service.append(owner, id, { offset: 0, base64: "YWJj" })).resolves.toEqual({
    id,
    receivedBytes: 3,
  });
  await expect(f.service.append(owner, id, { offset: 0, base64: "ZGVm" })).rejects.toMatchObject({
    code: "LOGO_UPLOAD_OFFSET_MISMATCH",
    status: 409,
  });
  expect(f.assets.append).toHaveBeenCalledTimes(1);
  f.assets.find.mockResolvedValue(upload);
  f.assets.append.mockResolvedValueOnce(null);
  await expect(f.service.append(owner, id, { offset: 0, base64: "YWJj" })).rejects.toMatchObject({
    code: "LOGO_UPLOAD_OFFSET_MISMATCH",
  });
  f.assets.find.mockResolvedValue(ready);
  await expect(f.service.append(owner, id, { offset: 0, base64: "YWJj" })).rejects.toMatchObject({
    code: "LOGO_ALREADY_COMPLETE",
  });
  f.assets.find.mockResolvedValue(upload);
  const failure = new Error("Append unavailable");
  f.assets.append.mockRejectedValueOnce(failure);
  await expect(f.service.append(owner, id, { offset: 0, base64: "YWJj" })).rejects.toBe(failure);
});

it.each([
  { offset: 0, base64: "" },
  { offset: 0, base64: "AB==" },
  { offset: 0, base64: Buffer.alloc(GROUP_LOGO_CHUNK_BYTES + 1).toString("base64") },
  { offset: 2, base64: "YWJj" },
])(
  "rejects empty, noncanonical, oversized or overflowing chunk bytes before storage",
  async (input) => {
    const f = setup();
    await expect(f.service.append(owner, id, input)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_LOGO_CHUNK",
    });
    expect(f.assets.append).not.toHaveBeenCalled();
  },
);

it.each([
  upload,
  { ...upload, receivedBytes: 3, chunks: undefined },
  { ...upload, receivedBytes: 3, chunks: [{ offset: 0, base64: "YQ==" }] },
])(
  "rejects incomplete uploads and corrupt chunk totals before publishing a logo",
  async (asset) => {
    const f = setup(asset);
    await expect(f.service.complete(owner, id)).rejects.toMatchObject({
      status: 409,
      code: "LOGO_UPLOAD_INCOMPLETE",
    });
    expect(f.assets.ready).not.toHaveBeenCalled();
  },
);

async function tinyPng() {
  return sharp({
    create: { width: 4, height: 2, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 1 } },
  })
    .png()
    .toBuffer();
}
function completed(bytes: Buffer): GroupAsset {
  return {
    ...upload,
    byteLength: bytes.length,
    receivedBytes: bytes.length,
    chunks: [
      { offset: 0, base64: bytes.subarray(0, 10).toString("base64") },
      { offset: 10, base64: bytes.subarray(10).toString("base64") },
    ],
  };
}
it("assembles original chunks, normalizes through the real image decoder and publishes only the verified derivatives", async () => {
  const bytes = await tinyPng();
  const asset = completed(bytes);
  const f = setup(asset);
  const result = await f.service.complete(owner, id);
  const prepared = f.assets.ready.mock.calls[0][3];
  expect(f.assets.ready).toHaveBeenCalledExactlyOnceWith(id, owner, bytes.length, prepared);
  expect(result).toEqual({ id, preview: `data:image/webp;base64,${prepared.previewBase64}` });
  expect(prepared.base64).not.toBe(bytes.toString("base64"));
  for (const [encoded, width, height] of [
    [prepared.base64, 4, 2],
    [prepared.previewBase64, 512, 512],
    [prepared.thumbnailBase64, 128, 128],
  ] as const) {
    const metadata = await sharp(Buffer.from(encoded ?? "", "base64")).metadata();
    expect(metadata).toMatchObject({ format: "webp", width, height });
    expect(metadata.exif).toBeUndefined();
  }
  expect(asset).toEqual(completed(bytes));
  expect(f.groups.find).not.toHaveBeenCalled();
  f.assets.find.mockResolvedValue({ ...ready, ...prepared });
  await expect(f.service.complete(owner, id)).resolves.toEqual(result);
  expect(f.assets.ready).toHaveBeenCalledTimes(1);
});

it("does not publish corrupt or MIME-spoofed image bytes and rejects a concurrent completion change", async () => {
  const invalid = setup(completed(Buffer.from("not an image")));
  await expect(invalid.service.complete(owner, id)).rejects.toMatchObject({
    status: 400,
    code: "INVALID_LOGO_IMAGE",
  });
  expect(invalid.assets.ready).not.toHaveBeenCalled();
  const bytes = await tinyPng();
  const spoofed = setup({ ...completed(bytes), mimeType: "image/jpeg" });
  await expect(spoofed.service.complete(owner, id)).rejects.toMatchObject({
    code: "INVALID_LOGO_IMAGE",
  });
  expect(spoofed.assets.ready).not.toHaveBeenCalled();
  const changed = setup(completed(bytes));
  changed.assets.ready.mockResolvedValueOnce(null);
  await expect(changed.service.complete(owner, id)).rejects.toMatchObject({
    status: 409,
    code: "LOGO_UPLOAD_CHANGED",
  });
  const failure = new Error("Ready write unavailable");
  changed.assets.ready.mockRejectedValueOnce(failure);
  await expect(changed.service.complete(owner, id)).rejects.toBe(failure);
});

it.each([null, upload, { ...ready, expiresAt: now }])(
  "conceals absent, incomplete or expired previews before any group/provider lookup: %s",
  async (asset) => {
    const f = setup(asset);
    await expect(f.service.preview(owner, id)).rejects.toMatchObject({
      status: 404,
      code: "LOGO_NOT_FOUND",
    });
    expect(f.groups.find).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
  },
);

it("allows an owner to preview an unclaimed ready upload without consulting group or global moderation", async () => {
  const f = setup({ ...ready, expiresAt: undefined });
  await expect(f.service.preview(owner, id)).resolves.toEqual(preview);
  expect(f.groups.find).not.toHaveBeenCalled();
  expect(f.groups.membership).not.toHaveBeenCalled();
  expect(clerk.getUser).not.toHaveBeenCalled();
});

it.each([
  { type: "PRIVATE" as const, member: membership(), banned: false, allowed: true },
  { type: "PRIVATE" as const, member: membership("PENDING"), banned: false, allowed: true },
  {
    type: "PRIVATE" as const,
    member: membership("PENDING", "MEMBER", "REQUEST"),
    banned: false,
    allowed: false,
  },
  { type: "PRIVATE" as const, member: null, banned: false, allowed: false },
  { type: "PRIVATE" as const, member: membership(), banned: true, allowed: false },
  { type: "PUBLIC" as const, member: null, banned: false, allowed: true },
  { type: "PUBLIC" as const, member: membership(), banned: true, allowed: false },
])(
  "uses actual Group visibility/consent/ban policy for an approved $type logo: $allowed",
  async ({ type, member, banned, allowed }) => {
    const f = setup({ ...ready, groupId });
    f.groups.find.mockResolvedValue(group(type));
    f.groups.membership.mockResolvedValue(member);
    f.groups.ban.mockResolvedValue(banned ? ban : null);
    const result = f.service.preview(viewer, id);
    if (allowed) await expect(result).resolves.toEqual(preview);
    else await expect(result).rejects.toMatchObject({ status: 404, code: "LOGO_NOT_FOUND" });
    expect(f.groups.find).toHaveBeenCalledExactlyOnceWith(groupId);
    expect(f.groups.membership).toHaveBeenCalledExactlyOnceWith(groupId, viewer);
    expect(f.groups.ban).toHaveBeenCalledExactlyOnceWith(groupId, viewer);
    expect(f.groups.membership.mock.invocationCallOrder[0]).toBeLessThan(
      f.groups.ban.mock.invocationCallOrder[0],
    );
    expect(clerk.getUser).not.toHaveBeenCalled();
  },
);

it.each(["admin", "moderator", "member", "outsider", "banned-moderator"] as const)(
  "keeps Public proposal previews private to active managers or freshly verified global admins: %s",
  async (role) => {
    const f = setup({ ...ready, groupId });
    const record = group("PUBLIC", true);
    f.groups.find.mockResolvedValue(record);
    const actor = role === "admin" ? record.adminUserId : viewer;
    f.groups.membership.mockResolvedValue(
      role.includes("moderator")
        ? membership("ACCEPTED", "MODERATOR")
        : role === "member"
          ? membership()
          : null,
    );
    f.groups.ban.mockResolvedValue(role === "banned-moderator" ? ban : null);
    if (role === "admin" || role === "moderator") {
      await expect(f.service.preview(actor, id)).resolves.toEqual(preview);
      expect(clerk.getUser).not.toHaveBeenCalled();
    } else {
      await expect(f.service.preview(actor, id)).rejects.toMatchObject({
        status: 403,
        code: "MODERATOR_REQUIRED",
      });
      clerk.getUser.mockResolvedValueOnce({ publicMetadata: { bgoRole: "ADMIN" } });
      await expect(f.service.preview(actor, id)).resolves.toEqual(preview);
      expect(clerk.getUser).toHaveBeenCalledWith(actor);
      const failure = new Error("Clerk unavailable");
      clerk.getUser.mockRejectedValueOnce(failure);
      await expect(f.service.preview(actor, id)).rejects.toBe(failure);
    }
  },
);

it("does not expose detached uploads, missing groups or unrelated logo revisions to global moderators", async () => {
  clerk.getUser.mockResolvedValue({ publicMetadata: { bgoRole: "ADMIN" } });
  const unrelatedId = "44444444-4444-4444-8444-444444444444";
  const publicProposal = group("PUBLIC", true);
  const records = [
    null,
    { ...group(), approved: { name: "Other group logo", logoAssetId: unrelatedId } },
    {
      ...publicProposal,
      proposal: { ...publicProposal.proposal, name: "Other public logo", logoAssetId: unrelatedId },
    },
  ];
  for (const record of records) {
    const f = setup({ ...ready, ...(record ? { groupId } : {}) });
    f.groups.find.mockResolvedValue(record);
    await expect(f.service.preview(viewer, id)).rejects.toMatchObject({
      status: 404,
      code: "LOGO_NOT_FOUND",
    });
  }
  const missing = setup({ ...ready, groupId });
  missing.groups.find.mockResolvedValue(null);
  await expect(missing.service.preview(viewer, id)).rejects.toMatchObject({
    code: "LOGO_NOT_FOUND",
  });
  expect(clerk.getUser).not.toHaveBeenCalled();
});

it.each(["asset", "group", "membership", "ban"] as const)(
  "propagates %s lookup failures rather than granting preview access",
  async (step) => {
    const f = setup({ ...ready, groupId });
    const failure = new Error(`${step} lookup unavailable`);
    if (step === "asset") f.assets.find.mockRejectedValueOnce(failure);
    if (step === "group") f.groups.find.mockRejectedValueOnce(failure);
    if (step === "membership") f.groups.membership.mockRejectedValueOnce(failure);
    if (step === "ban") f.groups.ban.mockRejectedValueOnce(failure);
    await expect(f.service.preview(viewer, id)).rejects.toBe(failure);
    expect(clerk.getUser).not.toHaveBeenCalled();
  },
);
