"use client";

import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CheckCheck } from "lucide-react";
import Link from "next/link";

export function NotificationsPage() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { i18n, t } = useLingui();
  const notifications = useNotifications(
    {
      apiUrl: resolveApiUrl(process.env.NEXT_PUBLIC_API_URL),
      getToken,
      userId,
      enabled: isLoaded && Boolean(isSignedIn),
      protectionBypass: process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS,
    },
    20,
  );

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t`Notifications`}</h1>
        {notifications.unreadCount > 0 && (
          <Button size="sm" variant="ghost" onPress={() => notifications.markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4" />
            {t`Mark all as read`}
          </Button>
        )}
      </div>

      {notifications.list.isPending && (
        <div className="flex flex-col gap-3" role="status" aria-label={t`Loading notifications`}>
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-xl border border-default-200 p-4">
              <Skeleton className="mb-2 h-5 w-48 rounded" />
              <Skeleton className="h-4 w-full rounded" />
            </div>
          ))}
        </div>
      )}

      {notifications.list.isError && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger">
          <p>{t`Could not load notifications`}</p>
          <Button className="mt-3" size="sm" onPress={() => void notifications.list.refetch()}>
            {t`Try again`}
          </Button>
        </div>
      )}

      {!notifications.list.isPending &&
        !notifications.list.isError &&
        notifications.notifications.length === 0 && (
          <p className="rounded-xl border border-default-200 p-8 text-center text-default-500">
            {t`No notifications yet`}
          </p>
        )}

      <div className="flex flex-col gap-3">
        {notifications.notifications.map((notification) => (
          <Link
            key={notification.id}
            href={notification.href}
            onClick={() => notifications.markRead.mutate(notification.id)}
            className={`rounded-xl border p-4 transition-colors hover:bg-default-100 ${
              notification.readAt ? "border-default-200" : "border-accent/50 bg-accent/5"
            }`}
          >
            <span className="flex items-start gap-3">
              {!notification.readAt && (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block font-medium">{notification.title}</span>
                <span className="mt-1 block text-sm text-default-500">
                  {notification.description}
                </span>
                <span className="mt-2 block text-xs text-default-400">
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(notification.createdAt))}
                </span>
              </span>
            </span>
          </Link>
        ))}
      </div>

      {notifications.hasMore && (
        <Button
          variant="outline"
          isPending={notifications.list.isFetchingNextPage}
          onPress={() => void notifications.list.fetchNextPage()}
        >
          {t`Load more`}
        </Button>
      )}
    </section>
  );
}
