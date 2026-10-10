import { useAuth } from "@clerk/expo";
import * as Sentry from "@sentry/react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { notificationHref } from "@/lib/notifications/push-notifications";

export function PushNotificationRouter({
  onInitialResponse,
}: {
  onInitialResponse: (href: string | null | undefined) => void;
}) {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const router = useRouter();

  useEffect(() => {
    if (!isSignedIn) {
      onInitialResponse(undefined);
      return;
    }
    let active = true;
    const open = (response: Notifications.NotificationResponse) => {
      router.push(notificationHref(response.notification.request.content.data));
    };
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!active) return;
        onInitialResponse(
          response ? notificationHref(response.notification.request.content.data) : null,
        );
        if (!response) return;
        open(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch((error) => {
        if (active) {
          onInitialResponse(null);
          Sentry.captureException(error);
        }
      });
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [isSignedIn, router, onInitialResponse]);

  return null;
}
