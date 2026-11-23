import {
  NOTIFICATION_KINDS,
  notificationAttentionReferenceSchema,
  notificationChangesPageSchema,
  notificationIdSchema,
} from "@board-game-organizer/schemas";
import { notificationWebHref, shouldReadOnNotificationOpen } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { NotificationChangeDescription } from "@/components/notifications/NotificationChangeDescription";
import { PeopleMoreButton } from "./PeopleMoreButton";
import { callTool } from "./protocol";
import { internalBgoPath, type PeopleResultProps, usePeoplePages } from "./usePeoplePages";
import { useWidgetNavigation } from "./WidgetNavigation";

const date = z.iso.datetime({ offset: true });
const notificationSchema = z.object({
  id: notificationIdSchema,
  title: z.string(),
  description: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  href: z.string(),
  createdAt: date,
  readAt: date.nullable(),
  attention: notificationAttentionReferenceSchema.nullish(),
  attentionItems: z
    .array(z.object({ id: z.string(), revision: z.number(), readAt: date.nullable() }))
    .optional(),
});
const notificationPage = z.object({
  notifications: z.array(notificationSchema).max(50),
  unreadCount: z.number().int().nonnegative(),
  nextCursor: notificationIdSchema.nullable(),
});

type Write = { kind: "read" | "delete"; id?: string };
export function InboxResults(props: PeopleResultProps) {
  const { t } = useLingui();
  const { canOpenPath, openPath, openTool } = useWidgetNavigation(props.app);
  const { pages, invalid } = usePeoplePages(props, notificationPage);
  const [deleting, setDeleting] = useState<Write | null>(null);
  const [openError, setOpenError] = useState(false);
  const mutation = useMutation({
    mutationFn: async ({ kind, id }: Write) => {
      const name =
        kind === "read"
          ? id
            ? "mark_notification_read"
            : "mark_all_notifications_read"
          : id
            ? "delete_notification"
            : "delete_all_notifications";
      await callTool(props.app, name, id ? { params: { notificationId: id } } : {});
      await pages.refetch({ cancelRefetch: false });
    },
    retry: false,
  });
  const data = pages.data?.pages ?? [];
  const unreadCount = data[0]?.unreadCount ?? 0;
  const notifications = new Map(
    data.flatMap((page) => page.notifications.map((item) => [item.id, item] as const)),
  );
  const busy = mutation.isPending || pages.isFetching;
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={t`Notifications`}
        leading={<Bell className="size-5 text-accent" aria-hidden />}
        action={<NotificationCountBadge count={unreadCount} counted />}
      />
      {invalid || pages.isError ? (
        <p role="alert" className="text-danger">{t`Could not load notifications`}</p>
      ) : null}
      {openError || mutation.isError ? (
        <p role="alert" className="text-danger">{t`Could not complete the action. Try again.`}</p>
      ) : null}
      {!invalid && !pages.isError && notifications.size === 0 ? (
        <EmptyList icon={<Bell className="size-7" />}>{t`No notifications yet`}</EmptyList>
      ) : null}
      {notifications.size > 0 ? (
        <div className="flex justify-end gap-2">
          {unreadCount > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              isDisabled={busy}
              onPress={() => mutation.mutate({ kind: "read" })}
            >
              <CheckCheck className="size-4" aria-hidden />
              {t`Mark all as read`}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="danger-soft"
            isIconOnly
            aria-label={t`Delete all notifications`}
            isDisabled={busy}
            onPress={() => setDeleting({ kind: "delete" })}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
      {Array.from(notifications.values(), (notification) => {
        const href = notificationWebHref(notification);
        const contactList =
          href === "/contacts" &&
          (notification.kind === "follow"
            ? "followers"
            : notification.kind === "friend_request"
              ? "pending"
              : undefined);
        return (
          <NotificationCard
            key={notification.id}
            notification={notification}
            busy={busy}
            onRead={() => mutation.mutate({ kind: "read", id: notification.id })}
            onDelete={() => setDeleting({ kind: "delete", id: notification.id })}
            renderDestination={(content, className) =>
              internalBgoPath(href) ? (
                <button
                  type="button"
                  className={`${className} w-full text-start`}
                  disabled={busy}
                  onClick={async () => {
                    setOpenError(false);
                    const inWidget = Boolean(openTool && contactList) || canOpenPath(href);
                    function acknowledge() {
                      if (!notification.readAt && shouldReadOnNotificationOpen(notification))
                        mutation.mutate({ kind: "read", id: notification.id });
                    }
                    try {
                      const opened =
                        openTool && contactList
                          ? await openTool(
                              "list_relationships",
                              { query: { type: contactList } },
                              acknowledge,
                            )
                          : await openPath(href, acknowledge);
                      if (!opened) setOpenError(!inWidget);
                    } catch {
                      setOpenError(true);
                    }
                  }}
                >
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )
            }
          />
        );
      })}
      <PeopleMoreButton pages={pages} busy={busy} />
      {deleting ? (
        <ContactConfirmDialog
          title={deleting.id ? t`Delete notification?` : t`Delete all notifications?`}
          description={
            deleting.id
              ? t`This notification will be permanently deleted.`
              : t`All notifications will be permanently deleted.`
          }
          busy={busy}
          actions={[
            {
              label: deleting.id ? t`Delete notification` : t`Delete all notifications`,
              variant: "danger",
              onPress: () => {
                mutation.mutate(deleting);
                setDeleting(null);
              },
            },
          ]}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}

export function ChangeResults(props: PeopleResultProps) {
  const { t } = useLingui();
  const { pages, invalid } = usePeoplePages(props, notificationChangesPageSchema);
  const changes = pages.data?.pages.flatMap((page) => page.changes) ?? [];
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={t`New changes`}
        leading={<Bell className="size-5 text-warning" aria-hidden />}
      />
      {invalid || pages.isError ? (
        <p role="alert" className="text-danger">{t`Could not load changes. Try again.`}</p>
      ) : null}
      {!invalid && !pages.isError && !changes.length ? (
        <EmptyList icon={<Bell className="size-7" />}>{t`No new changes`}</EmptyList>
      ) : null}
      <GroupedList>
        {changes.map((change) => (
          <GroupedRow key={`${change.notificationId}:${change.itemId ?? ""}`}>
            <NotificationChangeDescription change={change} />
          </GroupedRow>
        ))}
      </GroupedList>
      {changes.some((change) => change.requiresResponse) ? (
        <p className="text-sm text-muted">{t`Invitations remain unread until you respond.`}</p>
      ) : null}
      <PeopleMoreButton pages={pages} />
    </section>
  );
}
