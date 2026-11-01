import { type NotificationDto, notificationItemIdSchema } from "@board-game-organizer/schemas";
import { attentionReference } from "./notificationAttention";

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
    notification.attentionItems?.find(
      (point) => !point.readAt && notificationItemIdSchema.safeParse(point.id).success,
    );
  if (!item) return { href: notification.href, itemId: undefined };
  const [resource, scope] = JSON.parse(item.id) as [string, string];
  const href = reference.eventId
    ? resource === "event"
      ? `/events/${reference.eventId}`
      : `/events/${reference.eventId}/tables/${scope}`
    : notification.href;
  return { href, itemId: item.id };
}
export function notificationWebHref(notification: Parameters<typeof notificationDestination>[0]) {
  const { href, itemId } = notificationDestination(notification);
  return itemId
    ? `${href}?attention=${encodeURIComponent(itemId)}#attention-${encodeURIComponent(itemId)}`
    : href;
}
