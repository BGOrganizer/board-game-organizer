import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS, POST } from "../route";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv, CLERK_SECRET_KEY: "sk_test_sync" };
  // The route uses dynamic imports for db/repo through the module cache;
  // the mocked UsersRepository below is wired via vi.mock hoisting.
});

describe("GET /api/admin/sync-user", () => {
  it("attests the runtime database only with admin authorization", async () => {
    process.env.MONGODB_DB_NAME = "bgo_ci_12_1";
    process.env.CLERK_WEBHOOK_DB_NAME = "bgo_dev";
    const url = "http://localhost/api/admin/sync-user";
    expect((await GET(new Request(url))).status).toBe(401);
    const res = GET(new Request(url, { headers: { authorization: "Bearer sk_test_sync" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ databaseName: "bgo_ci_12_1", webhookDbReady: true });
  });

  it("reports when webhook routing is not isolated", async () => {
    delete process.env.CLERK_WEBHOOK_DB_NAME;
    const res = GET(
      new Request("http://localhost/api/admin/sync-user", {
        headers: { authorization: "Bearer sk_test_sync" },
      }),
    );
    expect((await res.json()).webhookDbReady).toBe(false);
  });

  it("does not accept an empty secret", async () => {
    delete process.env.CLERK_SECRET_KEY;
    const res = GET(
      new Request("http://localhost/api/admin/sync-user", {
        headers: { authorization: "Bearer undefined" },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/sync-user", () => {
  it("rejects when the bearer does not match CLERK_SECRET_KEY", async () => {
    const req = new Request("http://localhost/api/admin/sync-user", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body: JSON.stringify({ clerkId: "u1", email: "a@b.it", name: "A" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed payload", async () => {
    const req = new Request("http://localhost/api/admin/sync-user", {
      method: "POST",
      headers: { authorization: "Bearer sk_test_sync" },
      body: JSON.stringify({ clerkId: "u1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("upserts the user into the collection and returns ok", async () => {
    const upsert = vi.fn().mockResolvedValue({ ok: true });
    const fakeDb = { collection: vi.fn(() => ({ findOneAndUpdate: upsert })) };
    vi.doMock("@/app/lib/db", () => ({ getDb: async () => fakeDb }));
    vi.doMock("@/app/lib/users.repository", () => ({
      UsersRepository: class {
        upsertFromClerk = upsert;
      },
    }));

    const { POST: post } = await import("../route");
    const req = new Request("http://localhost/api/admin/sync-user", {
      method: "POST",
      headers: { authorization: "Bearer sk_test_sync" },
      body: JSON.stringify({
        clerkId: "user_123",
        email: "target@e2e.it",
        name: "E2E Target",
        mobileNumber: " arbitrary value ",
      }),
    });
    const res = await post(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.clerkId).toBe("user_123");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ mobileNumber: "arbitrary value" }),
    );
  });
});

describe("OPTIONS", () => {
  it("returns CORS headers for preflight", async () => {
    const res = await OPTIONS(new Request("http://localhost/api/admin/sync-user"));
    expect(res.status).toBe(204);
  });
});
