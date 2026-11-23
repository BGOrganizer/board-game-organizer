"use client";

import type { NotificationDto } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CheckCheck, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { NotificationKindIcon } from "./NotificationKindIcon";

export function NotificationCard({
  notification,
  busy,
  onRead,
  onDelete,
  renderDestination,
}: {
  notification: Pick<NotificationDto, "kind" | "title" | "description" | "readAt" | "createdAt">;
  busy?: boolean;
  onRead?: () => void;
  onDelete?: () => void;
  renderDestination: (content: ReactNode, className: string) => ReactNode;
}) {
  const { i18n, t } = useLingui();
  return (
    <article
      className={`relative rounded-xl border bg-surface transition-colors hover:bg-default ${
        notification.readAt ? "border-border" : "border-accent/50"
      }`}
    >
      {renderDestination(
        <span className="flex items-start gap-3">
          <NotificationKindIcon
            kind={notification.kind}
            className="mt-0.5 size-5 shrink-0 text-muted"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium">
              {notification.title}
              {!notification.readAt && (
                <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              )}
            </span>
            <span className="mt-1 block text-sm text-muted">{notification.description}</span>
            <span className="mt-2 block text-xs text-muted">
              {new Intl.DateTimeFormat(i18n.locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(notification.createdAt))}
            </span>
          </span>
        </span>,
        `block rounded-xl p-4 ${onRead || onDelete ? "pe-12" : ""}`,
      )}
      {!notification.readAt && onRead ? (
        <Button
          isIconOnly
          size="sm"
          variant="secondary"
          className="absolute end-3 top-3"
          aria-label={t`Mark as read`}
          isDisabled={busy}
          onPress={onRead}
        >
          <CheckCheck className="size-4" aria-hidden />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          isIconOnly
          size="sm"
          variant="danger-soft"
          aria-label={t`Delete notification`}
          className="absolute end-3 bottom-3"
          isDisabled={busy}
          onPress={onDelete}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </article>
  );
}
