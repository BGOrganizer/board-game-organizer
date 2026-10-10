import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import {
  formatLocationAddress,
  matchParticipants,
  useEventTableContext,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Clock3, Dices, MapPin, Presentation, UsersRound } from "lucide-react-native";
import { Image, View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

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
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const context = useEventTableContext(useCommunityApi(), eventId, tableId);
  const { event, table } = context;
  const date = new Intl.DateTimeFormat(i18n.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: event?.timeZone,
  });
  const start = table?.startsAt ?? match?.match.selectedDate;
  const end = table?.endsAt ?? match?.match.eventTable?.endsAt;
  const game = match?.games.find((game) => game.id === match.match.selectedGameId);
  const gameName = table?.gameName ?? game?.name;
  const image = table?.image ?? game?.thumbnail;
  const location = event?.location ?? match?.match.locations?.[0];
  const frozen =
    match && match.match.status !== "PLANNING" ? matchParticipants(match).length : undefined;
  const confirmed = table?.confirmedCount ?? frozen;
  const reserved = table?.reservedCount ?? frozen;
  const min = table?.minPlayers ?? match?.match.minPlayers;
  const max = table?.maxPlayers ?? match?.match.maxPlayers;
  const fields = [
    {
      Icon: Clock3,
      label: t("Start time"),
      value: start ? date.format(new Date(start)) : undefined,
    },
    { Icon: Clock3, label: t("End time"), value: end ? date.format(new Date(end)) : undefined },
    {
      Icon: MapPin,
      label: t("Location"),
      value: location ? `${location.name}\n${formatLocationAddress(location.address)}` : undefined,
    },
    {
      Icon: UsersRound,
      label: t("Players"),
      value: min !== undefined && max !== undefined ? `${min}–${max}` : undefined,
    },
  ];
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
      <GroupedList>
        {fields.map(({ Icon, label, value }) => (
          <GroupedRow key={label}>
            <Icon size={20} color={muted} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Typography className="text-sm font-semibold text-foreground">{label}</Typography>
              {value ? (
                <Typography className="text-foreground">{value}</Typography>
              ) : (
                <Skeleton style={{ width: 160, height: 24, borderRadius: 4 }} />
              )}
            </View>
          </GroupedRow>
        ))}
        <GroupedRow>
          <Dices size={20} color={muted} />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
            {gameName ? (
              <>
                <View
                  style={{ width: 80, height: 80, alignItems: "center", justifyContent: "center" }}
                >
                  {image ? (
                    <Image
                      source={{ uri: image }}
                      accessibilityLabel={gameName}
                      resizeMode="contain"
                      style={{ width: 80, height: 80, borderRadius: 12 }}
                    />
                  ) : (
                    <Dices size={36} color={muted} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Typography className="text-sm font-semibold text-foreground">
                    {t("Board games")}
                  </Typography>
                  <Typography className="text-foreground">{gameName}</Typography>
                </View>
              </>
            ) : (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            )}
          </View>
        </GroupedRow>
        <GroupedRow>
          {confirmed !== undefined && reserved !== undefined ? (
            <Typography className="text-sm text-muted">
              {confirmed}/{max} {t("confirmed players")} · {reserved} {t("reserved places")}
            </Typography>
          ) : (
            <Skeleton style={{ width: "100%", height: 24, borderRadius: 4 }} />
          )}
        </GroupedRow>
        {table?.demonstrator ? (
          <GroupedRow>
            <Presentation size={20} color={muted} />
            <Typography className="text-foreground" style={{ flex: 1 }}>
              {t("Demonstrator")}: {table.demonstrator.username ?? t("Username unavailable")}
            </Typography>
          </GroupedRow>
        ) : null}
      </GroupedList>
      {!context.open && event ? (
        <Typography className="text-sm text-muted">
          {t("Bookings are closed. Results can still be recorded.")}
        </Typography>
      ) : null}
    </View>
  );
}
