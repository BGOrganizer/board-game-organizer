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
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { CalendarClock, X } from "lucide-react-native";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InputField } from "@/components/common/ui/InputField";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { EventDateTimeField } from "./EventDateTimeField";
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
  const t = useT(),
    { i18n } = useLingui();
  const [muted, danger] = useThemeColor(["muted", "danger"]);
  const { draft, fieldError } = form;
  const startWall = draft.dates[0] ? eventDateWall(draft, draft.dates[0]) : "";
  const day = startWall.slice(0, 10),
    bounds = publicEventBounds(startWall);
  const cutoffMin =
    draft.version === undefined && draft.locations[0]?.timeZone
      ? publicEventBounds(eventLocalDateTime(new Date().toISOString(), draft.timeZone).slice(0, 16))
          .endMin
      : undefined;
  const helpTitle = t("Field help");
  const error = (path: string, message: string) =>
    fieldError(path) ? (
      <Typography accessibilityRole="alert" className="text-sm text-danger">
        {message}
      </Typography>
    ) : null;
  return (
    <View style={{ gap: 20 }}>
      {form.publicGroup ? (
        <>
          <EventDateTimeField
            required
            mode="date"
            label={t("Event date")}
            help={t("Choose the day of the event. Start and end times are on this same day.")}
            value={startWall}
            timeZone={draft.timeZone}
            isDisabled={busy}
            error={fieldError("dates") ? t("Choose exactly one valid date and time.") : undefined}
            onChange={(wall) =>
              form.setStartDate(
                `${wall.slice(0, 10)}T${startWall.slice(11, 16) || draft.startTime}`,
              )
            }
          />
          <InputField invalid={fieldError("startTime") || fieldError("endsAt")} style={{ gap: 8 }}>
            <SearchHelpLabel
              required
              label={t("Start / end time")}
              helpTitle={helpTitle}
              help={t(
                "Choose a later time on the same day as the event start. All public tables must finish by this time.",
              )}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <GroupedList>
                  <EventDateTimeField
                    required
                    rowOnly
                    mode="time"
                    day={day}
                    value={startWall.slice(11, 16)}
                    timeZone={draft.timeZone}
                    label={t("Start time")}
                    isDisabled={busy || !day}
                    error={
                      fieldError("startTime")
                        ? t("Choose exactly one valid date and time.")
                        : undefined
                    }
                    onChange={form.setStartDate}
                  />
                </GroupedList>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <GroupedList>
                  <EventDateTimeField
                    required
                    rowOnly
                    mode="time"
                    day={day}
                    value={draft.endsWall.slice(11, 16)}
                    timeZone={draft.timeZone}
                    label={t("End time")}
                    min={bounds.endMin}
                    max={bounds.endMax}
                    isDisabled={busy || !day}
                    error={
                      fieldError("endsAt")
                        ? t("Choose a later end time on the same day as the start.")
                        : undefined
                    }
                    onChange={(endsWall) => form.patch({ endsWall })}
                  />
                </GroupedList>
              </View>
            </View>
          </InputField>
          <EventWallDateTime
            required
            label={t("Registration Deadline Date and Time")}
            help={t(
              "Registration closes on a day before the event starts. A new event needs a future deadline.",
            )}
            value={draft.cutoffWall}
            timeZone={draft.timeZone}
            min={cutoffMin}
            max={bounds.cutoffMax}
            isDisabled={busy || !startWall}
            error={
              fieldError("bookingClosesAt")
                ? t("Choose a registration deadline on a day before the event.")
                : undefined
            }
            onChange={(cutoffWall) => form.patch({ cutoffWall })}
          />
        </>
      ) : (
        <InputField invalid={fieldError("dates") || fieldError("startTime")} style={{ gap: 8 }}>
          <SearchHelpLabel
            required
            label={form.flexibleSchedule ? t("Dates and times") : t("Date and time")}
            helpTitle={helpTitle}
            help={
              form.flexibleSchedule
                ? t(
                    "Propose dates and times for participants to vote on. Times are local to the chosen location.",
                  )
                : t("Choose one date and time. Remove the selected option before choosing another.")
            }
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
                  <X size={18} color={danger} accessible={false} />
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
        </InputField>
      )}
      <InputField invalid={fieldError("locations") || fieldError("timeZone")} style={{ gap: 8 }}>
        <SearchHelpLabel
          required
          label={t("Location")}
          helpTitle={helpTitle}
          help={
            form.flexibleSchedule
              ? t(
                  "Propose verified addresses for participants to vote on. Each location determines its local time zone.",
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
                  <X size={18} color={danger} accessible={false} />
                </Button>
              }
            />
          ))}
          {(form.flexibleSchedule || !draft.locations.length) &&
          draft.locations.length < MAX_EVENT_OPTIONS ? (
            <LocationListRow
              name={t("Choose a location")}
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
          ? error("timeZone", t("Could not determine the location time zone. Choose a location."))
          : null}
      </InputField>
      {form.flexibleSchedule ? (
        <View style={{ gap: 12 }}>
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {t("Participant proposals")}
          </Typography>
          <Typography className="text-sm text-muted">
            {t(
              "Only seated participants may submit proposals. Proposals are reviewed before they become options.",
            )}
          </Typography>
          {(
            [
              ["allowParticipantDates", t("Allow date proposals")],
              ["allowParticipantLocations", t("Allow location proposals")],
            ] as const
          ).map(([key, label]) => (
            <View
              key={key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {label}
              </Typography>
              <Switch
                accessibilityLabel={label}
                hitSlop={12}
                isSelected={Boolean(draft[key])}
                isDisabled={busy}
                onSelectedChange={(value) => form.patch({ [key]: value })}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
