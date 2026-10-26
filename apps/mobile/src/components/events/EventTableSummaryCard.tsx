import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useEventCutoff } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Clock3, Dices, Mail, UserRoundCheck, UsersRound } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { useT } from "@/lib/i18n";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
import { EventTableRatingBadge } from "./EventTableRatingBadge";
export function EventTableSummaryCard({ table }: { table: PlannedTableResponse }) {
  const t = useT(),
    { i18n } = useLingui(),
    number = new Intl.NumberFormat(i18n.locale),
    router = useRouter(),
    muted = useThemeColor("muted");
  const closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const games = table.gamesDetail.filter(
    (game) =>
      table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
  );
  const remaining = Math.max(0, games.length - 1);
  const counts = [
    {
      icon: UserRoundCheck,
      label: t("Seated accepted players / minimum required"),
      value: `${number.format(table.seatedCount)}/${number.format(table.minPlayers)}`,
    },
    { icon: UsersRound, label: t("Maximum players"), value: number.format(table.maxPlayers) },
    { icon: Clock3, label: t("Waiting"), value: number.format(table.waitingCount) },
    { icon: Mail, label: t("Pending invitations"), value: number.format(table.pendingCount) },
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
          {table.canRespond && !closed && table.myRegistration ? (
            <EventTableInvitationActions
              eventId={table.eventId}
              registration={table.myRegistration}
            />
          ) : null}
        </>
      }
    >
      <AnimatedDicebearArtwork seed={table.id} variant="shapes" />
      <View style={{ flex: 1, minWidth: 0, gap: 8, paddingBottom: 48 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Dices size={16} color={muted} accessible={false} />
          <Typography
            className="font-semibold text-foreground"
            numberOfLines={2}
            style={{ flex: 1, minWidth: 0 }}
          >
            {table.name}
          </Typography>
          <EventTableRatingBadge enabled={table.rankingEnabled} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          {counts.map(({ icon: Icon, label, value }) => (
            <View
              key={label}
              accessible
              accessibilityLabel={`${label}: ${value}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Icon size={16} color={muted} accessible={false} />
              <Typography className="text-sm text-foreground">{value}</Typography>
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Dices size={16} color={muted} accessible={false} />
          <Typography className="text-foreground" style={{ flex: 1 }}>
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
        {table.myPosition === "WAITING" || table.myPosition === "FROZEN" ? (
          <Typography className="text-sm text-foreground">
            {table.myPosition === "WAITING" ? t("Waiting list") : t("Confirmed player")}
          </Typography>
        ) : null}
        {table.canRespond && !closed && table.myRegistration ? (
          <Typography className="text-sm text-foreground">{t("Invitation received")}</Typography>
        ) : null}
      </View>
    </LinkedListCard>
  );
}
