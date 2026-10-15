import type { EventTableResponse } from "@board-game-organizer/schemas";
import { useRouter } from "expo-router";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { useT } from "@/lib/i18n";
import { EventTableCardBody } from "./EventTableCardBody";

export function EventTableCard({
  table,
  timeZone,
}: {
  table: EventTableResponse;
  timeZone: string;
}) {
  const t = useT();
  const router = useRouter();
  const status =
    table.status === "PLANNING"
      ? null
      : table.status === "CREATED"
        ? t("Confirmed")
        : table.status === "TERMINATED"
          ? t("Finished")
          : t("Cancelled");
  return (
    <LinkedListCard
      label={`${t("Open table")}: ${table.name}`}
      onPress={() =>
        router.push({
          pathname: "/event/table",
          params: { eventId: table.eventId, tableId: table.id },
        })
      }
    >
      <View style={{ flex: 1, gap: 12 }}>
        <EventTableCardBody
          table={table}
          timeZone={timeZone}
          gameName={table.gameName}
          imageUrl={table.image}
          demonstrator={table.demonstrator}
          confirmedCount={table.confirmedCount}
          reservedCount={table.reservedCount}
        />
        {status ? <Typography className="text-sm text-foreground">{status}</Typography> : null}
      </View>
    </LinkedListCard>
  );
}
