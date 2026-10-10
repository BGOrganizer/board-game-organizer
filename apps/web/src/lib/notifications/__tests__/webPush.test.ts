import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: "new-app" })),
  getApp: vi.fn(() => ({ name: "existing-app" })),
  getApps: vi.fn((): unknown[] => []),
  getMessaging: vi.fn(() => ({ name: "messaging" })),
  getToken: vi.fn(async () => "web-token"),
  isSupported: vi.fn(async () => true),
  register: vi.fn(async () => ({ scope: "/" })),
}));

vi.mock("firebase/app", () => ({
  initializeApp: mocks.initializeApp,
  getApp: mocks.getApp,
  getApps: mocks.getApps,
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: mocks.getMessaging,
  getToken: mocks.getToken,
  isSupported: mocks.isSupported,
}));

const keys = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
] as const;

async function load() {
  vi.resetModules();
  return import("../webPush");
}

describe("web push registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of keys) process.env[key] = key;
    mocks.getApps.mockReturnValue([]);
    mocks.isSupported.mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: mocks.register },
    });
  });

  it.each([
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
  ] as const)("reports missing %s configuration", async (key) => {
    delete process.env[key];
    const webPush = await load();
    expect(webPush.isWebPushConfigured()).toBe(false);
    await expect(webPush.getWebPushToken()).resolves.toBeNull();
  });

  it("returns null when browser messaging is unsupported", async () => {
    mocks.isSupported.mockResolvedValue(false);
    const webPush = await load();
    expect(webPush.isWebPushConfigured()).toBe(true);
    await expect(webPush.getWebPushToken()).resolves.toBeNull();
  });

  it("registers service worker and initializes Firebase", async () => {
    const webPush = await load();
    await expect(webPush.getWebPushToken()).resolves.toBe("web-token");
    expect(mocks.register).toHaveBeenCalledWith("/firebase-messaging-sw.js");
    expect(mocks.initializeApp).toHaveBeenCalled();
    expect(mocks.getToken).toHaveBeenCalledWith(
      { name: "messaging" },
      expect.objectContaining({ vapidKey: "NEXT_PUBLIC_FIREBASE_VAPID_KEY" }),
    );
  });

  it("reuses existing Firebase app", async () => {
    mocks.getApps.mockReturnValue([{}]);
    const webPush = await load();
    await webPush.getWebPushToken();
    expect(mocks.getApp).toHaveBeenCalled();
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });
});
