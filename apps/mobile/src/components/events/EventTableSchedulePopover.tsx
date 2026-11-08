import type { PlannedTableResponse, VerifiedLocation } from "@board-game-organizer/schemas";
import {
  formatLocationAddress,
  tableCardDates,
  tableCardLocations,
} from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, MapPin } from "lucide-react-native";
import { FlatList, useWindowDimensions } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

type Row =
  | { id: string; date: { startsAt: string; timeZone: string } }
  | { id: string; location: VerifiedLocation };

/** One bounded local metadata list, independent of the parent Event query and voting workflow. */
export function EventTableSchedulePopover({
  table,
  kind,
}: {
  table: PlannedTableResponse;
  kind: "dates" | "locations";
}) {
  const t = useT();
  const muted = useThemeColor("muted");
  const { width, height } = useWindowDimensions();
  const dates = kind === "dates";
  const title = dates ? t("Dates and times") : t("Locations");
  const rows: Row[] | undefined = dates
    ? tableCardDates(table)?.map((date) => ({ id: date.id, date }))
    : tableCardLocations(table)?.map((location) => ({ id: location.id, location }));
  return (
    <HelpPopover
      label={`${title}: ${table.name}`}
      title={title}
      icon={dates ? CalendarDays : MapPin}
      size="compact"
      tone={table.eventStatus === "PLANNING" ? "warning" : "success"}
      triggerClassName="bg-default"
      width={Math.min(360, width - 32)}
    >
      <FlatList<Row>
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
