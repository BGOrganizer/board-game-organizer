import type { ClientEventRecord } from "@board-game-organizer/shared";
import {
  eventParticipationFlags,
  eventPendingAction,
  eventRecordVisibility,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck,
  CalendarClock,
  Flag,
  Globe,
  LockKeyhole,
  Settings,
  UsersRound,
} from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { EventSchedulePopover } from "./EventSchedulePopover";

/** The complete own-registration projection can show accepted and pending participation together. */
export function EventCardIndicators({ event }: { event: ClientEventRecord }) {
  const t = useT();
  const { i18n } = useLingui();
  const { height } = useWindowDimensions();
  const muted = useThemeColor("muted");
  const participation = eventParticipationFlags(event.myRegistrations);
  const own = !event.readOnly && !event.optimistic;
  const planning = event.status === "PLANNING",
    confirmed = event.status === "CONFIRMED";
  const status = planning ? t("Planning") : confirmed ? t("Confirmed") : t("Terminated");
  return (
    <>
      {own && event.canManage && event.managementRole ? (
        <ArtworkStatusPopover
          size="compact"
          kind={event.managementRole === "admin" ? "admin" : "manager"}
          label={event.managementRole === "moderator" ? t("Moderator") : t("Admin")}
        />
      ) : null}
      {own && participation.accepted ? (
        <ArtworkStatusPopover size="compact" kind="accepted" label={t("Accepted participant")} />
      ) : null}
      {own &&
      event.myRegistrations.some((row) => row.status === "PENDING" && row.kind === "INVITATION") ? (
        <ArtworkStatusPopover
          size="compact"
          kind="pending"
          label={t("Participant with pending invitation")}
          action={eventPendingAction(event)}
        />
      ) : null}
      {own && participation.waiting ? (
        <ArtworkStatusPopover
          size="compact"
          kind="waiting"
          label={t("Participant on the waiting list")}
        />
      ) : null}
      {own && event.myDemonstrator ? (
        <ArtworkStatusPopover size="compact" kind="demonstrator" />
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={planning ? CalendarClock : confirmed ? CalendarCheck : Flag}
        tone={planning ? "warning" : confirmed ? "success" : "muted"}
        triggerClassName="bg-default"
        width="content-fit"
      >
        <ScrollView
          style={{ maxHeight: Math.min(320, height * 0.5) }}
          contentContainerStyle={{ gap: 8 }}
        >
          <Typography className="text-foreground">
            {planning
              ? t("The event is being planned. Dates and locations are still proposals.")
              : confirmed
                ? t("The event has been confirmed.")
                : t("The event has finished. Results are immutable.")}
          </Typography>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <UsersRound size={16} color={muted} accessible={false} />
            <Typography className="text-foreground" style={{ flexShrink: 1 }}>
              {t("Players")}: {i18n.number(event.participantCount)}
            </Typography>
          </View>
        </ScrollView>
      </HelpPopover>
      <HelpPopover
        size="compact"
        label={
          eventRecordVisibility(event, event.groupType) === "PUBLIC"
            ? t("Public event")
            : t("Private event")
        }
        title={
          eventRecordVisibility(event, event.groupType) === "PUBLIC"
            ? t("Public event")
            : t("Private event")
        }
        icon={eventRecordVisibility(event, event.groupType) === "PUBLIC" ? Globe : LockKeyhole}
        tone={eventRecordVisibility(event, event.groupType) === "PUBLIC" ? "accent" : "muted"}
        triggerClassName="bg-default"
      >
        <Typography className="text-foreground">
          {eventRecordVisibility(event, event.groupType) === "PUBLIC"
            ? t("Authenticated users can enroll without joining the group.")
            : t("Participation is limited to authorized group members or invited users.")}
        </Typography>
      </HelpPopover>
      <EventSchedulePopover event={event} kind="dates" />
      <EventSchedulePopover event={event} kind="locations" />
      {!event.sharedResultsOnly && !event.personalAccessOnly ? (
        <HelpPopover
          size="compact"
          label={t("Settings")}
          title={t("Settings")}
          icon={Settings}
          triggerClassName="bg-default"
        >
          <View style={{ gap: 8 }}>
            <Typography>
              <Typography className="font-semibold">
                {event.planningMode === "MANUAL" ? t("Manual") : t("Assisted")}
              </Typography>
              :{" "}
              {event.planningMode === "MANUAL"
                ? t("Managers arrange the seats; confirmation is always manual.")
                : t(
                    "The app seeks agreement while protecting seated players; confirmation is always manual.",
                  )}
            </Typography>
            <Typography>
              <Typography className="font-semibold">
                {event.playerPreference === "BEST" ? t("BGG Best") : t("Players")}
              </Typography>
              :{" "}
              {event.playerPreference === "BEST"
                ? event.allowBestReduction
                  ? t(
                      "Prefer BGG's ideal player count, allowing fewer players in Assisted planning.",
                    )
                  : t("Preserve seated players")
                : t("Maximize the number of players.")}
            </Typography>
          </View>
        </HelpPopover>
      ) : null}
    </>
  );
}
