import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  CARD_STATE_TONES,
  RECORD_USER_ROLES,
  tableCardGames,
  tableCardRoles,
  tableCardState,
  tablePendingAction,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck,
  CalendarClock,
  Flag,
  ListOrdered,
  Mail,
  UserRoundCheck,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { cardStateMessages } from "@/lib/eventCardMessages";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventCardTableSummaries } from "./EventCardTableSummaries";
import { EventRolePopover } from "./EventRolePopover";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableRatingInfo } from "./EventTableRatingInfo";
import { EventTableSchedulePopover } from "./EventTableSchedulePopover";

export function EventTableCardIndicators({ table }: { table: PlannedTableResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const { userId } = useCommunityApi();
  const muted = useThemeColor("muted");
  const roles = tableCardRoles(table, userId);
  const state = tableCardState(table, userId);
  const summary = table.cardSummary;
  const status = t(cardStateMessages[state]);
  const variant =
    state === "TABLE_EXCLUDED" ? "danger" : state === "EXCLUDED" ? "danger-soft" : "ghost";
  const counts = [
    { label: t("Minimum players"), value: table.minPlayers, Icon: UsersRound },
    { label: t("Maximum players"), value: table.maxPlayers, Icon: UsersRound },
    { label: t("Accepted players"), value: table.acceptedCount, Icon: UserRoundCheck },
    { label: t("Waiting list"), value: table.waitingCount, Icon: ListOrdered },
    { label: t("Unconfirmed players"), value: table.pendingRegistrationCount, Icon: Mail },
  ];
  return (
    <>
      <EventRolePopover roles={roles} action={tablePendingAction(table)} />
      <EventTableRatingInfo enabled={table.rankingEnabled} />
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={state === "PLANNING" ? CalendarClock : state === "TERMINATED" ? Flag : CalendarCheck}
        tone={CARD_STATE_TONES[state]}
        triggerVariant={variant}
        triggerClassName={variant === "ghost" ? "bg-default" : undefined}
        width="content-fit"
      >
        <View style={{ gap: 8 }}>
          {state === "TERMINATED" ? (
            summary ? (
              <EventCardTableSummaries tables={[summary]} mode="results" showNames={false} />
            ) : (
              <Skeleton
                accessibilityLabel={t("Loading…")}
                style={{ width: 192, height: 20, borderRadius: 4 }}
              />
            )
          ) : (
            <>
              {state === "PLANNING" ? (
                summary ? (
                  <>
                    <Typography className="text-foreground">
                      {summary.ready
                        ? t("Ready for a manager to confirm.")
                        : t("Confirmation requirements are not yet met.")}
                    </Typography>
                    <EventCardTableSummaries tables={[summary]} mode="planning" showNames={false} />
                  </>
                ) : (
                  <Skeleton
                    accessibilityLabel={t("Loading…")}
                    style={{ width: 192, height: 20, borderRadius: 4 }}
                  />
                )
              ) : state === "TABLE_EXCLUDED" ? (
                <Typography className="text-foreground">
                  {t("The table was excluded from confirmation.")}
                </Typography>
              ) : state === "CONFIRMED" ? (
                <Typography className="text-foreground">
                  {t("You have a confirmed place at a table.")}
                </Typography>
              ) : state === "DUTY" ? (
                <>
                  <Typography className="text-foreground">
                    {t("You have an assigned role without a player seat.")}
                  </Typography>
                  {roles.map((role) => (
                    <Typography key={role} className="text-foreground">
                      {t(RECORD_USER_ROLES[role].message)}
                    </Typography>
                  ))}
                </>
              ) : state === "OBSERVER" ? (
                <Typography className="text-foreground">{t("You are not registered.")}</Typography>
              ) : summary ? (
                <EventCardTableSummaries tables={[summary]} mode="exclusions" showNames={false} />
              ) : (
                <Skeleton
                  accessibilityLabel={t("Loading…")}
                  style={{ width: 192, height: 20, borderRadius: 4 }}
                />
              )}
              <View style={{ gap: 4 }}>
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
                <Typography className="text-foreground">
                  {t("Demonstrator")}:{" "}
                  {table.demonstratorName === undefined
                    ? t("Loading…")
                    : table.demonstratorName || t("Unknown")}
                </Typography>
              ) : null}
            </>
          )}
        </View>
      </HelpPopover>
      {table.eventStatus !== "PLANNING" && table.confirmed ? (
        <>
          <EventTableSchedulePopover table={table} kind="locations" />
          <EventTableSchedulePopover table={table} kind="dates" />
          <EventTableGamesPopover games={tableCardGames(table)} name={table.name} />
        </>
      ) : null}
    </>
  );
}
