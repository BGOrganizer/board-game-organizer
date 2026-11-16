import type { ClientEventRecord } from "@board-game-organizer/shared";
import {
  CARD_STATE_TONES,
  eventCardRoles,
  eventCardState,
  eventPendingAction,
  eventRecordVisibility,
  RECORD_USER_ROLES,
} from "@board-game-organizer/shared";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck,
  CalendarClock,
  Flag,
  Globe,
  LockKeyhole,
  Settings,
} from "lucide-react-native";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { cardStateMessages } from "@/lib/eventCardMessages";
import { useT } from "@/lib/i18n";
import { EventCardTableSummaries } from "./EventCardTableSummaries";
import { EventRolePopover } from "./EventRolePopover";
import { EventSchedulePopover } from "./EventSchedulePopover";

export function EventCardIndicators({ event }: { event: ClientEventRecord }) {
  const t = useT();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const roles = eventCardRoles(event);
  const state = eventCardState(event);
  const summary = event.cardSummary;
  const status = t(cardStateMessages[state]);
  const confirmedTables = summary?.tables.filter((table) => table.myParticipation === "CONFIRMED");
  const exclusions = summary?.tables.filter((table) => table.myParticipation === "EXCLUDED");
  const publicEvent = eventRecordVisibility(event, event.groupType) === "PUBLIC";
  return (
    <>
      <EventRolePopover
        roles={roles}
        action={eventPendingAction(event)}
        pending={!!event.optimistic}
      />
      <HelpPopover
        size="compact"
        label={publicEvent ? t("Public event") : t("Private event")}
        title={publicEvent ? t("Public event") : t("Private event")}
        icon={publicEvent ? Globe : LockKeyhole}
        tone={publicEvent ? "accent" : "muted"}
        triggerClassName="bg-default"
      >
        <Typography className="text-foreground">
          {publicEvent
            ? t("Authenticated users can enroll without joining the group.")
            : t("Participation is limited to authorized group members or invited users.")}
        </Typography>
      </HelpPopover>
      {!event.sharedResultsOnly && !event.personalAccessOnly ? (
        <HelpPopover
          size="compact"
          label={t("Settings")}
          title={t("Settings")}
          icon={Settings}
          triggerClassName="bg-default"
        >
          <View style={{ gap: 8 }}>
            <Typography className="text-foreground">
              <Typography className="font-semibold">
                {event.planningMode === "MANUAL" ? t("Manual") : t("Assisted")}
              </Typography>
              :{" "}
              {event.planningMode === "MANUAL"
                ? t(
                    "Managers arrange seats and the waiting list. Confirmation requirements still apply.",
                  )
                : t(
                    "The app seeks compatible players, dates, locations and games. A manager must still confirm.",
                  )}
            </Typography>
            <Typography className="text-foreground">
              <Typography className="font-semibold">
                {event.playerPreference === "BEST" ? t("BGG Best") : t("More players")}
              </Typography>
              :{" "}
              {event.playerPreference === "BEST"
                ? t("Prefers the player count marked Best on BGG.")
                : t(
                    "Prefers the solution that seats more people, respecting votes and constraints.",
                  )}
            </Typography>
            {event.playerPreference === "BEST" &&
            event.planningMode !== "MANUAL" &&
            event.allowBestReduction ? (
              <Typography className="text-foreground">
                {t("Assisted planning may seat fewer players to improve the BGG recommendation.")}
              </Typography>
            ) : null}
          </View>
        </HelpPopover>
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={state === "PLANNING" ? CalendarClock : state === "TERMINATED" ? Flag : CalendarCheck}
        tone={CARD_STATE_TONES[state]}
        triggerClassName="bg-default"
        width={Math.min(360, width - insets.left - insets.right - 32)}
        contentStyle={{ maxHeight: Math.max(0, height - insets.top - insets.bottom - 32) }}
      >
        <View style={{ gap: 8, flexShrink: 1 }}>
          {state === "PLANNING" ? (
            summary ? (
              <>
                <Typography className="text-foreground">
                  {summary.ready
                    ? t("Ready for a manager to confirm.")
                    : t("Confirmation requirements are not yet met.")}
                </Typography>
                <EventCardTableSummaries tables={summary.tables} mode="planning" />
              </>
            ) : (
              <Skeleton
                accessibilityLabel={t("Loading…")}
                style={{ width: 192, height: 20, borderRadius: 4 }}
              />
            )
          ) : state === "TERMINATED" ? (
            summary ? (
              <EventCardTableSummaries
                tables={summary.tables.filter((table) => table.confirmed)}
                mode="results"
              />
            ) : (
              <Skeleton
                accessibilityLabel={t("Loading…")}
                style={{ width: 192, height: 20, borderRadius: 4 }}
              />
            )
          ) : (
            <>
              <Typography className="text-foreground">
                {t("The event has been confirmed.")}
              </Typography>
              {state === "CONFIRMED" ? (
                confirmedTables === undefined ? (
                  <Skeleton
                    accessibilityLabel={t("Loading…")}
                    style={{ width: 96, height: 20, borderRadius: 4 }}
                  />
                ) : (
                  <>
                    <Typography className="text-foreground">
                      {t("Tables where you are confirmed")}:
                    </Typography>
                    <EventCardTableSummaries tables={confirmedTables} mode="confirmed" />
                  </>
                )
              ) : state === "DUTY" ? (
                <Typography className="text-foreground">
                  {t("You have an assigned role without a player seat.")}
                </Typography>
              ) : state === "OBSERVER" ? (
                <Typography className="text-foreground">{t("You are not registered.")}</Typography>
              ) : null}
              {state === "DUTY"
                ? roles.map((role) => (
                    <Typography key={role} className="text-foreground">
                      {t(RECORD_USER_ROLES[role].message)}
                    </Typography>
                  ))
                : null}
              {exclusions?.length ? (
                <EventCardTableSummaries tables={exclusions} mode="exclusions" />
              ) : null}
              {state === "UNKNOWN" ? (
                <Skeleton
                  accessibilityLabel={t("Loading…")}
                  style={{ width: 192, height: 20, borderRadius: 4 }}
                />
              ) : null}
            </>
          )}
        </View>
      </HelpPopover>
      {event.status !== "PLANNING" ? (
        <>
          <EventSchedulePopover event={event} kind="locations" />
          <EventSchedulePopover event={event} kind="dates" />
        </>
      ) : null}
    </>
  );
}
