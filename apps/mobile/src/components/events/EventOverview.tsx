import type { EventResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  LayoutGrid,
  MapPin,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { InfoSection as EventInfoSection } from "@/components/common/ui/InfoSection";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";

export function EventOverview({ event }: { event: EventResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const numbers = new Intl.NumberFormat(i18n.locale);
  const status =
    event.status === "DRAFT"
      ? t("Draft")
      : event.status === "PUBLISHED"
        ? t("Published")
        : t("Cancelled");
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <CalendarRange size={18} color={muted} accessible={false} />
            <Typography
              accessibilityRole="header"
              className="font-semibold text-foreground"
              style={{ flexShrink: 1 }}
            >
              {t("Event name")}
            </Typography>
            <HelpPopover label={t("Event name help")} title={t("Event name")}>
              <IconLegend
                items={[
                  {
                    icon: UsersRound,
                    description: t("Confirmed participants, counted once across active tables."),
                  },
                  { icon: LayoutGrid, description: t("Event tables, excluding cancelled tables.") },
                ]}
              />
            </HelpPopover>
          </View>
          <Chip
            size="sm"
            color={
              event.status === "DRAFT"
                ? "warning"
                : event.status === "PUBLISHED"
                  ? "success"
                  : "danger"
            }
            variant="soft"
          >
            <Chip.Label>{status}</Chip.Label>
          </Chip>
        </View>
        <Typography className="text-lg font-semibold text-foreground">{event.name}</Typography>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <UsersRound size={18} color={muted} />
            <Typography
              className="text-sm text-foreground"
              accessibilityLabel={`${t("Number of participants")}: ${numbers.format(event.confirmedParticipantCount)}`}
            >
              {numbers.format(event.confirmedParticipantCount)}
            </Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <LayoutGrid size={18} color={muted} />
            <Typography
              className="text-sm text-foreground"
              accessibilityLabel={`${t("Number of tables")}: ${numbers.format(event.tableCount)}`}
            >
              {numbers.format(event.tableCount)}
            </Typography>
          </View>
        </View>
      </View>
      <EventInfoSection
        label={t("Date and time")}
        helpLabel={t("Event date and time help")}
        help={`${t("The event date and start/end times are shown in the event's time zone.")} ${event.timeZone}`}
        icon={CalendarDays}
      >
        <GroupedRow>
          <DateTimeInfo startsAt={event.startsAt} endsAt={event.endsAt} timeZone={event.timeZone} />
        </GroupedRow>
      </EventInfoSection>
      <EventInfoSection
        label={t("Location")}
        helpLabel={t("Event location help")}
        help={t("The verified venue and address where the event takes place.")}
        icon={MapPin}
      >
        <LocationListRow name={event.location.name} address={event.location.address} />
      </EventInfoSection>
      <EventInfoSection
        label={t("Booking deadline")}
        helpLabel={t("Booking deadline help")}
        help={`${t("After this deadline, participation and table changes are closed. Times use the event's time zone.")} ${event.timeZone}`}
        icon={Clock3}
      >
        <GroupedRow>
          <DateTimeInfo startsAt={event.bookingClosesAt} timeZone={event.timeZone} />
        </GroupedRow>
      </EventInfoSection>
    </View>
  );
}
