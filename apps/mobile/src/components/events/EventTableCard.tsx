import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  tableParticipation,
  tablePendingAction,
  useEventCutoff,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  Clock3,
  Dices,
  ListOrdered,
  Presentation,
  Trophy,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventCardSchedule } from "./EventCardSchedule";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableRatingBadge } from "./EventTableRatingBadge";
export function EventTableCard({
  table,
  context = "personal",
}: {
  table: PlannedTableResponse;
  context?: "personal" | "event";
}) {
  const t = useT(),
    { i18n } = useLingui(),
    router = useRouter(),
    [muted, warning] = useThemeColor(["muted", "warning"]),
    number = new Intl.NumberFormat(i18n.locale);
  const closed = useEventCutoff(
    table.bookingClosesAt,
    table.groupType === "PUBLIC" && table.eventStatus === "PLANNING",
  );
  const { userId } = useCommunityApi();
  const manager = canManageEvent(table, userId);
  const indicator = tableParticipation(table.myRegistration, table.myPosition);
  const games = table.gamesDetail.filter(
      (game) =>
        table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
    ),
    remaining = Math.max(0, games.length - 1);
  const attention = useNotificationAttentionContext(),
    attentionTarget = { kind: "table", id: table.id } as const;
  const counts = [
    {
      icon: UserRoundMinus,
      label: t("Minimum players"),
      value: table.minPlayers,
    },
    {
      icon: UserRoundPlus,
      label: t("Maximum players"),
      value: table.maxPlayers,
    },
    {
      icon: UserRoundCheck,
      label: t("Accepted players"),
      value: table.acceptedCount,
    },
    {
      icon: ListOrdered,
      label: t("Waiting list"),
      value: table.waitingCount,
    },
    {
      icon: Clock3,
      label: t("Pending players"),
      value: table.pendingRegistrationCount,
    },
  ];
  return (
    <LinkedListCard
      label={`${t("Open table")}: ${table.name}`}
      notificationCount={attention?.get(attentionTarget)?.count}
      onPress={() => {
        router.push({
          pathname: "/event/table",
          params: {
            eventId: table.eventId,
            tableId: table.id,
            ...(context === "event" ? { fromEvent: table.eventId } : {}),
          },
        });
      }}
      leadingActions={
        <>
          {indicator !== null ? (
            <ArtworkStatusPopover
              kind={indicator}
              action={closed ? null : tablePendingAction(table)}
            />
          ) : null}
          {manager ? (
            <ArtworkStatusPopover kind="manager" />
          ) : indicator === null ? (
            <ArtworkStatusPopover kind="viewer" />
          ) : null}
          {table.demonstratorUserId && table.demonstratorUserId === userId ? (
            <ArtworkStatusPopover kind="demonstrator" />
          ) : null}
          <EventTableGamesPopover games={games} name={table.name} />
        </>
      }
      artwork={<AnimatedDicebearArtwork seed={table.id} variant="planets" />}
    >
      <ListCardBody
        title={table.name}
        unread={Boolean(attention?.get(attentionTarget)?.count)}
        titleIcon={<Dices size={16} color={muted} accessible={false} />}
        titleAccessory={<EventTableRatingBadge enabled={table.rankingEnabled} />}
      >
        <View style={{ gap: 8 }}>
          {context === "personal" ? (
            <>
              <View style={{ gap: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 1,
                    maxWidth: "100%",
                  }}
                >
                  <CalendarDays size={16} color={muted} accessible={false} />
                  <Typography className="text-sm text-foreground" style={{ flexShrink: 1 }}>
                    {t("Event")}: {table.eventName}
                  </Typography>
                </View>
                {table.groupId ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 1,
                      maxWidth: "100%",
                    }}
                  >
                    <UsersRound size={16} color={muted} accessible={false} />
                    {table.groupName ? (
                      <Typography className="text-sm text-muted" style={{ flexShrink: 1 }}>
                        {t("Group")}: {table.groupName}
                      </Typography>
                    ) : (
                      <Skeleton style={{ width: 112, height: 16, borderRadius: 4 }} />
                    )}
                  </View>
                ) : null}
              </View>
              <EventCardSchedule schedule={table.eventSchedule} />
            </>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 12,
              rowGap: 4,
            }}
          >
            {counts.map(({ icon: Icon, label, value }) => (
              <View
                key={label}
                accessible
                accessibilityLabel={`${label}: ${value === undefined ? t("Loading…") : number.format(value)}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Icon size={16} color={muted} accessible={false} />
                {value === undefined ? (
                  <Skeleton style={{ width: 20, height: 16, borderRadius: 4 }} />
                ) : (
                  <Typography className="text-sm text-foreground">
                    {number.format(value)}
                  </Typography>
                )}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Dices size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
              {games[0]?.name ?? t("Unknown")}
              {remaining > 0 ? (
                <>
                  {" · "}
                  <Typography className="text-sm text-accent-soft-foreground">
                    {i18n._({
                      id: "event.table.moreGames",
                      message: "{remaining, plural, one {+# game} other {+# games}}",
                      values: { remaining },
                    })}
                  </Typography>
                </>
              ) : null}
            </Typography>
          </View>
          {table.demonstratorUserId ? (
            <View
              accessible
              accessibilityLabel={`${t("Demonstrator")}: ${table.demonstratorName === undefined ? t("Loading…") : table.demonstratorName || t("Unknown")}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Presentation size={16} color={muted} accessible={false} />
              {table.demonstratorName === undefined ? (
                <Skeleton style={{ width: 112, height: 16, borderRadius: 4 }} />
              ) : (
                <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
                  {table.demonstratorName || t("Unknown")}
                </Typography>
              )}
            </View>
          ) : null}
          {table.eventStatus !== "PLANNING" && !table.confirmed ? (
            <Typography className="text-sm text-warning">
              {t("Excluded from confirmation")}
            </Typography>
          ) : null}
          {table.eventStatus === "TERMINATED" && table.winners?.length ? (
            <View
              accessible
              accessibilityLabel={`${t("Winners")}: ${table.winners.map((row) => row.name).join(", ")}`}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
            >
              <Trophy size={16} color={warning} accessible={false} />
              <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
                {table.winners.map((row) => row.name).join(", ")}
              </Typography>
            </View>
          ) : null}
        </View>
      </ListCardBody>
    </LinkedListCard>
  );
}
