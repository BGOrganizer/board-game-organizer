import { notificationItemId, type PlannedTableResponse } from "@board-game-organizer/schemas";
import { Dices } from "lucide-react-native";
import type { ReactNode } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useTableTitle } from "@/lib/events/useTableTitle";
import { EventTableCardIndicators } from "./EventTableCardIndicators";

export function EventTableInfo({
  table,
  titleAction,
}: {
  table: PlannedTableResponse;
  titleAction?: ReactNode;
}) {
  const title = useTableTitle()(table);
  return (
    <RecordIdentityCard
      titleAction={titleAction}
      title={title}
      icon={Dices}
      background={
        <AnimatedDicebearArtwork seed={table.id} variant="tables" presentation="background" />
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
