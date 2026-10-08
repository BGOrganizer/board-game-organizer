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
  requestMobilePushPermission,
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

  it("routes community links to authenticated native destinations and rejects unsafe paths", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      notificationHref({ href: `/organizations/${id}`, kind: "organization_invitation" }),
    ).toBe(`/organization/${id}`);
    expect(notificationHref({ href: "/moderation", kind: "organization_review_requested" })).toBe(
      "/moderation",
    );
    expect(notificationHref({ href: 123 })).toBe("/notifications");
    for (const href of [
      `https://evil.test/organizations/${id}`,
      "/organizations/invalid",
      `/organizations/${id}/edit`,
      `/organizations/${id}?redirect=evil`,
    ])
      expect(notificationHref({ href })).toBe("/notifications");
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

  it("returns unsupported outside Android and iOS", async () => {
    mocks.platform.OS = "web";
    await expect(registerMobilePush()).resolves.toEqual({ status: "unsupported" });
  });

  it("requests native permission before token registration", async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: "undetermined", canAskAgain: true });

    await expect(requestMobilePushPermission()).resolves.toEqual({ status: "granted" });
    expect(mocks.requestPermissionsAsync).toHaveBeenCalledOnce();
    expect(mocks.getDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it("does not repeat the prompt when native permission cannot be requested again", async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: false });

    await expect(requestMobilePushPermission()).resolves.toEqual({
      status: "denied",
      canAskAgain: false,
    });
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("creates Android channel and returns FCM device token on an emulator", async () => {
    mocks.device.isDevice = false;
    await expect(registerMobilePush()).resolves.toEqual({
      status: "granted",
      token: "native-token",
      platform: "android",
    });
    expect(mocks.setNotificationChannelAsync).toHaveBeenCalledWith("default", {
      name: "Notifications",
      importance: 4,
      showBadge: true,
      vibrationPattern: [0, 250, 250, 250],
    });
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("requests permission on iOS and handles grant or denial", async () => {
    mocks.platform.OS = "ios";
    mocks.getPermissionsAsync.mockResolvedValue({ status: "undetermined", canAskAgain: true });
    await expect(registerMobilePush()).resolves.toMatchObject({
      status: "granted",
      platform: "ios",
    });
    expect(mocks.setNotificationChannelAsync).not.toHaveBeenCalled();

    mocks.requestPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: false });
    await expect(registerMobilePush()).resolves.toEqual({
      status: "denied",
      canAskAgain: false,
    });
  });

  it("allows only known in-app notification links", () => {
    expect(notificationHref({ href: "/contacts" })).toBe("/contacts");
    expect(notificationHref({ href: "/contacts", kind: "friend_request" })).toBe(
      "/contacts?tab=requests",
    );
    expect(notificationHref({ href: "/contacts", kind: "friend_request_accepted" })).toBe(
      "/contacts?tab=connections",
    );
    expect(notificationHref({ href: "/matches" })).toBe("/matches");
    expect(notificationHref({ href: "/groups" })).toBe("/groups");
    expect(notificationHref({ href: "/matches/507f1f77bcf86cd799439011" })).toBe(
      "/match/507f1f77bcf86cd799439011",
    );
    expect(notificationHref({ href: "/groups/507f1f77bcf86cd799439012" })).toBe(
      "/group/507f1f77bcf86cd799439012",
    );
    expect(notificationHref({ href: "/groups/4ddc08de-7d21-4e90-8560-a478ab935224" })).toBe(
      "/group/4ddc08de-7d21-4e90-8560-a478ab935224",
    );
    expect(notificationHref({ href: "/matches/5b3adbd6-8490-488a-b0ce-dd8e852734ba" })).toBe(
      "/match/5b3adbd6-8490-488a-b0ce-dd8e852734ba",
    );
    expect(notificationHref({ href: "/groups/not-a-valid-uuid" })).toBe("/notifications");
    expect(notificationHref({ href: "/groups/../profile" })).toBe("/notifications");
    expect(notificationHref({ href: "/notifications" })).toBe("/notifications");
    expect(notificationHref({ href: "https://evil.example" })).toBe("/notifications");
    expect(notificationHref(null)).toBe("/notifications");
  });
});
