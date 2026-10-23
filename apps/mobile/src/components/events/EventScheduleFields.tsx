import type { useEventRecordForm } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, X } from "lucide-react-native";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventWallDateTime } from "./EventWallDateTime";

export function EventScheduleFields({
  form,
  busy,
  onGroup,
  onLocation,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
  onGroup: () => void;
  onLocation: () => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const [muted, danger] = useThemeColor(["muted", "danger"]);
  const { draft, fieldError } = form;
  const fieldHelp = t("Field help");
  const error = (path: string, message: string) =>
    fieldError(path) ? (
      <Typography accessibilityRole="alert" className="text-sm text-danger">
        {message}
      </Typography>
    ) : null;
  const dayHelp = t(
    "Each event has one calendar day. Remove the selected day before choosing another.",
  );
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 6 }}>
        <SearchHelpLabel
          label={t("Event name")}
          helpTitle={fieldHelp}
          help={t("Choose a recognizable event name between 5 and 120 characters.")}
        />
        <Input
          accessibilityLabel={t("Event name")}
          placeholder={t("Friday game night")}
          value={draft.name}
          onChangeText={(name) => form.patch({ name })}
          editable={!busy}
          isInvalid={fieldError("name")}
        />
        {error("name", t("Enter an event name between 5 and 120 characters."))}
      </View>
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={t("Group")}
          helpTitle={fieldHelp}
          help={
            form.groupLocked
              ? t("This event belongs to this group. The group cannot be changed.")
              : t("Choose one of your groups, or create a standalone event without a group.")
          }
        />
        {draft.groupId && form.groupQuery.isPending ? (
          <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
        ) : form.groupLocked ? (
          <Typography className="text-foreground">{form.group?.name ?? t("No group")}</Typography>
        ) : (
          <Button variant="outline" isDisabled={busy} onPress={onGroup}>
            <Button.Label>{form.group?.name ?? t("No group")}</Button.Label>
          </Button>
        )}
        {draft.groupId && form.groupQuery.isError ? (
          <View style={{ gap: 8 }}>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load group")}
            </Typography>
            <Button variant="outline" onPress={() => void form.groupQuery.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </View>
        ) : (
          error("groupId", t("An approved group and its administrator are required."))
        )}
      </View>
      {draft.dates.length ? (
        <View style={{ gap: 8 }}>
          <SearchHelpLabel label={t("Event day")} helpTitle={fieldHelp} help={dayHelp} />
          <GroupedList>
            {draft.dates.map((date) => (
              <GroupedRow key={date.id}>
                <CalendarDays size={20} color={muted} accessible={false} />
                <Typography className="text-foreground" style={{ flex: 1 }}>
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(new Date(`${date.day}T00:00:00Z`))}
                </Typography>
                <Button
                  isIconOnly
                  size="sm"
                  style={{ minWidth: 44, minHeight: 44 }}
                  variant="danger-soft"
                  accessibilityLabel={`${t("Remove date")}: ${date.day}`}
                  isDisabled={busy}
                  onPress={() =>
                    form.patch({ dates: draft.dates.filter((row) => row.id !== date.id) })
                  }
                >
                  <X size={18} color={danger} />
                </Button>
              </GroupedRow>
            ))}
          </GroupedList>
          {error("dates", t("Choose exactly one event day."))}
        </View>
      ) : (
        <EventDateTimeField
          label={t("Event day")}
          help={dayHelp}
          timeZone={draft.timeZone}
          mode="date"
          value=""
          isDisabled={busy}
          error={fieldError("dates") ? t("Choose exactly one event day.") : undefined}
          onChange={(value) => form.addDate(value.slice(0, 10))}
        />
      )}
      <EventDateTimeField
        label={t("Common start time")}
        help={t(
          "The event starts at this local time. Its time zone is determined automatically from the selected location.",
        )}
        timeZone={draft.timeZone}
        mode="time"
        day={draft.dates[0]?.day}
        value={draft.startTime}
        isDisabled={busy}
        error={fieldError("startTime") ? t("Choose a valid local start time.") : undefined}
        onChange={(value) => form.patch({ startTime: value.slice(11, 16) })}
      />
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={t("Location")}
          helpTitle={fieldHelp}
          help={t(
            "Each event has one verified address. Its time zone is automatic. Remove the location before choosing another.",
          )}
        />
        <GroupedList>
          {draft.locations.map((location) => (
            <LocationListRow
              key={location.id}
              name={location.name}
              address={location.address}
              actions={
                <Button
                  isIconOnly
                  size="sm"
                  style={{ minWidth: 44, minHeight: 44 }}
                  variant="danger-soft"
                  accessibilityLabel={`${t("Remove location")}: ${location.name}`}
                  isDisabled={busy}
                  onPress={() =>
                    form.patch({
                      locations: draft.locations.filter((row) => row.id !== location.id),
                    })
                  }
                >
                  <X size={18} color={danger} />
                </Button>
              }
            />
          ))}
          {!draft.locations.length ? (
            <LocationListRow
              name={t("Choose a verified address")}
              onPress={busy ? undefined : onLocation}
            />
          ) : null}
        </GroupedList>
        {error("locations", t("Choose exactly one verified location."))}
        {draft.locations.length
          ? error(
              "timeZone",
              t("Could not determine the location time zone. Choose a verified address."),
            )
          : null}
      </View>
      {form.group?.type === "PUBLIC" ? (
        <>
          <EventWallDateTime
            label={t("Event end")}
            help={t(
              "The end must follow the event start. All public tables must finish within this interval.",
            )}
            value={draft.endsWall}
            timeZone={draft.timeZone}
            isDisabled={busy}
            error={fieldError("endsAt") ? t("Choose an event end after its start.") : undefined}
            onChange={(endsWall) => form.patch({ endsWall })}
          />
          <EventWallDateTime
            label={t("Booking cutoff")}
            help={t(
              "Registration closes at this local date and time, before the event starts. A new event needs a future cutoff.",
            )}
            value={draft.cutoffWall}
            timeZone={draft.timeZone}
            isDisabled={busy}
            error={
              fieldError("bookingClosesAt")
                ? t("Choose a valid booking cutoff before the event starts.")
                : undefined
            }
            onChange={(cutoffWall) => form.patch({ cutoffWall })}
          />
        </>
      ) : null}
    </View>
  );
}
