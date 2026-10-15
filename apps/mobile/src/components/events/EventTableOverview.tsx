import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { matchParticipants, useEventTableContext } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Armchair,
  CalendarDays,
  Gamepad2,
  LockKeyhole,
  Presentation,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InfoSection as TableSection } from "@/components/common/ui/InfoSection";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { GameListRow } from "@/components/games/GameListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableHeading } from "./EventTableHeading";

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
  const frozen =
    match && match.match.status !== "PLANNING" ? matchParticipants(match).length : undefined;
  const confirmed = table?.confirmedCount ?? frozen;
  const reserved = table?.reservedCount ?? frozen;
  const max = table?.maxPlayers ?? match?.match.maxPlayers;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <EventTableHeading
          name={table?.name ?? match?.match.eventTable?.tableName ?? t("Table details")}
          ratingsEnabled={table?.openSkill ?? match?.match.eventTable?.openSkill ?? false}
        />
        {confirmed !== undefined && max !== undefined && reserved !== undefined ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <UsersRound size={18} color={muted} />
              <Typography
                className="text-sm text-foreground"
                accessibilityLabel={`${t("confirmed players")}: ${confirmed}`}
              >
                {confirmed}
              </Typography>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Armchair size={18} color={muted} />
              <Typography
                className="text-sm text-foreground"
                accessibilityLabel={`${t("Maximum players")}: ${max}`}
              >
                {max}
              </Typography>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <LockKeyhole size={18} color={muted} />
              <Typography
                className="text-sm text-foreground"
                accessibilityLabel={`${t("reserved places")}: ${reserved}`}
              >
                {reserved}
              </Typography>
            </View>
          </View>
        ) : (
          <Skeleton style={{ width: "100%", height: 24, borderRadius: 4 }} />
        )}
      </View>
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
      {table?.demonstrator ? (
        <TableSection
          label={t("Demonstrator")}
          helpLabel={t("Demonstrator help")}
          help={t(
            "The demonstrator explains the game and can record this table's results. This role does not automatically reserve a player seat.",
          )}
          icon={Presentation}
        >
          <UserListRow
            name={
              table.demonstrator.name || table.demonstrator.username || t("Username unavailable")
            }
            secondary={table.demonstrator.username ?? t("Username unavailable")}
            avatarUrl={table.demonstrator.avatarUrl}
          />
        </TableSection>
      ) : null}
      {!context.open && event ? (
        <Typography className="text-sm text-muted">
          {t("Bookings are closed. Results can still be recorded.")}
        </Typography>
      ) : null}
    </View>
  );
}
