import { useAuth } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { notificationHref } from "@/lib/push-notifications";

export function PushNotificationRouter() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const router = useRouter();

  useEffect(() => {
    if (!isSignedIn) return;
    const open = (response: Notifications.NotificationResponse) => {
      router.push(notificationHref(response.notification.request.content.data));
    };
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        open(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(Sentry.captureException);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [isSignedIn, router]);

  return null;
}
