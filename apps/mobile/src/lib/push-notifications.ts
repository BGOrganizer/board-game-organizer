import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type MobilePushPermissionResult =
  | { status: "granted" }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "unsupported" };

export type MobilePushResult =
  | { status: "granted"; token: string; platform: "android" | "ios" }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "unsupported" };

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function requestMobilePushPermission(): Promise<MobilePushPermissionResult> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return { status: "unsupported" };
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted" && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  return permission.status === "granted"
    ? { status: "granted" }
    : { status: "denied", canAskAgain: permission.canAskAgain };
}

export async function registerMobilePush(): Promise<MobilePushResult> {
  const permission = await requestMobilePushPermission();
  if (permission.status !== "granted") return permission;
  const token = await Notifications.getDevicePushTokenAsync();
  return {
    status: "granted",
    token: String(token.data),
    platform: Platform.OS === "android" ? "android" : "ios",
  };
}

export function notificationHref(
  data: unknown,
):
  | "/contacts"
  | "/contacts?tab=friends"
  | "/contacts?tab=requests"
  | "/matches"
  | "/notifications" {
  if (!data || typeof data !== "object") return "/notifications";
  const { href, kind } = data as { href?: unknown; kind?: unknown };
  if (href === "/contacts" && kind === "friend_request") return "/contacts?tab=requests";
  if (href === "/contacts" && kind === "friend_request_accepted") {
    return "/contacts?tab=friends";
  }
  return href === "/contacts" || href === "/matches" || href === "/notifications"
    ? href
    : "/notifications";
}
