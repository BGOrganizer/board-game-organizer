"use client";

import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Badge, Dropdown, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWebPushToken, isWebPushConfigured } from "@/lib/webPush";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

export function NotificationBell() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { i18n, t } = useLingui();
  const router = useRouter();
  const registeredRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [pushError, setPushError] = useState(false);
  const notifications = useNotifications(
    {
      apiUrl: apiUrl(),
      getToken,
      userId,
      enabled: isLoaded && Boolean(isSignedIn),
      protectionBypass: protectionBypass(),
    },
    5,
  );
  const registerPushSubscription = notifications.registerPush.mutateAsync;
  const registrationPromiseRef = useRef<Promise<void> | null>(null);

  const registerPush = useCallback(() => {
    if (registrationPromiseRef.current) return registrationPromiseRef.current;
    const promise = (async () => {
      const token = await getWebPushToken();
      if (!token) throw new Error("Web push unavailable");
      await registerPushSubscription({
        token,
        platform: "web",
        locale: i18n.locale.startsWith("it") ? "it" : "en",
      });
      registeredRef.current = true;
      setPushError(false);
    })().finally(() => {
      registrationPromiseRef.current = null;
    });
    registrationPromiseRef.current = promise;
    return promise;
  }, [i18n.locale, registerPushSubscription]);

  useEffect(() => {
    if (
      permission !== "granted" ||
      registeredRef.current ||
      !isSignedIn ||
      !isWebPushConfigured()
    ) {
      return;
    }
    registerPush().catch(() => setPushError(true));
  }, [isSignedIn, permission, registerPush]);

  const enablePush = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      await registerPush().catch(() => {
        setPushError(true);
        setIsOpen(true);
      });
    }
  };

  const openNotification = (id: string, href: string) => {
    notifications.markRead.mutate(id);
    router.push(href);
  };
  const countLabel = notifications.unreadCount > 99 ? "99+" : String(notifications.unreadCount);
  const disabledKeys = [
    "heading",
    ...(notifications.list.isPending ? ["loading"] : []),
    ...(notifications.list.isError ? ["error"] : []),
    ...(!notifications.list.isPending &&
    !notifications.list.isError &&
    notifications.notifications.length === 0
      ? ["empty"]
      : []),
    ...(pushError ? ["push-error"] : []),
  ];

  return (
    <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
      <Dropdown.Trigger
        aria-label={t`Notifications`}
        className="button button--icon-only button--sm button--ghost"
      >
        <Badge.Anchor>
          <Bell className="h-5 w-5" />
          {notifications.unreadCount > 0 && (
            <Badge color="danger" size="sm">
              {countLabel}
            </Badge>
          )}
        </Badge.Anchor>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end" className="w-80 sm:w-96">
        <Dropdown.Menu aria-label={t`Notifications`} disabledKeys={disabledKeys}>
          <Dropdown.Item id="heading" textValue={t`Notifications`}>
            <span className="font-semibold">{t`Notifications`}</span>
          </Dropdown.Item>
          {notifications.list.isPending && (
            <Dropdown.Item id="loading" textValue={t`Loading notifications`}>
              <span className="flex w-full flex-col gap-2 py-1">
                <span className="sr-only">{t`Loading notifications`}</span>
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-full rounded" />
              </span>
            </Dropdown.Item>
          )}
          {notifications.list.isError && (
            <Dropdown.Item id="error" textValue={t`Could not load notifications`}>
              <span className="text-sm text-danger">{t`Could not load notifications`}</span>
            </Dropdown.Item>
          )}
          {!notifications.list.isPending &&
            !notifications.list.isError &&
            notifications.notifications.length === 0 && (
              <Dropdown.Item id="empty" textValue={t`No notifications yet`}>
                <span className="text-sm text-default-500">{t`No notifications yet`}</span>
              </Dropdown.Item>
            )}
          {notifications.notifications.map((notification) => (
            <Dropdown.Item
              key={notification.id}
              id={notification.id}
              textValue={`${notification.title} ${notification.description}`}
              onAction={() => openNotification(notification.id, notification.href)}
            >
              <span className="flex min-w-0 flex-col gap-0.5 py-1">
                <span className="flex items-center gap-2">
                  {!notification.readAt && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  )}
                  <span className="truncate text-sm font-medium">{notification.title}</span>
                </span>
                <span className="line-clamp-2 text-xs text-default-500">
                  {notification.description}
                </span>
                <span className="text-[11px] text-default-400">
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(notification.createdAt))}
                </span>
              </span>
            </Dropdown.Item>
          ))}
          {notifications.unreadCount > 0 && (
            <Dropdown.Item id="mark-all" onAction={() => notifications.markAllRead.mutate()}>
              <span className="flex items-center gap-2 text-sm">
                <CheckCheck className="h-4 w-4" />
                {t`Mark all as read`}
              </span>
            </Dropdown.Item>
          )}
          {permission === "default" && isWebPushConfigured() && (
            <Dropdown.Item id="enable-push" onAction={() => void enablePush()}>
              {t`Enable push notifications`}
            </Dropdown.Item>
          )}
          {pushError && (
            <Dropdown.Item id="push-error" textValue={t`Could not enable push notifications`}>
              <span className="text-sm text-danger">{t`Could not enable push notifications`}</span>
            </Dropdown.Item>
          )}
          <Dropdown.Item id="view-all" onAction={() => router.push("/notifications")}>
            <span className="font-medium text-accent">{t`View all notifications`}</span>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
