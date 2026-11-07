import { notificationItemId } from "@board-game-organizer/schemas";
import { useNotificationItemDwell } from "@board-game-organizer/shared";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function GroupMemberAttention({
  groupId,
  userId,
  visible,
}: {
  groupId: string;
  userId: string;
  visible: boolean;
}) {
  const options = useCommunityApi();
  const itemId = notificationItemId(groupId, "member", userId);
  useNotificationItemDwell(options, itemId, visible);
  return <NotificationItem itemId={itemId} />;
}
