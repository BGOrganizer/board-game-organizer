import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  device: { isDevice: true },
  platform: { OS: "android" },
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getDevicePushTokenAsync: vi.fn(),
}));

vi.mock("expo-device", () => mocks.device);
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: mocks.setNotificationHandler,
  setNotificationChannelAsync: mocks.setNotificationChannelAsync,
  getPermissionsAsync: mocks.getPermissionsAsync,
  requestPermissionsAsync: mocks.requestPermissionsAsync,
  getDevicePushTokenAsync: mocks.getDevicePushTokenAsync,
}));

import {
  configureNotificationHandler,
  notificationHref,
  registerMobilePush,
} from "../push-notifications";

describe("mobile push notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.device.isDevice = true;
    mocks.platform.OS = "android";
    mocks.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.getDevicePushTokenAsync.mockResolvedValue({ data: "native-token" });
  });

  it("configures foreground notification behavior", async () => {
    configureNotificationHandler();
    const handler = mocks.setNotificationHandler.mock.calls[0]?.[0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    });
  });

  it("returns unsupported off physical Android and iOS devices", async () => {
    mocks.device.isDevice = false;
    await expect(registerMobilePush()).resolves.toEqual({ status: "unsupported" });
    mocks.device.isDevice = true;
    mocks.platform.OS = "web";
    await expect(registerMobilePush()).resolves.toEqual({ status: "unsupported" });
  });

  it("creates Android channel and returns FCM device token", async () => {
    await expect(registerMobilePush()).resolves.toEqual({
      status: "granted",
      token: "native-token",
      platform: "android",
    });
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledWith("default", {
      name: "Notifications",
      importance: 4,
      vibrationPattern: [0, 250, 250, 250],
    });
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("requests permission on iOS and handles grant or denial", async () => {
    mocks.platform.OS = "ios";
    mocks.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    await expect(registerMobilePush()).resolves.toMatchObject({
      status: "granted",
      platform: "ios",
    });
    expect(mocks.setNotificationChannelAsync).not.toHaveBeenCalled();

    mocks.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    await expect(registerMobilePush()).resolves.toEqual({ status: "denied" });
  });

  it("allows only known in-app notification links", () => {
    expect(notificationHref({ href: "/contacts" })).toBe("/contacts");
    expect(notificationHref({ href: "/matches" })).toBe("/matches");
    expect(notificationHref({ href: "/notifications" })).toBe("/notifications");
    expect(notificationHref({ href: "https://evil.example" })).toBe("/notifications");
    expect(notificationHref(null)).toBe("/notifications");
  });
});
