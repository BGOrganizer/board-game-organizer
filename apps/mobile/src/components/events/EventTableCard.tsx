import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useEventCutoff } from "@board-game-organizer/shared";
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
import { ScrollView, View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
import { useT } from "@/lib/i18n";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
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
    [muted, warning, success] = useThemeColor(["muted", "warning", "success"]),
    number = new Intl.NumberFormat(i18n.locale);
  const registration = table.myRegistration,
    pending = registration?.status === "PENDING",
    invited = registration?.kind === "INVITATION",
    waiting = table.myPosition === "WAITING";
  const accepted = registration?.status === "ACCEPTED" || table.myPosition === "FROZEN",
    StatusIcon = waiting ? ListOrdered : UserRoundCheck;
  const games = table.gamesDetail.filter(
      (game) =>
        table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
    ),
    remaining = Math.max(0, games.length - 1);
  const closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const canRespond =
    table.eventStatus === "PLANNING" && table.canRespond && !closed && pending && invited;
  const counts = [
    {
      icon: UserRoundMinus,
      label: t("Minimum players"),
      value: table.minPlayers,
      description: t("Minimum players"),
    },
    {
      icon: UserRoundPlus,
      label: t("Maximum players"),
      value: table.maxPlayers,
      description: t("Maximum players"),
    },
    {
      icon: UserRoundCheck,
      label: t("Accepted players"),
      value: table.acceptedCount,
      description: t("Accepted players, including the waiting list."),
    },
    {
      icon: ListOrdered,
      label: t("Waiting list"),
      value: table.waitingCount,
      description: t("Waiting list"),
    },
    {
      icon: Clock3,
      label: t("Pending players"),
      value: table.pendingRegistrationCount,
      description: t("Pending players, including reserved waiting-list places."),
    },
  ];
  return (
    <LinkedListCard
      label={`${t("Open table")}: ${table.name}`}
      onPress={() =>
        router.push({
          pathname: "/event/table",
          params: {
            eventId: table.eventId,
            tableId: table.id,
            ...(context === "event" ? { fromEvent: table.eventId } : {}),
          },
        })
      }
      leadingActions={
        <HelpPopover label={`${t("Players")}: ${t("Field help")}`} title={t("Players")}>
          <IconLegend items={counts.map(({ icon, description }) => ({ icon, description }))} />
        </HelpPopover>
      }
      actions={
        canRespond && registration ? (
          <EventTableInvitationActions eventId={table.eventId} registration={registration} />
        ) : undefined
      }
    >
      <View style={{ width: 64, height: 64, flexShrink: 0 }}>
        <AnimatedDicebearArtwork seed={table.id} variant="planets" />
        {pending ? (
          <PendingArtworkBadge
            kind={invited ? "invitation" : "request"}
            label={invited ? t("Invitation received") : t("Participation requested")}
          />
        ) : waiting || accepted ? (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={waiting ? t("Waiting list") : t("Confirmed player")}
            className="bg-surface"
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              padding: 4,
              borderTopLeftRadius: 8,
            }}
          >
            <StatusIcon size={16} color={waiting ? warning : success} accessible={false} />
          </View>
        ) : null}
      </View>
      <ListCardBody
        title={table.name}
        titleIcon={<Dices size={16} color={muted} accessible={false} />}
        titleAccessory={<EventTableRatingBadge enabled={table.rankingEnabled} />}
      >
        <View style={{ gap: 8, paddingBottom: 48 }}>
          {context === "personal" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
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
                  {table.eventName}
                </Typography>
              </View>
              {table.groupId ? (
                <>
                  <Typography className="text-muted" accessible={false}>
                    ·
                  </Typography>
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
                        {table.groupName}
                      </Typography>
                    ) : (
                      <Skeleton style={{ width: 112, height: 16, borderRadius: 4 }} />
                    )}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 12 }}
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
          </ScrollView>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Dices size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
              {games[0]?.name ?? t("Unknown")}
              {remaining > 0
                ? ` · ${i18n._({ id: "event.table.moreGames", message: "{remaining, plural, one {+# game} other {+# games}}", values: { remaining } })}`
                : ""}
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
