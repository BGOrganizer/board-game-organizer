import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null }>>(),
  updateOne: vi.fn(async (_filter: object, _update: object, _options: object) => ({
    matchedCount: 1,
  })),
  collection: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({
  COLLECTIONS: { USERS: "users" },
  getDb: mocks.getDb,
}));

import { OPTIONS, POST } from "../route";

const currentTime = new Date("2030-06-12T10:00:00.000Z");
const origin = "https://presence-preview.vercel.app";
const request = (body: string) =>
  new Request("https://api.test/api/users/presence", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(currentTime);
  mocks.auth.mockResolvedValue({ userId: "viewer" });
  mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
  mocks.collection.mockReturnValue({ updateOne: mocks.updateOne });
  mocks.getDb.mockResolvedValue({ collection: mocks.collection });
});
afterEach(() => vi.useRealTimers());

describe("POST /api/users/presence route unit", () => {
  it("authenticates before parsing a heartbeat or accessing storage", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await POST(request('{"status":'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it.each(["online", "away", "offline"] as const)(
    "writes the authenticated user's %s heartbeat with the server time",
    async (status) => {
      const response = await POST(request(JSON.stringify({ status, userId: "another-user" })));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        lastActiveAt: currentTime.toISOString(),
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(mocks.collection).toHaveBeenCalledExactlyOnceWith("users");
      expect(mocks.updateOne).toHaveBeenCalledExactlyOnceWith(
        { clerkId: "viewer" },
        {
          $set: { "presence.lastActiveAt": currentTime, "presence.online": status !== "offline" },
          $setOnInsert: {
            clerkId: "viewer",
            email: "",
            name: "",
            preferredLanguage: "en",
            plan: "free",
            createdAt: currentTime,
            updatedAt: currentTime,
          },
        },
        { upsert: true },
      );
    },
  );

  it.each([
    ["missing status", {}],
    ["null payload", null],
    ["unknown status", { status: "ghost" }],
    ["wrong status type", { status: 1 }],
    ["scalar payload", "online"],
  ])("rejects %s without accessing storage", async (_description, body) => {
    const response = await POST(request(JSON.stringify(body)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid body" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without creating an empty mirrored user", async () => {
    const response = await POST(request('{"status":'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid body" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("propagates storage failure instead of acknowledging an unwritten heartbeat", async () => {
    const failure = new Error("Presence storage unavailable");
    mocks.updateOne.mockRejectedValueOnce(failure);
    await expect(POST(request(JSON.stringify({ status: "online" })))).rejects.toBe(failure);
    expect(mocks.updateOne).toHaveBeenCalledOnce();
  });

  it("propagates authentication failure without touching storage", async () => {
    const failure = new Error("Authentication unavailable");
    mocks.auth.mockRejectedValueOnce(failure);
    await expect(POST(request(JSON.stringify({ status: "online" })))).rejects.toBe(failure);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("answers CORS preflight without authenticating or recording activity", async () => {
    const response = OPTIONS(
      new Request("https://api.test/api/users/presence", {
        method: "OPTIONS",
        headers: { origin },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
