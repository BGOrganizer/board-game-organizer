import { notificationItemId, type PlannedTableResponse } from "@board-game-organizer/schemas";
import { Dices } from "lucide-react-native";
import type { ReactNode } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EventTableCardIndicators } from "./EventTableCardIndicators";

export function EventTableInfo({
  table,
  titleAction,
}: {
  table: PlannedTableResponse;
  titleAction?: ReactNode;
}) {
  return (
    <RecordIdentityCard
      titleAction={titleAction}
      title={table.name}
      icon={Dices}
      background={
        <AnimatedDicebearArtwork seed={table.id} variant="planets" presentation="background" />
      }
      titleAccessory={
        titleAction ? undefined : (
          <NotificationItem itemId={notificationItemId(table.id, "overview", undefined, "table")} />
        )
      }
    >
      <EventTableCardIndicators table={table} />
    </RecordIdentityCard>
  );
}
