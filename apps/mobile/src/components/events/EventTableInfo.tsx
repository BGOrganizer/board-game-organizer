import { notificationItemId, type PlannedTableResponse } from "@board-game-organizer/schemas";
import { useThemeColor } from "heroui-native/hooks";
import { Dices } from "lucide-react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EventTableCardIndicators } from "./EventTableCardIndicators";

export function EventTableInfo({ table }: { table: PlannedTableResponse }) {
  const foreground = useThemeColor("foreground");
  return (
    <RecordIdentityCard
      title={table.name}
      icon={<Dices size={20} color={foreground} accessible={false} />}
      background={
        <AnimatedDicebearArtwork seed={table.id} variant="planets" presentation="background" />
      }
      titleAccessory={
        <NotificationItem
          itemId={notificationItemId(table.id, "overview", undefined, "table")}
          readOnly
        />
      }
    >
      <EventTableCardIndicators table={table} />
    </RecordIdentityCard>
  );
}
