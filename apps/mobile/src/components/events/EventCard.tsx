import type { EventResponse } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  LayoutGrid,
  MapPin,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCard } from "@/components/common/ui/ListCard";
import { useT } from "@/lib/i18n";

export function EventCard({
  event,
  presentation = "list",
  showOrganization = true,
}: {
  event: EventResponse;
  presentation?: "list" | "detail";
  showOrganization?: boolean;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const router = useRouter();
  const muted = useThemeColor("muted");
  const date = new Intl.DateTimeFormat(i18n.locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: event.timeZone,
  }).format(new Date(event.startsAt));
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: event.timeZone,
  });
  const start = time.format(new Date(event.startsAt)),
    end = time.format(new Date(event.endsAt));
  const label =
    event.status === "DRAFT"
      ? t("Draft")
      : event.status === "PUBLISHED"
        ? t("Published")
        : t("Cancelled");
  const numbers = new Intl.NumberFormat(i18n.locale);
  const organizationIdentity = showOrganization
    ? `, ${event.organizationName}${event.organizationApproved ? `, ${t("Approved organization")}` : ""}`
    : "";
  const content = (
    <>
      <AnimatedDicebearArtwork seed={event.id} variant="planets" />
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingRight: 84,
            minHeight: 24,
          }}
        >
          <CalendarRange size={16} color={muted} accessible={false} />
          <Typography
            className="font-semibold text-foreground"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {event.name}
          </Typography>
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
          style={{ position: "absolute", top: 0, right: 0 }}
        >
          <Chip.Label>{label}</Chip.Label>
        </Chip>
        {presentation === "list" && showOrganization ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Building2 size={16} color={muted} accessible={false} />
            <Typography
              accessibilityLabel={
                event.organizationApproved
                  ? `${event.organizationName}, ${t("Approved organization")}`
                  : event.organizationName
              }
              className="font-medium text-foreground"
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {event.organizationName}
            </Typography>
          </View>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <CalendarDays size={14} color={muted} />
            <Typography className="text-foreground" style={{ fontSize: 12 }}>
              {date}
            </Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Clock3 size={14} color={muted} />
            <Typography
              accessibilityLabel={`${t("Start time")}: ${start}`}
              className="text-foreground"
              style={{ fontSize: 12 }}
            >
              {start}
            </Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Clock3 size={14} color={muted} />
            <Typography
              accessibilityLabel={`${t("End time")}: ${end}`}
              className="text-foreground"
              style={{ fontSize: 12 }}
            >
              {end}
            </Typography>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
          <MapPin size={16} color={muted} />
          <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
            {event.location.name} · {formatLocationAddress(event.location.address)}
          </Typography>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          {presentation === "list" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <LayoutGrid size={16} color={muted} />
              <Typography
                accessibilityLabel={`${t("Tables")}: ${numbers.format(event.tableCount)}`}
                className="text-sm text-foreground"
              >
                {numbers.format(event.tableCount)}
              </Typography>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <UsersRound size={16} color={muted} />
            <Typography
              accessibilityLabel={`${t("Confirmed participants")}: ${numbers.format(event.confirmedParticipantCount)}`}
              className="text-sm text-foreground"
            >
              {numbers.format(event.confirmedParticipantCount)}
            </Typography>
          </View>
        </View>
      </View>
    </>
  );
  return presentation === "detail" ? (
    <ListCard>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}>
        {content}
      </View>
    </ListCard>
  ) : (
    <LinkedListCard
      onPress={() => router.push(`/event/${event.id}`)}
      label={`${t("Open event")}: ${event.name}${organizationIdentity}, ${label}, ${date}, ${start}–${end}, ${event.location.name}, ${formatLocationAddress(event.location.address)}, ${t("Tables")}: ${numbers.format(event.tableCount)}, ${t("Confirmed participants")}: ${numbers.format(event.confirmedParticipantCount)}`}
    >
      {content}
    </LinkedListCard>
  );
}
