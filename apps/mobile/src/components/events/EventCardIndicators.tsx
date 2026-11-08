import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventParticipationFlags,
  eventPendingAction,
  eventRecordSchedulePreview,
  useEventCutoff,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Typography } from "heroui-native/text";
import { CalendarCheck, CalendarClock, Flag } from "lucide-react-native";
import { ScrollView, useWindowDimensions } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
import { EventCardSchedule } from "./EventCardSchedule";

/** The complete own-registration projection can show accepted and pending participation together. */
export function EventCardIndicators({ event }: { event: PlannedEventResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const { width, height } = useWindowDimensions();
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
      {own && event.canManage ? (
        <ArtworkStatusPopover
          size="compact"
          kind={event.managementRole === "admin" ? "admin" : "manager"}
          label={event.managementRole === "moderator" ? t("Group moderator") : undefined}
        />
      ) : null}
      {own && participation.accepted ? (
        <ArtworkStatusPopover size="compact" kind="accepted" />
      ) : null}
      {own && participation.pending ? (
        <ArtworkStatusPopover
          size="compact"
          kind="pending"
          action={closed ? null : eventPendingAction(event)}
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
        width={Math.min(360, width - 32)}
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
          <EventCardSchedule schedule={eventRecordSchedulePreview(event)} />
          <Typography className="text-foreground">
            {t("Players")}: {i18n.number(event.participantCount)}
          </Typography>
        </ScrollView>
      </HelpPopover>
    </>
  );
}
