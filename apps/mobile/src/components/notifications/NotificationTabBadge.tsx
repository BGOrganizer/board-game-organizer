import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";

export function NotificationTabBadge({
  target,
  overviewItems,
  count: suppliedCount,
}: {
  target: NotificationAttentionTarget;
  overviewItems?: readonly string[];
  /** Source-complete entity/tab count, including off-page rows. */
  count?: number;
}) {
  const attention = useNotificationAttentionContext();
  const row = attention?.get(target);
  // Overview excludes member points: only generic information plus its own precise items.
  const count = overviewItems
    ? (row?.direct ?? 0) +
      overviewItems.reduce(
        (total, id) => total + (attention?.get({ kind: "item", id })?.count ?? 0),
        0,
      )
    : row?.count;
  return <NotificationCountBadge count={suppliedCount ?? count} />;
}
