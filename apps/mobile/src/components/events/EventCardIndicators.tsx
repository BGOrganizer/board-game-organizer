import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventParticipationFlags,
  eventPendingAction,
  eventRecordVisibility,
  useEventCutoff,
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
  UsersRound,
} from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { EventSchedulePopover } from "./EventSchedulePopover";

/** The complete own-registration projection can show accepted and pending participation together. */
export function EventCardIndicators({ event }: { event: PlannedEventResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const { height } = useWindowDimensions();
  const muted = useThemeColor("muted");
  const participation = eventParticipationFlags(event.myRegistrations);
  const own = !event.readOnly;
  const closed = useEventCutoff(
    event.bookingClosesAt,
    event.groupType === "PUBLIC" && event.status === "PLANNING",
  );
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
          action={closed ? null : eventPendingAction(event)}
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
    </>
  );
}
