import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  attentionSnapshot: vi.fn(),
  attentionRead: vi.fn(),
  markRead: vi.fn(),
  deleteOne: vi.fn(),
  deleteAll: vi.fn(),
  markAllRead: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  withTransaction: vi.fn(async (operation: (session: object, db: object) => Promise<unknown>) =>
    operation({ id: "notifications" }, {}),
  ),
}));
vi.mock("@/app/lib/notifications/notifications.repository", () => ({
  NotificationsRepository: vi.fn(() => ({
    list: mocks.list,
    markRead: mocks.markRead,
    deleteOne: mocks.deleteOne,
    deleteAll: mocks.deleteAll,
    markAllRead: mocks.markAllRead,
  })),
}));
vi.mock("@/app/lib/notifications/notification-attention.repository", () => ({
  NotificationAttentionRepository: vi.fn(() => ({
    snapshot: mocks.attentionSnapshot,
    read: mocks.attentionRead,
  })),
}));
vi.mock("@/app/lib/notifications/push-subscriptions.repository", () => ({
  PushSubscriptionsRepository: vi.fn(() => ({ upsert: mocks.upsert, remove: mocks.remove })),
}));

import {
  DELETE as deleteNotification,
  PATCH as markRead,
} from "@/app/api/notifications/[notificationId]/route";
import {
  GET as attentionCounts,
  PATCH as readAttention,
} from "@/app/api/notifications/attention/route";
import {
  DELETE as deleteAllNotifications,
  GET as listNotifications,
  PATCH as markAllRead,
} from "@/app/api/notifications/route";
import { POST as registerPush, DELETE as removePush } from "@/app/api/push-subscriptions/route";

import { withTransaction } from "@/app/lib/db";
import { NotificationsRepository } from "@/app/lib/notifications/notifications.repository";

