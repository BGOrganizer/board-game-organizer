import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("@/app/lib/notifications.repository", () => ({
  NotificationsRepository: vi.fn(() => ({
    list: mocks.list,
    markRead: mocks.markRead,
    markAllRead: mocks.markAllRead,
  })),
}));
vi.mock("@/app/lib/push-subscriptions.repository", () => ({
  PushSubscriptionsRepository: vi.fn(() => ({ upsert: mocks.upsert, remove: mocks.remove })),
}));

import { PATCH as markRead } from "@/app/api/notifications/[notificationId]/route";
import { GET as listNotifications, PATCH as markAllRead } from "@/app/api/notifications/route";
import { POST as registerPush, DELETE as removePush } from "@/app/api/push-subscriptions/route";

const ID = "0123456789abcdef01234567";
const context = (notificationId = ID) => ({ params: Promise.resolve({ notificationId }) });
const jsonRequest = (
  url: string,
  method: string,
  body: unknown,
  contentType = "application/json",
) =>
  new Request(url, {
    method,
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("notification API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.list.mockResolvedValue({ notifications: [], unreadCount: 0, nextCursor: null });
    mocks.markRead.mockResolvedValue({ modifiedCount: 1 });
    mocks.markAllRead.mockResolvedValue({ modifiedCount: 1 });
    mocks.upsert.mockResolvedValue({ upsertedCount: 1 });
    mocks.remove.mockResolvedValue({ deletedCount: 1 });
  });

  it("rejects unauthenticated notification requests", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await listNotifications(new Request("http://x/api/notifications"))).status).toBe(401);
    expect(
      (await markAllRead(new Request("http://x/api/notifications", { method: "PATCH" }))).status,
    ).toBe(401);
    expect(
      (
        await markRead(
          new Request(`http://x/api/notifications/${ID}`, { method: "PATCH" }),
          context(),
        )
      ).status,
    ).toBe(401);
  });

  it("validates list query and duplicate parameters", async () => {
    expect(
      (await listNotifications(new Request("http://x/api/notifications?limit=0"))).status,
    ).toBe(400);
    expect(
      (await listNotifications(new Request("http://x/api/notifications?limit=5&limit=6"))).status,
    ).toBe(400);
    expect(
      (await listNotifications(new Request("http://x/api/notifications?other=1"))).status,
    ).toBe(400);
  });

  it("lists notifications with cursor and bypass", async () => {
    const response = await listNotifications(
      new Request(
        `http://x/api/notifications?limit=20&cursor=${ID}&x-vercel-protection-bypass=token`,
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("user_1", 20, ID);
  });

  it("returns 500 when notification listing fails", async () => {
    mocks.list.mockRejectedValue(new Error("db"));
    expect((await listNotifications(new Request("http://x/api/notifications"))).status).toBe(500);
  });

  it("marks every notification read and validates query", async () => {
    expect(
      (await markAllRead(new Request("http://x/api/notifications?other=1", { method: "PATCH" })))
        .status,
    ).toBe(400);
    expect(
      (
        await markAllRead(
          new Request(
            "http://x/api/notifications?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b",
            { method: "PATCH" },
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await markAllRead(
          new Request("http://x/api/notifications?x-vercel-protection-bypass=a", {
            method: "PATCH",
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.markAllRead).toHaveBeenCalledWith("user_1");
    mocks.markAllRead.mockRejectedValue(new Error("db"));
    expect(
      (await markAllRead(new Request("http://x/api/notifications", { method: "PATCH" }))).status,
    ).toBe(500);
  });

  it("marks one owned notification read and validates request", async () => {
    expect(
      (await markRead(new Request("http://x", { method: "PATCH" }), context("bad"))).status,
    ).toBe(400);
    expect(
      (
        await markRead(
          new Request(`http://x?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b`, {
            method: "PATCH",
          }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (await markRead(new Request("http://x?other=1", { method: "PATCH" }), context())).status,
    ).toBe(400);
    expect((await markRead(new Request("http://x", { method: "PATCH" }), context())).status).toBe(
      200,
    );
    expect(mocks.markRead).toHaveBeenCalledWith("user_1", ID);
    mocks.markRead.mockRejectedValue(new Error("db"));
    expect((await markRead(new Request("http://x", { method: "PATCH" }), context())).status).toBe(
      500,
    );
  });
});

describe("push subscription API", () => {
  const input = { token: "token-1234567890123456", platform: "android", locale: "en" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_1" });
    mocks.upsert.mockResolvedValue({ upsertedCount: 1 });
    mocks.remove.mockResolvedValue({ deletedCount: 1 });
  });

  it("rejects unauthenticated registration and removal", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await registerPush(jsonRequest("http://x", "POST", input))).status).toBe(401);
    expect(
      (await removePush(jsonRequest("http://x", "DELETE", { token: input.token }))).status,
    ).toBe(401);
  });

  it("validates registration query and body", async () => {
    expect((await registerPush(jsonRequest("http://x?other=1", "POST", input))).status).toBe(400);
    expect(
      (
        await registerPush(
          jsonRequest(
            "http://x?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b",
            "POST",
            input,
          ),
        )
      ).status,
    ).toBe(400);
    expect((await registerPush(jsonRequest("http://x", "POST", input, "text/plain"))).status).toBe(
      400,
    );
    expect((await registerPush(jsonRequest("http://x", "POST", "{"))).status).toBe(400);
    expect(
      (await registerPush(jsonRequest("http://x", "POST", { ...input, token: "short" }))).status,
    ).toBe(400);
    expect((await registerPush(jsonRequest("http://x", "POST", "x".repeat(8_193)))).status).toBe(
      400,
    );
  });

  it("registers a device token and handles storage failure", async () => {
    const response = await registerPush(
      jsonRequest("http://x?x-vercel-protection-bypass=a", "POST", input),
    );
    expect(response.status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith("user_1", input.token, "android", "en");
    mocks.upsert.mockRejectedValue(new Error("db"));
    expect((await registerPush(jsonRequest("http://x", "POST", input))).status).toBe(500);
  });

  it("validates, removes, and handles removal failure", async () => {
    expect(
      (await removePush(jsonRequest("http://x?other=1", "DELETE", { token: input.token }))).status,
    ).toBe(400);
    expect((await removePush(jsonRequest("http://x", "DELETE", { token: "short" }))).status).toBe(
      400,
    );
    expect(
      (await removePush(jsonRequest("http://x", "DELETE", { token: input.token }))).status,
    ).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("user_1", input.token);
    mocks.remove.mockRejectedValue(new Error("db"));
    expect(
      (await removePush(jsonRequest("http://x", "DELETE", { token: input.token }))).status,
    ).toBe(500);
  });
});
