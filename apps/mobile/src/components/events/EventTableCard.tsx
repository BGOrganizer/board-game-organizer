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
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableInvitationActions } from "./EventTableInvitationActions";

export function EventTableCard({ table }: { table: PlannedTableResponse }) {
  const t = useT(),
    { i18n } = useLingui(),
    router = useRouter(),
    [muted, warning, success] = useThemeColor(["muted", "warning", "success"]);
  const number = new Intl.NumberFormat(i18n.locale);
  const registration = table.myRegistration,
    actor = useCommunityApi().userId;
  const winner =
    table.eventStatus === "TERMINATED" && table.winners?.some((row) => row.userId === actor);
  const accepted =
      registration?.status === "ACCEPTED" ||
      table.myPosition === "FROZEN" ||
      table.myPosition === "WAITING",
    waiting = table.myPosition === "WAITING";
  const StatusIcon = winner ? Trophy : waiting ? Clock3 : UserRoundCheck;
  const games = table.gamesDetail.filter(
      (game) =>
        table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
    ),
    remaining = Math.max(0, games.length - 1);
  const closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const pending = registration?.status === "PENDING";
  const invited = registration?.kind === "INVITATION";
  const canRespond =
    table.eventStatus === "PLANNING" && table.canRespond && !closed && pending && invited;
  const counts = [
    { icon: UserRoundMinus, label: t("Minimum players"), value: table.minPlayers },
    { icon: UserRoundPlus, label: t("Maximum players"), value: table.maxPlayers },
    { icon: UserRoundCheck, label: t("Accepted players"), value: table.acceptedCount },
    { icon: Clock3, label: t("Pending players"), value: table.pendingRegistrationCount },
  ];
  return (
    <LinkedListCard
      label={`${t("Open table")}: ${table.name}`}
      onPress={() =>
        router.push({
          pathname: "/event/table",
          params: { eventId: table.eventId, tableId: table.id },
        })
      }
      actions={
        <>
          <HelpPopover label={`${t("Players")}: ${t("Field help")}`} title={t("Players")}>
            <IconLegend items={counts.map(({ icon, label }) => ({ icon, description: label }))} />
          </HelpPopover>
          {canRespond && registration ? (
            <EventTableInvitationActions eventId={table.eventId} registration={registration} />
          ) : null}
        </>
      }
    >
      <View style={{ width: 64, height: 64, flexShrink: 0 }}>
        <AnimatedDicebearArtwork seed={table.id} variant="shapes" />
        {winner || (!pending && accepted) ? (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={
              winner ? t("Winner") : waiting ? t("Waiting list") : t("Confirmed player")
            }
            className="bg-surface"
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              padding: 4,
              borderTopLeftRadius: 8,
            }}
          >
            <StatusIcon
              size={16}
              color={winner || waiting ? warning : success}
              accessible={false}
            />
          </View>
        ) : pending ? (
          <PendingArtworkBadge
            kind={invited ? "invitation" : "request"}
            label={invited ? t("Invitation received") : t("Participation requested")}
          />
        ) : null}
      </View>
      <ListCardBody
        title={table.name}
        titleIcon={<Dices size={16} color={muted} accessible={false} />}
      >
        <View style={{ gap: 8, paddingBottom: 48 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <CalendarDays size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
              {table.eventName}
            </Typography>
          </View>
          {table.groupId ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <UsersRound size={16} color={muted} accessible={false} />
              {table.groupName ? (
                <Typography className="text-sm text-muted" style={{ flex: 1 }}>
                  {table.groupName}
                </Typography>
              ) : (
                <Skeleton style={{ width: 112, height: 16, borderRadius: 4 }} />
              )}
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
          {table.eventStatus !== "PLANNING" && !table.confirmed ? (
            <Typography className="text-sm text-warning">
              {t("Excluded from confirmation")}
            </Typography>
          ) : null}
          {table.winners?.length ? (
            <Typography className="text-sm text-foreground">
              {t("Winners")}: {table.winners.map((row) => row.name).join(", ")}
            </Typography>
          ) : null}
        </View>
      </ListCardBody>
    </LinkedListCard>
  );
}
