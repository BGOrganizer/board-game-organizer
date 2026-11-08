import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  tableCardGames,
  tableParticipation,
  tablePendingAction,
  useEventCutoff,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarCheck, CircleOff, Clock3, Flag, Trophy } from "lucide-react-native";
import { View } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableSchedulePopover } from "./EventTableSchedulePopover";

/** Current management, demonstration and seat/queue facts coexist without granting permissions. */
export function EventTableCardIndicators({ table }: { table: PlannedTableResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const { userId } = useCommunityApi();
  const manager = canManageEvent(table, userId);
  const participation = tableParticipation(table.myRegistration, table.myPosition);
  const closed = useEventCutoff(
    table.bookingClosesAt,
    table.groupType === "PUBLIC" && table.eventStatus === "PLANNING",
  );
  const planning = table.eventStatus === "PLANNING";
  const confirmed = table.eventStatus === "CONFIRMED";
  const status = planning ? t("Planning") : confirmed ? t("Confirmed") : t("Terminated");
  const counts = [
    { label: t("Minimum players"), value: table.minPlayers },
    { label: t("Maximum players"), value: table.maxPlayers },
    { label: t("Accepted players"), value: table.acceptedCount },
    { label: t("Waiting list"), value: table.waitingCount },
    { label: t("Pending players"), value: table.pendingRegistrationCount },
  ];
  return (
    <>
      {manager ? (
        <ArtworkStatusPopover
          size="compact"
          kind={table.managementRole === "admin" ? "admin" : "manager"}
          label={table.managementRole === "moderator" ? t("Group moderator") : undefined}
        />
      ) : null}
      {table.demonstratorUserId && table.demonstratorUserId === userId ? (
        <ArtworkStatusPopover size="compact" kind="demonstrator" />
      ) : null}
      {participation !== null ? (
        <ArtworkStatusPopover
          size="compact"
          kind={participation}
          action={closed ? null : tablePendingAction(table)}
        />
      ) : null}
      {table.myPosition === "WAITING" &&
      (participation === "request" || participation === "invitation") ? (
        <ArtworkStatusPopover size="compact" kind="waiting" />
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={planning ? Clock3 : confirmed ? CalendarCheck : Flag}
        tone={planning ? "warning" : confirmed ? "success" : "muted"}
        triggerClassName="bg-default"
      >
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
          {counts.map(({ label, value }) => (
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
              <Typography className="text-foreground" style={{ flexShrink: 1 }}>
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
          <View style={{ marginTop: 8 }}>
            <Typography className="text-foreground">
              {t("Demonstrator")}:{" "}
              {table.demonstratorName === undefined
                ? t("Loading…")
                : table.demonstratorName || t("Unknown")}
            </Typography>
          </View>
        ) : null}
        {table.eventStatus === "TERMINATED" && table.winners?.length ? (
          <Typography className="text-foreground" style={{ marginTop: 8 }}>
            {t("Winners")}: {table.winners.map((row) => row.name).join(", ")}
          </Typography>
        ) : null}
      </HelpPopover>
      <HelpPopover
        size="compact"
        label={table.rankingEnabled ? t("Rating enabled") : t("Rating disabled")}
        title={t("Rating")}
        icon={table.rankingEnabled ? Trophy : CircleOff}
        tone={table.rankingEnabled ? "accent" : "muted"}
        triggerClassName="bg-default"
      >
        <Typography className="text-foreground">
          {table.rankingEnabled
            ? t("This table contributes to player ratings when eligible results are finalized.")
            : t("This table does not update player ratings.")}
        </Typography>
      </HelpPopover>
      <EventTableSchedulePopover table={table} kind="dates" />
      <EventTableSchedulePopover table={table} kind="locations" />
      <EventTableGamesPopover games={tableCardGames(table)} name={table.name} />
    </>
  );
}
