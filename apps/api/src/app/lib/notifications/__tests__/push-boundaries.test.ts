import { generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  type Notification,
  notificationItemId,
  type PushSubscription,
} from "@board-game-organizer/schemas";
import { ObjectId } from "mongodb";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";

const ports = vi.hoisted(() => ({ getDb: vi.fn(), connect: vi.fn() }));
vi.mock("@/app/lib/db", async (original) => ({
  ...(await original<typeof import("../../db")>()),
  getDb: ports.getDb,
}));
vi.mock("node:http2", async (original) => ({
  ...(await original<typeof import("node:http2")>()),
  connect: ports.connect,
}));

const at = new Date("2026-11-18T12:00:00.000Z");
const recipient = "user_recipient";
const groupId = "11111111-1111-4111-8111-111111111111";
const notice: Notification = {
  _id: new ObjectId(),
  recipientUserId: recipient,
  actorUserId: "user_actor",
  kind: "group_membership_updated",
  title: "Membership changed",
  description: "A member joined",
  href: `/groups/${groupId}`,
  createdAt: at,
};
const subscription = (
  provider: PushSubscription["provider"],
  userId = recipient,
): PushSubscription => ({
  _id: new ObjectId(),
  userId,
  token: `fixture-${provider}-device-token`,
  provider,
  platform: provider === "apns" ? "ios" : "android",
  locale: "en",
  createdAt: at,
  updatedAt: at,
});
let rsaKey = "",
  ecKey = "";
beforeAll(() => {
  rsaKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  ecKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
});
function firebase() {
  vi.stubEnv("FIREBASE_PROJECT_ID", "fixture-project");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", " fixture-sender@example.test ");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", ` ${rsaKey.replaceAll("\n", "\\n")} `);
}
function apple() {
  vi.stubEnv("APNS_KEY_ID", "FIXTUREKEY");
  vi.stubEnv("APNS_TEAM_ID", "FIXTURETEAM");
  vi.stubEnv("APNS_PRIVATE_KEY", ecKey);
  vi.stubEnv("APNS_BUNDLE_ID", "com.bgo.fixture");
}
type Channel = {
  session: EventEmitter;
  request: EventEmitter;
  close: ReturnType<typeof vi.fn>;
  timeout?: () => void;
};
const state = {
  notifications: [] as Notification[],
  targets: [] as PushSubscription[],
  unread: 3,
  status: 200 as number | undefined,
  body: "{}",
  hold: false,
  channels: [] as Channel[],
  bodies: [] as string[],
  headers: [] as Record<string, unknown>[],
};
let countDocuments: ReturnType<typeof vi.fn>;
let deleteOne: ReturnType<typeof vi.fn>;
let fetcher: ReturnType<
  typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>