const attentionZero = {
  asOf: "2027-01-01T00:00:00.000Z",
  unreadCount: 0,
  summary: {
    tables: 0,
    events: 0,
    groups: 0,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  },
  targets: [],
};
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
    mocks.attentionSnapshot.mockResolvedValue({
      snapshot: attentionZero,
      references: new Map(),
      personalNotificationIds: new Set(),
    });
    mocks.attentionRead.mockResolvedValue({ updated: 0, snapshot: attentionZero });
    mocks.markRead.mockResolvedValue({ modifiedCount: 1 });
    mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.deleteAll.mockResolvedValue({ deletedCount: 25 });
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
    expect(
      (await deleteNotification(new Request("http://x", { method: "DELETE" }), context())).status,
    ).toBe(401);
    expect(
      (await deleteAllNotifications(new Request("http://x", { method: "DELETE" }))).status,
    ).toBe(401);
    expect(mocks.deleteAll).not.toHaveBeenCalled();
  });

  it("scopes attention reads/counts to authenticated recipient and retains private response headers", async () => {
    const target = { kind: "group", id: "11111111-1111-4111-8111-111111111111" };
    const response = await attentionCounts(
      new Request(
        `http://x/api/notifications/attention?targets=${encodeURIComponent(JSON.stringify([target]))}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.attentionSnapshot).toHaveBeenCalledWith("user_1", [target]);
    const read = await readAttention(
      jsonRequest("http://x/api/notifications/attention", "PATCH", {
        target,
        through: attentionZero.asOf,
      }),
    );
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.attentionRead).toHaveBeenCalledWith("user_1", {
      target,
      through: attentionZero.asOf,
    });
    mocks.auth.mockResolvedValue({ userId: null });
    expect(
      (await attentionCounts(new Request("http://x/api/notifications/attention"))).status,
    ).toBe(401);
    expect(
      (
        await readAttention(
          jsonRequest("http://x/api/notifications/attention", "PATCH", {
            target,
            through: attentionZero.asOf,
          }),
        )
      ).status,
    ).toBe(401);
  });
  it("fails closed on malformed/duplicate/unbounded attention targets and scoped read input", async () => {
    const target = { kind: "group", id: "11111111-1111-4111-8111-111111111111" };
    for (const query of [
      "targets=no",
      "targets=[]&targets=[]",
      "foreign=1",
      `targets=${encodeURIComponent(JSON.stringify([target, target]))}`,
      `targets=${encodeURIComponent(JSON.stringify([{ kind: "group", id: "bad" }]))}`,
    ])
      expect(
        (await attentionCounts(new Request(`http://x/api/notifications/attention?${query}`)))
          .status,
      ).toBe(400);
    for (const body of [
      { target: { kind: "contact", id: "person" }, through: attentionZero.asOf },
      { target },
      { target, through: "bad" },
      { target, through: attentionZero.asOf, recipientUserId: "other" },
      "{",
    ])
      expect(
        (await readAttention(jsonRequest("http://x/api/notifications/attention", "PATCH", body)))
          .status,
      ).toBe(400);
    expect(
      (
        await readAttention(
          jsonRequest("http://x/api/notifications/attention?foreign=1", "PATCH", {
            target,
            through: attentionZero.asOf,
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.attentionRead).not.toHaveBeenCalled();
    expect(mocks.attentionSnapshot).not.toHaveBeenCalled();
  });
  it("reports attention storage failures as errors, not empty successful counts", async () => {
    mocks.attentionSnapshot.mockRejectedValue(new Error("Offline"));
    expect(
      (await attentionCounts(new Request("http://x/api/notifications/attention"))).status,
    ).toBe(500);
    mocks.attentionRead.mockRejectedValue(new Error("Offline"));
    expect(
      (
        await readAttention(
          jsonRequest("http://x/api/notifications/attention", "PATCH", {
            target: { kind: "contacts", id: "requests" },
            through: attentionZero.asOf,
          }),
        )
      ).status,
    ).toBe(500);
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
    expect(mocks.list).toHaveBeenCalledWith("user_1", 20, ID, undefined);
  });

  it("attaches only authorized unread references while retaining loaded read and legacy rows", async () => {
    const target = { kind: "group", id: "11111111-1111-4111-8111-111111111111" };
    mocks.list.mockResolvedValue({
      notifications: [
        { id: ID, readAt: null },
        { id: "fedcba987654321001234567", readAt: "2027-01-01T00:00:00.000Z" },
        { id: "1234567890abcdef12345678", readAt: null },
      ],
      unreadCount: 40,
      nextCursor: null,
    });
    mocks.attentionSnapshot.mockResolvedValue({
      snapshot: { ...attentionZero, unreadCount: 2 },
      references: new Map([[ID, { target }]]),
      personalNotificationIds: new Set(),
    });
    const response = await listNotifications(new Request("http://x/api/notifications"));
    const body = await response.json();
    expect(body.unreadCount).toBe(2);
    expect(body.notifications[0].attention).toEqual({ target });
    expect(body.notifications[1].attention).toBeNull();
    expect(body.notifications[2].attention).toBeNull();
    expect(mocks.attentionSnapshot).toHaveBeenCalledWith(
      "user_1",
      [],
      [ID, "1234567890abcdef12345678"],
    );
  });
  it("returns only authorized structured items for personal notices without changing independently authorized rows", async () => {
    const own = { id: "own", revision: 1, readAt: null };
    const sibling = { id: "sibling", revision: 1, readAt: null };
    const normalId = "fedcba987654321001234567";
    const deniedId = "1234567890abcdef12345678";
    mocks.list.mockResolvedValue({
      notifications: [
        { id: ID, readAt: null, attentionItems: [own, sibling] },
        { id: normalId, readAt: null, attentionItems: [own, sibling] },
        { id: deniedId, readAt: null, attentionItems: [sibling] },
      ],
      nextCursor: null,
    });
    mocks.attentionSnapshot.mockResolvedValue({
      snapshot: attentionZero,
      personalNotificationIds: new Set([ID]),
      references: new Map([
        [ID, { target: { kind: "event", id: "event" }, itemIds: [own.id] }],
        [normalId, { target: { kind: "event", id: "event" } }],
      ]),
    });
    const response = await listNotifications(new Request("http://x/api/notifications"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications[0].attentionItems).toEqual([own]);
    expect(body.notifications[1].attentionItems).toEqual([own, sibling]);
    expect(body.notifications[2]).not.toHaveProperty("attentionItems");
    expect(body.notifications[2].attention).toBeNull();
  });
  it("uses explicit supported inbox locale and rejects duplicate/foreign locale input", async () => {
    const response = await listNotifications(new Request("http://x/api/notifications?locale=it"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith("user_1", 5, undefined, "it");
    for (const query of ["locale=fr", "locale=it&locale=en"])
      expect(
        (await listNotifications(new Request("http://x/api/notifications?" + query))).status,
      ).toBe(400);
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

  it("deletes the entire authenticated inbox, including an already empty inbox", async () => {
    const response = await deleteAllNotifications(
      jsonRequest("http://x/api/notifications?x-vercel-protection-bypass=a", "DELETE", {
        recipientUserId: "foreign",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.deleteAll).toHaveBeenCalledExactlyOnceWith("user_1");
    mocks.deleteAll.mockResolvedValueOnce({ deletedCount: 0 });
    expect(
      (await deleteAllNotifications(new Request("http://x", { method: "DELETE" }))).status,
    ).toBe(200);
  });

  it.each(["other=1", "limit=20", "x-vercel-protection-bypass=a&x-vercel-protection-bypass=b"])(
    "rejects invalid bulk-delete query %s without writing",
    async (query) => {
      expect(
        (await deleteAllNotifications(new Request(`http://x?${query}`, { method: "DELETE" })))
          .status,
      ).toBe(400);
      expect(mocks.deleteAll).not.toHaveBeenCalled();
    },
  );

  it("keeps bulk-delete storage failures observable", async () => {
    mocks.deleteAll.mockRejectedValueOnce(new Error("db"));
    expect(
      (await deleteAllNotifications(new Request("http://x", { method: "DELETE" }))).status,
    ).toBe(500);
  });

  it("permanently deletes only owned notifications", async () => {
    expect(
      (await deleteNotification(new Request("http://x", { method: "DELETE" }), context("bad")))
        .status,
    ).toBe(400);
    expect(
      (await deleteNotification(new Request("http://x?other=1", { method: "DELETE" }), context()))
        .status,
    ).toBe(400);
    expect(
      (
        await deleteNotification(
          new Request("http://x?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b", {
            method: "DELETE",
          }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (await deleteNotification(new Request("http://x", { method: "DELETE" }), context())).status,
    ).toBe(200);
    expect(mocks.deleteOne).toHaveBeenCalledWith("user_1", ID);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(NotificationsRepository).toHaveBeenCalledWith({}, { id: "notifications" });
    mocks.deleteOne.mockResolvedValueOnce({ deletedCount: 0 });
    expect(
      (await deleteNotification(new Request("http://x", { method: "DELETE" }), context())).status,
    ).toBe(404);
    mocks.deleteOne.mockRejectedValueOnce(new Error("db"));
    expect(
      (await deleteNotification(new Request("http://x", { method: "DELETE" }), context())).status,
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
