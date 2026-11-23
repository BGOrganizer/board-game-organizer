"use client";

import {
  notificationWebHref,
  resolveApiUrl,
  shouldReadOnNotificationOpen,
  useNotifications,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Bell, CheckCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { headerButtonProps } from "@/components/common/layout/headerStyles";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { NotificationCard } from "./NotificationCard";

export function NotificationsPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const { i18n, t } = useLingui();
  const feedback = useMutationFeedback();
  const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
  const owner = JSON.stringify([apiUrl, userId, sessionId]);
  const [deletion, setDeletion] = useState<{ owner: string; id?: string } | null>(null);
  const deleting = isLoaded && isSignedIn && deletion?.owner === owner ? deletion : null;
  useEffect(() => {
    if (deletion && deletion.owner !== owner) setDeletion(null);
  }, [deletion, owner]);
  const endRef = useRef<HTMLDivElement>(null);
  const notifications = useNotifications(
    {
      apiUrl,
      getToken,
      userId,
      enabled: isLoaded && Boolean(isSignedIn),
      protectionBypass: process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS,
      feedback,
      locale: i18n.locale.startsWith("it") ? "it" : "en",
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
      notifications.busy ||
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
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, notifications.busy]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <HeaderActions
        back={
          <Button
            {...headerButtonProps}
            variant="ghost"
            aria-label={t`Back`}
            onPress={() => router.back()}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
        }
      >
        <Button
          {...headerButtonProps}
          variant="danger-soft"
          aria-label={t`Delete all notifications`}
          isDisabled={
            !isLoaded ||
            !isSignedIn ||
            notifications.busy ||
            !(
              notifications.notifications.length ||
              notifications.hasMore ||
              notifications.unreadCount
            )
          }
          onPress={() => setDeletion({ owner })}
        >
          <Trash2 className="size-5" aria-hidden="true" />
        </Button>
      </HeaderActions>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t`Notifications`}</h1>
        {notifications.unreadCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={notifications.busy}
            onPress={() => notifications.markAllRead.mutate()}
          >
            <CheckCheck className="h-4 w-4" />
            {t`Mark all as read`}
          </Button>
        )}
      </div>

      {notifications.list.isPending && (
        <div className="flex flex-col gap-3" role="status" aria-label={t`Loading notifications`}>
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-xl border border-border bg-surface p-4">
              <Skeleton className="mb-2 h-5 w-48 rounded" />
              <Skeleton className="h-4 w-full rounded" />
            </div>
          ))}
        </div>
      )}

      {notifications.list.isError && (
        <div className="rounded-xl border border-danger bg-danger-soft p-4 text-danger-soft-foreground">
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

      <div
        className={`flex flex-col gap-3 ${notifications.notifications.length ? "min-h-36" : ""}`}
      >
        {notifications.notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            busy={notifications.isBusy(notification.id)}
            onRead={() => notifications.markRead.mutate(notification.id)}
            onDelete={() => setDeletion({ owner, id: notification.id })}
            renderDestination={(content, className) => (
              <Link
                href={notificationWebHref(notification)}
                onClick={() => {
                  if (
                    shouldReadOnNotificationOpen(notification) &&
                    !notifications.isBusy(notification.id)
                  ) {
                    notifications.markRead.mutate(notification.id);
                  }
                }}
                className={className}
              >
                {content}
              </Link>
            )}
          />
        ))}
      </div>

      {notifications.hasMore && (
        <>
          <div ref={endRef} className="h-px" aria-hidden="true" />
          {notifications.list.isFetchingNextPage ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : (
            <Button
              variant="outline"
              isDisabled={notifications.busy}
              onPress={() => void fetchNextPage()}
            >
              {notifications.list.isFetchNextPageError
                ? t`Could not load notifications. Retry`
                : t`Load more`}
            </Button>
          )}
        </>
      )}

      {deleting && (
        <ContactConfirmDialog
          title={deleting.id ? t`Delete notification?` : t`Delete all notifications?`}
          description={
            deleting.id
              ? t`This notification will be permanently deleted.`
              : t`All notifications will be permanently deleted.`
          }
          busy={deleting.id ? notifications.isBusy(deleting.id) : notifications.busy}
          actions={[
            {
              label: deleting.id ? t`Delete notification` : t`Delete all notifications`,
              variant: "danger",
              onPress: () => {
                if (deleting.id) notifications.deleteNotification.mutate(deleting.id);
                else notifications.deleteAllNotifications.mutate();
                setDeletion(null);
              },
            },
          ]}
          onCancel={() => setDeletion(null)}
        />
      )}
    </section>
  );
}
