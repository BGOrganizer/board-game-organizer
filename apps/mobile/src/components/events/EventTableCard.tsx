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
      ? t("Planning")
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
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Typography className="text-sm text-foreground">
            {table.confirmedCount}/{table.maxPlayers} {t("confirmed players")}
          </Typography>
          <Typography className="text-sm text-foreground">
            {table.reservedCount} {t("reserved places")}
          </Typography>
          <Typography className="text-sm text-foreground">{status}</Typography>
        </View>
      </View>
    </LinkedListCard>
  );
}
