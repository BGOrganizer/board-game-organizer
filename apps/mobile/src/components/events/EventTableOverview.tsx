import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { matchParticipants, useEventTableContext } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, Gamepad2, type LucideIcon, MapPin, Presentation } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

function TableSection({
  label,
  helpLabel,
  help,
  icon: Icon,
  children,
}: {
  label: string;
  helpLabel: string;
  help: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const muted = useThemeColor("muted");
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon size={18} color={muted} />
        <Typography accessibilityRole="header" className="font-semibold text-foreground">
          {label}
        </Typography>
        <HelpPopover label={helpLabel} title={label}>
          <Popover.Description>{help}</Popover.Description>
        </HelpPopover>
      </View>
      <GroupedList>{children}</GroupedList>
    </View>
  );
}

export function EventTableOverview({
  eventId,
  tableId,
  match,
}: {
  eventId: string;
  tableId: string;
  match?: MatchDetailResponse;
}) {
  const t = useT();
  const muted = useThemeColor("muted");
  const context = useEventTableContext(useCommunityApi(), eventId, tableId);
  const { event, table } = context;
  const start = table?.startsAt ?? match?.match.selectedDate;
  const end = table?.endsAt ?? match?.match.eventTable?.endsAt;
  const game = match?.games.find((game) => game.id === match.match.selectedGameId);
  const gameName = table?.gameName ?? game?.name;
  const location = event?.location ?? match?.match.locations?.[0];
  const frozen =
    match && match.match.status !== "PLANNING" ? matchParticipants(match).length : undefined;
  const confirmed = table?.confirmedCount ?? frozen;
  const reserved = table?.reservedCount ?? frozen;
  const max = table?.maxPlayers ?? match?.match.maxPlayers;
  return (
    <View style={{ gap: 16 }}>
      {context.eventQuery.error || context.tableQuery.error ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load table")}
          </Typography>
          <Button
            variant="secondary"
            onPress={() => {
              void context.eventQuery.refetch();
              if (event) void context.tableQuery.refetch();
            }}
          >
            {t("Retry")}
          </Button>
        </View>
      ) : null}
      <TableSection
        label={t("Date and time")}
        helpLabel={t("Date and time help")}
        help={t(
          "The event day and this table's start and end times are fixed. There is no voting.",
        )}
        icon={CalendarDays}
      >
        <GroupedRow>
          {start ? (
            <DateTimeInfo startsAt={start} endsAt={end} timeZone={event?.timeZone} />
          ) : (
            <Skeleton style={{ width: 220, height: 24, borderRadius: 4 }} />
          )}
        </GroupedRow>
      </TableSection>
      <TableSection
        label={t("Location")}
        helpLabel={t("Table location help")}
        help={t(
          "This table uses the event's verified venue and address. There is no location voting.",
        )}
        icon={MapPin}
      >
        {location ? (
          <LocationListRow name={location.name} address={location.address} />
        ) : (
          <GroupedRow>
            <Skeleton style={{ width: "100%", height: 48, borderRadius: 4 }} />
          </GroupedRow>
        )}
      </TableSection>
      <TableSection
        label={t("Board games")}
        helpLabel={t("Table game help")}
        help={t(
          "This table's game is fixed. The cover, BoardGameGeek rating and rank describe the selected game, not player ratings.",
        )}
        icon={Gamepad2}
      >
        {gameName ? (
          <GameListRow
            name={gameName}
            imageUrl={table?.image ?? game?.thumbnail}
            year={table?.yearPublished ?? game?.yearPublished}
            average={table?.average ?? game?.average}
            rank={table?.rank ?? game?.rank}
          />
        ) : (
          <GroupedRow>
            <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
          </GroupedRow>
        )}
      </TableSection>
      {confirmed !== undefined && reserved !== undefined ? (
        <Typography className="text-sm text-muted">
          {confirmed}/{max} {t("confirmed players")} · {reserved} {t("reserved places")}
        </Typography>
      ) : (
        <Skeleton style={{ width: "100%", height: 24, borderRadius: 4 }} />
      )}
      {table?.demonstrator ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Presentation size={18} color={muted} />
          <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
            {t("Demonstrator")}: {table.demonstrator.username ?? t("Username unavailable")}
          </Typography>
        </View>
      ) : null}
      {!context.open && event ? (
        <Typography className="text-sm text-muted">
          {t("Bookings are closed. Results can still be recorded.")}
        </Typography>
      ) : null}
    </View>
  );
}
