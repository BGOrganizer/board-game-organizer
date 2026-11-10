import { type NotificationDto, notificationItemIdSchema } from "@board-game-organizer/schemas";
import { attentionReference } from "./notificationAttention";
import { notificationChangeTab } from "./notificationChanges";

export function shouldReadOnNotificationOpen(
  notification: Pick<NotificationDto, "href" | "kind" | "attention" | "attentionItems">,
) {
  if (
    notification.attentionItems?.length ||
    notification.kind === "group_invitation" ||
    notification.kind === "table_invitation"
  )
    return false;
  const reference = attentionReference(notification);
  return !reference || reference.target.kind === "contact" || reference.target.kind === "contacts";
}

/** A precise link is navigation only. Opening it never acknowledges every affected item. */
export function notificationDestination(
  notification: Pick<NotificationDto, "href" | "kind" | "attention" | "attentionItems">,
) {
  const reference = attentionReference(notification);
  const item =
    reference &&
    (notification.attentionItems?.find(
      (point) => !point.readAt && notificationItemIdSchema.safeParse(point.id).success,
    ) ??
      reference.itemIds
        ?.map((id) => ({ id }))
        .find((point) => notificationItemIdSchema.safeParse(point.id).success));
  if (!item) {
    const table = /^\/events\/[a-f\d-]{36}\/tables\/([a-f\d-]{36})$/i.exec(notification.href);
    const section =
      table &&
      notificationChangeTab({ kind: "table", id: table[1] }, notification.kind) === "participants"
        ? ("participants" as const)
        : undefined;
    return { href: notification.href, itemId: undefined, section };
  }
  const [resource, scope, field] = JSON.parse(item.id) as [string, string, string];
  const href = reference.eventId
    ? resource === "event"
      ? `/events/${reference.eventId}`
      : `/events/${reference.eventId}/tables/${scope}`
    : notification.href;
  return {
    href,
    itemId: item.id,
    section:
      resource === "group" && ["member", "members"].includes(field)
        ? ("members" as const)
        : resource === "table" &&
            notificationChangeTab({ kind: "table", id: scope }, notification.kind, item.id) ===
              "participants"
          ? ("participants" as const)
          : undefined,
  };
}
export function notificationWebHref(notification: Parameters<typeof notificationDestination>[0]) {
  const { href, itemId, section } = notificationDestination(notification);
  return itemId
    ? `${href}?${section ? `tab=${section}&` : ""}attention=${encodeURIComponent(itemId)}#attention-${encodeURIComponent(itemId)}`
    : section
      ? `${href}?tab=${section}`
      : href;
}
