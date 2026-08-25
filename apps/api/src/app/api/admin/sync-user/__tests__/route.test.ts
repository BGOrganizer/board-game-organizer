import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPTIONS, POST } from "../route";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv, CLERK_SECRET_KEY: "sk_test_sync" };
  // The route uses dynamic imports for db/repo through the module cache;
  // the mocked UsersRepository below is wired via vi.mock hoisting.
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
        constructor() {}
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
      }),
    });
    const res = await post(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.clerkId).toBe("user_123");
    expect(upsert).toHaveBeenCalled();
  });
});

describe("OPTIONS", () => {
  it("returns CORS headers for preflight", async () => {
    const res = await OPTIONS(new Request("http://localhost/api/admin/sync-user"));
    expect(res.status).toBe(204);
  });
});
