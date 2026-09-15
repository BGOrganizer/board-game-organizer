import { generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Notification, PushSubscription } from "@board-game-organizer/schemas";
import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifications: [] as Notification[],
  targets: [] as PushSubscription[],
  removeToken: vi.fn(async () => undefined),
  apns: { status: 200, body: "{}" },
  close: vi.fn(),
  requestHeaders: [] as Record<string, unknown>[],
  requestBodies: [] as string[],
}));

vi.mock("@/app/lib/db", () => ({
  COLLECTIONS: { NOTIFICATIONS: "notifications" },
  getDb: vi.fn(async () => ({
    collection: () => ({
      find: () => ({ toArray: async () => mocks.notifications }),
    }),
  })),
}));
vi.mock("@/app/lib/push-subscriptions.repository", () => ({
  PushSubscriptionsRepository: vi.fn(() => ({
    listByUser: vi.fn(async () => mocks.targets),
    removeToken: mocks.removeToken,
  })),
}));
vi.mock("node:http2", async () => {
  const actual = await vi.importActual<typeof import("node:http2")>("node:http2");
  return {
    ...actual,
    connect: vi.fn(() => ({
      once: vi.fn(),
      setTimeout: vi.fn(),
      close: mocks.close,
      request: (headers: Record<string, unknown>) => {
        mocks.requestHeaders.push(headers);
        const request = new EventEmitter() as EventEmitter & {
          setEncoding: (encoding: string) => void;
          end: (body: string) => void;
        };
        request.setEncoding = vi.fn();
        request.end = (body: string) => {
          mocks.requestBodies.push(body);
          request.emit("response", { ":status": mocks.apns.status });
          if (mocks.apns.body) request.emit("data", mocks.apns.body);
          request.emit("end");
        };
        return request;
      },
    })),
  };
});

import { dispatchNotifications } from "../push";

const notification: Notification = {
  _id: new ObjectId(),
  recipientUserId: "recipient",
  actorUserId: "actor",
  kind: "friend_request",
  title: "New friend request",
  description: "Alex sent you a friend request.",
  href: "/contacts",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const subscription = (provider: "fcm" | "apns", platform: "web" | "android" | "ios") =>
  ({
    _id: new ObjectId(),
    userId: "recipient",
    token: "device-token-1234567890",
    provider,
    platform,
    locale: "en",
    createdAt: new Date(),
    updatedAt: new Date(),
  }) satisfies PushSubscription;

function setFirebaseCredentials() {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
    format: "pem",
    type: "pkcs8",
  });
  process.env.FIREBASE_PROJECT_ID = "project";
  process.env.FIREBASE_CLIENT_EMAIL = "sender@example.com";
  process.env.FIREBASE_PRIVATE_KEY = key.toString();
}

function setApnsCredentials() {
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({
    format: "pem",
    type: "pkcs8",
  });
  process.env.APNS_KEY_ID = "KEY123";
  process.env.APNS_TEAM_ID = "TEAM123";
  process.env.APNS_PRIVATE_KEY = key.toString();
  process.env.APNS_BUNDLE_ID = "com.bgo.mobile";
}

describe("push delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifications = [notification];
    mocks.targets = [];
    mocks.apns.status = 200;
    mocks.apns.body = "{}";
    mocks.requestHeaders.length = 0;
    mocks.requestBodies.length = 0;
    for (const key of [
      "FIREBASE_PROJECT_ID",
      "FIREBASE_CLIENT_EMAIL",
      "FIREBASE_PRIVATE_KEY",
      "APNS_KEY_ID",
      "APNS_TEAM_ID",
      "APNS_PRIVATE_KEY",
      "APNS_BUNDLE_ID",
      "APNS_PRODUCTION",
    ]) {
      delete process.env[key];
    }
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns without database work for no notification ids", async () => {
    await expect(dispatchNotifications([])).resolves.toBeUndefined();
  });

  it("degrades safely when provider credentials are absent", async () => {
    mocks.targets = [subscription("fcm", "web"), subscription("apns", "ios")];
    await expect(dispatchNotifications([notification._id])).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.removeToken).not.toHaveBeenCalled();
  });

  it.each([
    [500, {}],
    [200, {}],
  ])("contains Google credential exchange failures (%s)", async (status, body) => {
    setFirebaseCredentials();
    mocks.targets = [subscription("fcm", "android")];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await dispatchNotifications([notification._id]);
    expect(error).toHaveBeenCalledWith(
      "Push notification delivery failed",
      expect.objectContaining({ provider: "fcm" }),
    );
  });

  it.each(["web", "android"] as const)("sends FCM %s payloads", async (platform) => {
    setFirebaseCredentials();
    mocks.targets = [subscription("fcm", platform)];
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await dispatchNotifications([notification._id]);

    const request = vi.mocked(fetch).mock.calls.at(-1);
    const payload = JSON.parse(String(request?.[1]?.body));
    expect(payload.message.token).toBe("device-token-1234567890");
    expect(
      platform === "web" ? payload.message.data.title : payload.message.notification.title,
    ).toBe("New friend request");
  });

  it("removes unregistered FCM tokens", async () => {
    setFirebaseCredentials();
    mocks.targets = [subscription("fcm", "android")];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            details: [{ errorCode: "UNREGISTERED" }],
          },
        }),
        { status: 404 },
      ),
    );
    await dispatchNotifications([notification._id]);
    expect(mocks.removeToken).toHaveBeenCalledWith("device-token-1234567890");
  });

  it("contains provider failures and redacts device tokens from logs", async () => {
    setFirebaseCredentials();
    mocks.targets = [subscription("fcm", "android")];
    vi.mocked(fetch).mockRejectedValue(new Error("network"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await dispatchNotifications([notification._id]);
    expect(error).toHaveBeenCalledWith(
      "Push notification delivery failed",
      expect.objectContaining({ provider: "fcm", error: "network" }),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("device-token");
  });

  it("sends APNs payload and selects production host configuration", async () => {
    setApnsCredentials();
    process.env.APNS_PRODUCTION = "true";
    mocks.targets = [subscription("apns", "ios")];
    await dispatchNotifications([notification._id]);
    expect(mocks.requestHeaders[0]).toMatchObject({
      ":path": "/3/device/device-token-1234567890",
      "apns-topic": "com.bgo.mobile",
      "apns-push-type": "alert",
    });
    expect(JSON.parse(mocks.requestBodies[0] ?? "{}")).toMatchObject({
      href: "/contacts",
      aps: { alert: { title: "New friend request" } },
    });
  });

  it.each([
    [410, "{}"],
    [400, JSON.stringify({ reason: "BadDeviceToken" })],
  ])("removes invalid APNs tokens (%s)", async (status, body) => {
    setApnsCredentials();
    mocks.targets = [subscription("apns", "ios")];
    mocks.apns.status = status;
    mocks.apns.body = body;
    await dispatchNotifications([notification._id]);
    expect(mocks.removeToken).toHaveBeenCalledWith("device-token-1234567890");
  });

  it("keeps APNs tokens on transient malformed responses", async () => {
    setApnsCredentials();
    mocks.targets = [subscription("apns", "ios")];
    mocks.apns.status = 500;
    mocks.apns.body = "not-json";
    await dispatchNotifications([notification._id]);
    expect(mocks.removeToken).not.toHaveBeenCalled();
  });
});
