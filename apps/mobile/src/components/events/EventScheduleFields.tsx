import { MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import {
  eventDateWall,
  eventLocalDateTime,
  publicEventBounds,
  type useEventRecordForm,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarClock, X } from "lucide-react-native";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventGroupSelect } from "./EventGroupSelect";
import { EventWallDateTime } from "./EventWallDateTime";

export function EventScheduleFields({
  form,
  busy,
  onLocation,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
  onLocation: () => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const [muted, danger] = useThemeColor(["muted", "danger"]);
  const { draft, fieldError } = form;
  const startWall = draft.dates[0] ? eventDateWall(draft, draft.dates[0]) : "";
  const bounds = publicEventBounds(startWall);
  const cutoffMin =
    draft.version === undefined && draft.locations[0]?.timeZone
      ? publicEventBounds(eventLocalDateTime(new Date().toISOString(), draft.timeZone).slice(0, 16))
          .endMin
      : undefined;
  const fieldHelp = t("Field help");
  const error = (path: string, message: string) =>
    fieldError(path) ? (
      <Typography accessibilityRole="alert" className="text-sm text-danger">
        {message}
      </Typography>
    ) : null;
  const dayHelp = form.publicGroup
    ? t("Choose the event start date and time.")
    : form.flexibleSchedule
      ? t("Propose dates and times for members to vote on. Times are local to the chosen location.")
      : t("Choose one date and time. Remove the selected option before choosing another.");
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
        ) : (
          <EventGroupSelect
            groupId={draft.groupId}
            group={form.group}
            locked={form.groupLocked}
            busy={busy}
            onChange={(groupId) => form.patch({ groupId, locations: [] })}
          />
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
      {form.publicGroup ? (
        <EventWallDateTime
          label={t("Start Date and Time")}
          help={dayHelp}
          value={startWall}
          timeZone={draft.timeZone}
          isDisabled={busy}
          error={
            fieldError("dates") || fieldError("startTime")
              ? t("Choose exactly one valid date and time.")
              : undefined
          }
          onChange={form.setStartDate}
        />
      ) : (
        <View style={{ gap: 8 }}>
          <SearchHelpLabel
            label={form.flexibleSchedule ? t("Dates and times") : t("Date and time")}
            helpTitle={fieldHelp}
            help={dayHelp}
          />
          <GroupedList>
            {draft.dates.map((date) => (
              <GroupedRow key={date.id}>
                <CalendarClock size={20} color={muted} accessible={false} />
                <Typography className="text-foreground" style={{ flex: 1 }}>
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${eventDateWall(draft, date)}Z`))}
                </Typography>
                <Button
                  isIconOnly
                  size="sm"
                  style={{ minWidth: 44, minHeight: 44 }}
                  variant="danger-soft"
                  accessibilityLabel={`${t("Remove date")}: ${eventDateWall(draft, date).replace("T", " ")}`}
                  isDisabled={busy}
                  onPress={() =>
                    form.patch({ dates: draft.dates.filter((row) => row.id !== date.id) })
                  }
                >
                  <X size={18} color={danger} />
                </Button>
              </GroupedRow>
            ))}
            {(form.flexibleSchedule || !draft.dates.length) &&
            draft.dates.length < MAX_EVENT_OPTIONS ? (
              <EventDateTimeField
                label={t("Choose date and time")}
                timeZone={draft.timeZone}
                mode="datetime"
                value=""
                isDisabled={busy}
                rowOnly
                onChange={form.addDate}
              />
            ) : null}
          </GroupedList>
          {fieldError("dates") || fieldError("startTime") ? (
            <Typography accessibilityRole="alert" className="text-sm text-danger">
              {form.flexibleSchedule
                ? t("Choose at least one valid date and time.")
                : t("Choose exactly one valid date and time.")}
            </Typography>
          ) : null}
        </View>
      )}
      {form.publicGroup ? (
        <>
          <EventWallDateTime
            label={t("End Date and Time")}
            help={t(
              "Choose a later time on the same day as the event start. All public tables must finish by this time.",
            )}
            value={draft.endsWall}
            timeZone={draft.timeZone}
            min={bounds.endMin}
            max={bounds.endMax}
            isDisabled={busy || !startWall}
            error={
              fieldError("endsAt")
                ? t("Choose a later end time on the same day as the start.")
                : undefined
            }
            onChange={(endsWall) => form.patch({ endsWall })}
          />
          <EventWallDateTime
            label={t("Booking cutoff")}
            help={t(
              "Registration closes at this local date and time, before the event starts. A new event needs a future cutoff.",
            )}
            value={draft.cutoffWall}
            timeZone={draft.timeZone}
            min={cutoffMin}
            max={bounds.cutoffMax}
            isDisabled={busy || !startWall}
            error={
              fieldError("bookingClosesAt")
                ? t("Choose a valid booking cutoff before the event starts.")
                : undefined
            }
            onChange={(cutoffWall) => form.patch({ cutoffWall })}
          />
        </>
      ) : null}
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={t("Location")}
          helpTitle={fieldHelp}
          help={
            form.flexibleSchedule
              ? t(
                  "Propose verified addresses for members to vote on. Each location determines its local time zone.",
                )
              : t(
                  "Each event has one verified address. Its time zone is automatic. Remove the location before choosing another.",
                )
          }
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
          {(form.flexibleSchedule || !draft.locations.length) &&
          draft.locations.length < MAX_EVENT_OPTIONS ? (
            <LocationListRow
              name={t("Choose a verified address")}
              onPress={busy ? undefined : onLocation}
            />
          ) : null}
        </GroupedList>
        {error(
          "locations",
          form.flexibleSchedule
            ? t("Choose at least one verified location.")
            : t("Choose exactly one verified location."),
        )}
        {draft.locations.length
          ? error(
              "timeZone",
              t("Could not determine the location time zone. Choose a verified address."),
            )
          : null}
      </View>
    </View>
  );
}
