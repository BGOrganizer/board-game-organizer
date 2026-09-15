import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type MobilePushResult =
  | { status: "granted"; token: string; platform: "android" | "ios" }
  | { status: "denied" | "unsupported" };

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

export async function registerMobilePush(): Promise<MobilePushResult> {
  if (!Device.isDevice || (Platform.OS !== "android" && Platform.OS !== "ios")) {
    return { status: "unsupported" };
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return { status: "denied" };
  const token = await Notifications.getDevicePushTokenAsync();
  return { status: "granted", token: String(token.data), platform: Platform.OS };
}

export function notificationHref(data: unknown): "/contacts" | "/matches" | "/notifications" {
  if (!data || typeof data !== "object") return "/notifications";
  const href = (data as { href?: unknown }).href;
  return href === "/contacts" || href === "/matches" || href === "/notifications"
    ? href
    : "/notifications";
}
