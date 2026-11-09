import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  tableCardGames,
  tableParticipation,
  tablePendingAction,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck,
  Clock3,
  Flag,
  ListOrdered,
  Mail,
  Presentation,
  Trophy,
  UserRoundCheck,
  UsersRound,
} from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableRatingInfo } from "./EventTableRatingInfo";
import { EventTableSchedulePopover } from "./EventTableSchedulePopover";

/** Current management, demonstration and seat/queue facts coexist without granting permissions. */
export function EventTableCardIndicators({ table }: { table: PlannedTableResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const { height } = useWindowDimensions();
  const { userId } = useCommunityApi();
  const [muted, accent, success] = useThemeColor(["muted", "accent", "success"]);
  const participation = tableParticipation(table.myRegistration, table.myPosition);
  const planning = table.eventStatus === "PLANNING";
  const confirmed = table.eventStatus === "CONFIRMED";
  const status = planning ? t("Planning") : confirmed ? t("Confirmed") : t("Terminated");
  const counts = [
    { label: t("Minimum players"), value: table.minPlayers, Icon: UsersRound },
    { label: t("Maximum players"), value: table.maxPlayers, Icon: UsersRound },
    { label: t("Accepted players"), value: table.acceptedCount, Icon: UserRoundCheck },
    { label: t("Waiting list"), value: table.waitingCount, Icon: ListOrdered },
    { label: t("Unconfirmed players"), value: table.pendingRegistrationCount, Icon: Mail },
  ];
  return (
    <>
      {table.demonstratorUserId && table.demonstratorUserId === userId ? (
        <ArtworkStatusPopover size="compact" kind="demonstrator" />
      ) : null}
      {participation !== null && participation !== "request" ? (
        <ArtworkStatusPopover
          size="compact"
          kind={participation}
          label={
            participation === "confirmed"
              ? t("Confirmed player")
              : participation === "waiting"
                ? t("Player on the waiting list")
                : participation === "invitation"
                  ? t("Player with pending invitation")
                  : undefined
          }
          action={tablePendingAction(table)}
        />
      ) : null}
      {table.myPosition === "WAITING" &&
      (participation === "request" || participation === "invitation") ? (
        <ArtworkStatusPopover
          size="compact"
          kind="waiting"
          label={t("Player on the waiting list")}
        />
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={planning ? Clock3 : confirmed ? CalendarCheck : Flag}
        width="content-fit"
        tone={planning ? "warning" : confirmed ? "success" : "muted"}
        triggerClassName="bg-default"
      >
        <ScrollView style={{ maxHeight: Math.min(320, height * 0.5) }}>
          <Typography className="text-foreground">
            {planning
              ? t("The table is being planned. Dates, locations and games are still proposals.")
              : confirmed
                ? t(
                    "The table has been confirmed. Only the chosen date, location and game are shown.",
                  )
                : t("The table has finished. Results are immutable.")}
          </Typography>
          {!planning && !table.confirmed ? (
            <Typography className="text-warning">{t("Excluded from confirmation")}</Typography>
          ) : null}
          <View style={{ marginTop: 8, gap: 4 }}>
            {counts.map(({ label, value, Icon }) => (
              <View
                key={label}
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon size={16} color={muted} accessible={false} />
                <Typography className="text-foreground" style={{ flex: 1 }}>
                  {label}
                </Typography>
                {value === undefined ? (
                  <Skeleton
                    accessibilityLabel={t("Loading…")}
                    style={{ width: 24, height: 16, borderRadius: 4 }}
                  />
                ) : (
                  <Typography className="text-foreground">{i18n.number(value)}</Typography>
                )}
              </View>
            ))}
          </View>
          {table.demonstratorUserId ? (
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Presentation size={16} color={accent} accessible={false} />
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {t("Demonstrator")}:{" "}
                {table.demonstratorName === undefined
                  ? t("Loading…")
                  : table.demonstratorName || t("Unknown")}
              </Typography>
            </View>
          ) : null}
          {table.eventStatus === "TERMINATED" && table.winners?.length ? (
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Trophy size={16} color={success} accessible={false} />
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {t("Winners")}: {table.winners.map((row) => row.name).join(", ")}
              </Typography>
            </View>
          ) : null}
        </ScrollView>
      </HelpPopover>
      <EventTableRatingInfo enabled={table.rankingEnabled} />
      <EventTableSchedulePopover table={table} kind="dates" />
      <EventTableSchedulePopover table={table} kind="locations" />
      <EventTableGamesPopover games={tableCardGames(table)} name={table.name} />
    </>
  );
}
