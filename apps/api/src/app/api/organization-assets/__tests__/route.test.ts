import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getDb: vi.fn(),
  transaction: vi.fn(),
  ensure: vi.fn(),
  start: vi.fn(),
  append: vi.fn(),
  complete: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({
  getDb: mocks.getDb,
  withTransaction: mocks.transaction,
  COLLECTIONS: {
    ORGANIZATION_ASSETS: "organizationAssets",
    ORGANIZATIONS: "organizations",
    ORGANIZATION_MEMBERSHIPS: "organizationMemberships",
    USERS: "users",
  },
}));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: mocks.ensure }));
vi.mock("@/app/lib/organizations/organization-assets.service", () => ({
  OrganizationAssetsService: class {
    start = mocks.start;
    append = mocks.append;
    complete = mocks.complete;
    preview = mocks.preview;
  },
}));

import { CommunityError } from "@/app/lib/community.error";
import { OPTIONS as completeOptions, POST as completeUpload } from "../[assetId]/complete/route";
import { GET, OPTIONS as itemOptions, PATCH } from "../[assetId]/route";
import { OPTIONS, POST } from "../route";

const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ assetId: id }) };
const request = (method: string, body?: unknown) =>
  new Request("https://api.test/api/organization-assets", {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_actor" });
  const db = { collection: vi.fn(() => ({})) };
  mocks.getDb.mockResolvedValue(db);
  mocks.transaction.mockImplementation((operation) => operation({ id: "session" }, db));
  mocks.start.mockResolvedValue({ id, receivedBytes: 0 });
  mocks.append.mockResolvedValue({ id, receivedBytes: 3 });
  mocks.complete.mockResolvedValue({ id, preview: "data:image/webp;base64,preview" });
  mocks.preview.mockResolvedValue({ id, preview: "data:image/webp;base64,preview" });
});

describe("authenticated chunk upload routes", () => {
  it("starts, appends, verifies completion and reads authorized previews", async () => {
    const started = await POST(request("POST", { mimeType: "image/png", byteLength: 3 }));
    expect(started.status).toBe(201);
    expect(await started.json()).toEqual({ id, receivedBytes: 0 });
    expect(mocks.start).toHaveBeenCalledWith("user_actor", {
      mimeType: "image/png",
      byteLength: 3,
    });
    expect((await PATCH(request("PATCH", { offset: 0, base64: "YWJj" }), context)).status).toBe(
      200,
    );
    expect(mocks.append).toHaveBeenCalledWith("user_actor", id, { offset: 0, base64: "YWJj" });
    expect((await completeUpload(request("POST", {}), context)).status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith("user_actor", id);
    expect((await GET(request("GET"), context)).status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith("user_actor", id);
  });
  it("rejects unauthenticated requests before database access", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    for (const result of [
      await POST(request("POST", { mimeType: "image/png", byteLength: 3 })),
      await PATCH(request("PATCH", { offset: 0, base64: "YWJj" }), context),
      await completeUpload(request("POST", {}), context),
      await GET(request("GET"), context),
    ])
      expect(result.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects missing/malformed bodies, unknown fields and invalid ids without mutation", async () => {
    expect((await POST(request("POST"))).status).toBe(400);
    expect((await POST(request("POST", { mimeType: "image/svg+xml", byteLength: 3 }))).status).toBe(
      400,
    );
    expect(
      (await PATCH(request("PATCH", { offset: 0, base64: "YWJj", ownerUserId: "other" }), context))
        .status,
    ).toBe(400);
    expect((await completeUpload(request("POST", { status: "READY" }), context)).status).toBe(400);
    const invalid = { params: Promise.resolve({ assetId: "invalid" }) };
    expect((await GET(request("GET"), invalid)).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("preserves domain failure codes and observable infrastructure errors", async () => {
    mocks.start.mockRejectedValue(new CommunityError(429, "TOO_MANY_LOGO_UPLOADS"));
    const denied = await POST(request("POST", { mimeType: "image/png", byteLength: 3 }));
    expect(denied.status).toBe(429);
    expect(await denied.json()).toEqual({ error: "TOO_MANY_LOGO_UPLOADS" });
    mocks.start.mockRejectedValue(new Error("Database unavailable"));
    expect((await POST(request("POST", { mimeType: "image/png", byteLength: 3 }))).status).toBe(
      500,
    );
  });
  it("retains centralized CORS preflight", () => {
    for (const options of [OPTIONS, itemOptions, completeOptions]) {
      const response = options(request("OPTIONS"));
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    }
  });
});
