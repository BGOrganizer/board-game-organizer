import { type GroupRecordResponse, notificationItemId } from "@board-game-organizer/schemas";
import { useThemeColor } from "heroui-native/hooks";
import { UsersRound } from "lucide-react-native";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { GroupArtwork } from "./GroupArtwork";
import { GroupCardIndicators } from "./GroupCardIndicators";

export function GroupIdentityCard({ group }: { group: GroupRecordResponse }) {
  const foreground = useThemeColor("foreground");
  return (
    <RecordIdentityCard
      title={group.name}
      icon={<UsersRound size={20} color={foreground} accessible={false} />}
      background={<GroupArtwork group={group} status="none" presentation="background" />}
      titleAccessory={
        <NotificationItem
          itemId={notificationItemId(group.id, "overview", undefined, "group")}
          readOnly
        />
      }
    >
      <GroupCardIndicators group={group} />
    </RecordIdentityCard>
  );
}
