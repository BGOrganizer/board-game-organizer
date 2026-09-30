"use client";

import { resolveApiUrl, useNotifications } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { EmptyList } from "@/components/EmptyList";
import { NotificationKindIcon } from "@/components/NotificationKindIcon";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

export function NotificationsPage() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { i18n, t } = useLingui();
  const feedback = useMutationFeedback();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const notifications = useNotifications(
    {
      apiUrl: resolveApiUrl(process.env.NEXT_PUBLIC_API_URL),
      getToken,
      userId,
      enabled: isLoaded && Boolean(isSignedIn),
      protectionBypass: process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS,
      feedback,
    },
    20,
  );
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    notifications.list;

  useEffect(() => {
    const node = endRef.current;
    if (
      !node ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  return (
    <section
      className="mx-auto flex w-full max-w-3xl flex-col gap-4"
      inert={notifications.deleteNotification.isPending}
      aria-busy={notifications.deleteNotification.isPending}
    >
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
            <div key={index} className="rounded-xl border border-default-200 bg-surface p-4">
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
          <EmptyList icon={<Bell className="size-7" />}>{t`No notifications yet`}</EmptyList>
        )}

      <div className="flex flex-col gap-3">
        {notifications.notifications.map((notification) => (
          <article
            key={notification.id}
            className={`relative rounded-xl border bg-surface transition-colors hover:bg-default-100 ${
              notification.readAt ? "border-default-200" : "border-accent/50"
            }`}
          >
            <Link
              href={notification.href}
              onClick={(event) => {
                if (notifications.deleteNotification.isPending) {
                  event.preventDefault();
                  return;
                }
                notifications.markRead.mutate(notification.id);
              }}
              className="block rounded-xl p-4 pe-12"
            >
              <span className="flex items-start gap-3">
                <NotificationKindIcon
                  kind={notification.kind}
                  className="mt-0.5 size-5 shrink-0 text-default-500"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    {notification.title}
                    {!notification.readAt && (
                      <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    )}
                  </span>
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
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              aria-label={t`Delete notification`}
              className="absolute end-3 bottom-3"
              isDisabled={notifications.deleteNotification.isPending}
              onPress={() => setDeletingId(notification.id)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </article>
        ))}
      </div>

      {notifications.hasMore && (
        <>
          <div ref={endRef} className="h-px" aria-hidden="true" />
          {notifications.list.isFetchingNextPage ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : (
            <Button variant="outline" onPress={() => void fetchNextPage()}>
              {notifications.list.isFetchNextPageError
                ? t`Could not load notifications. Retry`
                : t`Load more`}
            </Button>
          )}
        </>
      )}

      {deletingId && (
        <ContactConfirmDialog
          title={t`Delete notification?`}
          description={t`This notification will be permanently deleted.`}
          busy={notifications.deleteNotification.isPending}
          actions={[
            {
              label: t`Delete notification`,
              variant: "danger",
              onPress: () =>
                notifications.deleteNotification.mutate(deletingId, {
                  onSuccess: () => setDeletingId(null),
                }),
            },
          ]}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </section>
  );
}
