import type { VerifiedLocation } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, MapPin } from "lucide-react-native";
import { FlatList, useWindowDimensions } from "react-native";
import { useT } from "@/lib/i18n";
import { DateTimeInfo } from "./DateTimeInfo";
import { GroupedRow } from "./GroupedRow";
import { HelpPopover } from "./HelpPopover";

export type ScheduleOptionRow =
  | { id: string; date: { startsAt: string; timeZone: string } }
  | { id: string; location: VerifiedLocation };

export function ScheduleOptionsPopover({
  name,
  kind,
  planning,
  rows,
}: {
  name: string;
  kind: "dates" | "locations";
  planning: boolean;
  rows: ScheduleOptionRow[] | undefined;
}) {
  const t = useT();
  const muted = useThemeColor("muted");
  const { width, height } = useWindowDimensions();
  const dates = kind === "dates";
  const title = dates ? t("Dates and times") : t("Locations");
  return (
    <HelpPopover
      label={`${title}: ${name}`}
      title={title}
      icon={dates ? CalendarDays : MapPin}
      size="compact"
      tone={planning ? "warning" : "success"}
      triggerClassName="bg-default"
      width={Math.min(360, width - 32)}
    >
      <FlatList<ScheduleOptionRow>
        data={rows ?? []}
        keyExtractor={(row) => row.id}
        style={{ maxHeight: Math.min(320, height * 0.5) }}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        renderItem={({ item }) => (
          <GroupedRow>
            {"date" in item ? (
              <DateTimeInfo
                startsAt={item.date.startsAt}
                timeZone={item.date.timeZone}
                dateStyle="long"
              />
            ) : (
              <>
                <MapPin size={16} color={muted} accessible={false} />
                <Typography className="text-foreground" style={{ flex: 1, minWidth: 0 }}>
                  {formatLocationAddress(item.location.address)}
                </Typography>
              </>
            )}
          </GroupedRow>
        )}
        ListEmptyComponent={
          rows === undefined ? (
            <Skeleton
              accessibilityLabel={t("Loading…")}
              style={{ width: "100%", height: 64, borderRadius: 8 }}
            />
          ) : (
            <Typography className="text-muted">
              {dates ? t("No date selected") : t("No location selected")}
            </Typography>
          )
        }
      />
    </HelpPopover>
  );
}