>;
let fcmResponse: () => Response | Promise<Response>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  for (const name of [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "APNS_KEY_ID",
    "APNS_TEAM_ID",
    "APNS_PRIVATE_KEY",
    "APNS_BUNDLE_ID",
    "APNS_PRODUCTION",
  ])
    vi.stubEnv(name, "");
  state.notifications = [notice];
  state.targets = [];
  state.unread = 3;
  state.status = 200;
  state.body = "{}";
  state.hold = false;
  state.channels = [];
  state.bodies = [];
  state.headers = [];
  countDocuments = vi.fn(async () => state.unread);
  deleteOne = vi.fn(async () => ({ deletedCount: 1 }));
  ports.getDb.mockResolvedValue({
    collection: (name: string) => {
      if (name === COLLECTIONS.NOTIFICATIONS)
        return {
          find: vi.fn(() => ({ toArray: async () => state.notifications })),
          countDocuments,
        };
      if (name === COLLECTIONS.PUSH_SUBSCRIPTIONS)
        return {
          find: vi.fn((filter: { userId: string }) => ({
            toArray: async () => state.targets.filter((target) => target.userId === filter.userId),
          })),
          deleteOne,
        };
      throw new Error(`Unexpected fixture collection: ${name}`);
    },
  });
  ports.connect.mockImplementation(() => {
    const session = new EventEmitter(),
      request = new EventEmitter();
    const channel: Channel = { session, request, close: vi.fn() };
    state.channels.push(channel);
    return Object.assign(session, {
      close: channel.close,
      setTimeout: (ms: number, callback: () => void) => {
        expect(ms).toBe(10_000);
        channel.timeout = callback;
      },
      request: (headers: Record<string, unknown>) => {
        state.headers.push(headers);
        return Object.assign(request, {
          setEncoding: vi.fn(),
          end: (body: string) => {
            state.bodies.push(body);
            if (state.hold) return;
            request.emit("response", state.status === undefined ? {} : { ":status": state.status });
            request.emit("data", state.body);
            request.emit("end");
          },
        });
      },
    });
  });
  fcmResponse = () => Response.json({});
  fetcher = vi.fn(async (input, init) => {
    const url = String(input);
    expect(init?.method).toBe("POST");
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({ access_token: "fixture-access" });
    if (url === "https://fcm.googleapis.com/v1/projects/fixture-project/messages:send")
      return fcmResponse();
    throw new Error(`Unexpected provider fixture request: ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("sends exact unread source-item navigation and section metadata without changing notification reads", async () => {
  firebase();
  const unread = notificationItemId(groupId, "member", "user_joined", "group");
  const read = notificationItemId(groupId, "member", "user_previous", "group");
  state.notifications = [
    {
      ...notice,
      attentionItems: [
        { id: read, revision: 1, readAt: at },
        { id: unread, revision: 2 },
      ],
    },
  ];
  state.targets = [subscription("fcm")];
  const { dispatchNotifications } = await import("../push");
  await dispatchNotifications([notice._id]);
  const payload = JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body));
  expect(payload.message.data).toMatchObject({
    href: notice.href,
    attentionItemId: unread,
    tab: "members",
  });
  expect(state.notifications[0].attentionItems?.map((point) => point.readAt)).toEqual([
    at,
    undefined,
  ]);
  expect(deleteOne).not.toHaveBeenCalled();
});

it.each(["malformed-json", "detail-without-code", "transient"] as const)(
  "retains FCM subscriptions when failure does not prove invalidity: %s",
  async (failure) => {
    firebase();
    state.targets = [subscription("fcm")];
    fcmResponse = () =>
      failure === "malformed-json"
        ? new Response("invalid-json", { status: 503 })
        : Response.json(
            failure === "detail-without-code"
              ? { error: { details: [{}] } }
              : { error: { details: [{ errorCode: "UNAVAILABLE" }] } },
            { status: 503 },
          );
    const { dispatchNotifications } = await import("../push");
    await expect(dispatchNotifications([notice._id])).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(deleteOne).not.toHaveBeenCalled();
  },
);

it("skips recipients with no installations and caches a zero unread count for repeated notices", async () => {
  firebase();
  state.targets = [subscription("fcm")];
  state.unread = 0;
  const later = { ...notice, _id: new ObjectId() };
  state.notifications = [
    { ...notice, _id: new ObjectId(), recipientUserId: "user_without_devices" },
    notice,
    later,
  ];
  const { dispatchNotifications } = await import("../push");
  await dispatchNotifications(state.notifications.map((notification) => notification._id));
  expect(countDocuments).toHaveBeenCalledExactlyOnceWith({
    recipientUserId: recipient,
    readAt: { $exists: false },
  });
  const messages = fetcher.mock.calls.filter(([url]) => String(url).includes("messages:send"));
  expect(messages).toHaveLength(2);
  for (const [, init] of messages)
    expect(JSON.parse(String(init?.body)).message.android.notification.notification_count).toBe(0);
});

it("uses the documented default OAuth token lifetime, reuses it while valid and refreshes at expiry", async () => {
  firebase();
  state.targets = [subscription("fcm")];
  const { dispatchNotifications } = await import("../push");
  await dispatchNotifications([notice._id]);
  await dispatchNotifications([notice._id]);
  const exchanges = () => fetcher.mock.calls.filter(([url]) => String(url).includes("oauth2"));
  expect(exchanges()).toHaveLength(1);
  const form = new URLSearchParams(String(exchanges()[0][1]?.body));
  const claims = JSON.parse(
    Buffer.from(form.get("assertion")?.split(".")[1] ?? "", "base64url").toString(),
  );
  expect(claims).toMatchObject({
    iss: "fixture-sender@example.test",
    iat: at.getTime() / 1000,
    exp: at.getTime() / 1000 + 3600,
  });
  vi.setSystemTime(new Date(at.getTime() + 3300_000));
  await dispatchNotifications([notice._id]);
  expect(exchanges()).toHaveLength(2);
});

it.each(["timeout", "connection-error", "request-error"] as const)(
  "closes the APNs channel and preserves its token after %s",
  async (failure) => {
    apple();
    state.targets = [subscription("apns")];
    state.hold = true;
    const { dispatchNotifications } = await import("../push");
    const pending = dispatchNotifications([notice._id]);
    await vi.waitFor(() => expect(state.bodies).toHaveLength(1));
    const channel = state.channels[0];
    if (failure === "timeout") channel.timeout?.();
    if (failure === "connection-error")
      channel.session.emit("error", new Error("Connection unavailable"));
    if (failure === "request-error")
      channel.request.emit("error", new Error("Request unavailable"));
    await expect(pending).resolves.toBeUndefined();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(deleteOne).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("treats an absent APNs status/reason as unknown rather than revoking the device", async () => {
  apple();
  state.targets = [subscription("apns")];
  state.status = undefined;
  const { dispatchNotifications } = await import("../push");
  await dispatchNotifications([notice._id]);
  expect(state.channels[0].close).toHaveBeenCalledOnce();
  expect(deleteOne).not.toHaveBeenCalled();
});

it("contains a non-Error provider rejection, redacts its value and continues with another installation", async () => {
  firebase();
  apple();
  state.targets = [subscription("fcm"), subscription("apns")];
  fetcher.mockRejectedValueOnce({ privateDeviceValue: "fixture-fcm-device-token" });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { dispatchNotifications } = await import("../push");
  await dispatchNotifications([notice._id]);
  expect(error).toHaveBeenCalledExactlyOnceWith("Push notification delivery failed", {
    notificationId: notice._id.toHexString(),
    provider: "fcm",
    error: "Unknown error",
  });
  expect(JSON.stringify(error.mock.calls)).not.toContain("fixture-fcm-device-token");
  expect(state.bodies).toHaveLength(1);
  expect(state.channels[0].close).toHaveBeenCalledOnce();
  expect(deleteOne).not.toHaveBeenCalled();
});
