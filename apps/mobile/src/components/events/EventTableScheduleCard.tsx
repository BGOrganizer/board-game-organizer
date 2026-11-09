import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventTableSchedule } from "@board-game-organizer/shared";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { ListCard } from "@/components/common/ui/ListCard";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";

export function EventTableScheduleCard({
  table,
  timeZone,
}: {
  table: PlannedTableResponse;
  timeZone?: string;
}) {
  const t = useT();
  const schedule = eventTableSchedule(table);
  if (!schedule) return null;
  return (
    <View accessibilityLabel={t("Table schedule")}>
      <ListCard>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <Typography className="text-sm text-foreground">{t("Date")}:</Typography>
            {timeZone ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <DateTimeInfo
                  startsAt={schedule.startsAt}
                  endsAt={schedule.endsAt}
                  timeZone={timeZone}
                  dateStyle="long"
                />
              </View>
            ) : (
              <View accessible accessibilityLabel={t("Loading…")} style={{ flex: 1, minWidth: 0 }}>
                <Skeleton style={{ width: "100%", maxWidth: 208, height: 16, borderRadius: 4 }} />
              </View>
            )}
          </View>
          {schedule.demonstrator ? (
            <GroupedList>
              <UserListRow
                name={schedule.demonstrator.name ?? t("Unknown")}
                avatarUrl={schedule.demonstrator.avatarUrl}
                secondary={t("Demonstrator")}
              />
            </GroupedList>
          ) : null}
        </View>
      </ListCard>
    </View>
  );
}
