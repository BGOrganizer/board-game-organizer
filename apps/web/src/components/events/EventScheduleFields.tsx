"use client";

import { MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import {
  eventDateWall,
  eventLocalDateTime,
  publicEventBounds,
  type useEventRecordForm,
} from "@board-game-organizer/shared";
import { Button, Switch } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, Plus, X } from "lucide-react";
import { DateTimePicker } from "@/components/common/ui/DateTimePicker";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { TimePicker } from "@/components/common/ui/TimePicker";
import { LocationListRow } from "@/components/locations/LocationListRow";

export function EventScheduleFields({
  form,
  busy,
  dateTime,
  onDateTimeChange,
  onLocation,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
  dateTime: string;
  onDateTimeChange: (value: string) => void;
  onLocation: () => void;
}) {
  const { t, i18n } = useLingui();
  const { draft, fieldError } = form;
  const startWall = draft.dates[0] ? eventDateWall(draft, draft.dates[0]) : "";
  const day = startWall.slice(0, 10),
    bounds = publicEventBounds(startWall);
  const cutoffMin =
    draft.version === undefined && draft.locations[0]?.timeZone
      ? publicEventBounds(eventLocalDateTime(new Date().toISOString(), draft.timeZone).slice(0, 16))
          .endMin
      : undefined;
  const helpTitle = t`Field help`;
  const addDate = (wall: string) => {
    if (busy || !wall) return;
    form.addDate(wall);
    onDateTimeChange("");
  };
  const error = (path: string, message: string) =>
    fieldError(path) ? (
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
    ) : null;
  return (
    <div className="space-y-5">
      {form.publicGroup ? (
        <>
          <DateTimePicker
            value={startWall}
            onChange={form.setStartDate}
            name="eventStart"
            isRequired
            isDisabled={busy}
            isInvalid={fieldError("dates") || fieldError("startTime")}
            label={
              <SearchHelpLabel
                required
                label={t`Date and time`}
                helpTitle={helpTitle}
                help={t`Choose the day of the event. Start and end times are on this same day.`}
              />
            }
          >
            {error("dates", t`Choose exactly one valid date and time.`)}
            {error("startTime", t`Choose exactly one valid date and time.`)}
          </DateTimePicker>
          <TimePicker
            name="endsAt"
            aria-label={t`End time`}
            value={draft.endsWall.slice(11, 16)}
            minValue={bounds.endMin?.slice(11, 16)}
            maxValue={bounds.endMax?.slice(11, 16)}
            isRequired
            isDisabled={
              busy ||
              !day ||
              Boolean(bounds.endMin && bounds.endMax && bounds.endMin > bounds.endMax)
            }
            isInvalid={fieldError("endsAt")}
            onChange={(time) => {
              const endsWall = time ? `${day}T${time}` : "";
              if (
                !time ||
                (bounds.endMin &&
                  bounds.endMax &&
                  endsWall >= bounds.endMin &&
                  endsWall <= bounds.endMax)
              )
                form.patch({ endsWall });
            }}
            label={
              <SearchHelpLabel
                required
                label={t`End time`}
                helpTitle={helpTitle}
                help={t`Choose a later time on the same day as the event start. All public tables must finish by this time.`}
              />
            }
          >
            {error("endsAt", t`Choose a later end time on the same day as the start.`)}
          </TimePicker>
          <DateTimePicker
            name="bookingClosesAt"
            value={draft.cutoffWall}
            minValue={cutoffMin}
            maxValue={bounds.cutoffMax}
            isRequired
            isDisabled={busy || !startWall}
            isInvalid={fieldError("bookingClosesAt")}
            onChange={(cutoffWall) => {
              if (
                !cutoffWall ||
                (bounds.cutoffMax &&
                  cutoffWall <= bounds.cutoffMax &&
                  (!cutoffMin || cutoffWall >= cutoffMin))
              )
                form.patch({ cutoffWall });
            }}
            label={
              <SearchHelpLabel
                required
                label={t`Registration Deadline Date and Time`}
                helpTitle={helpTitle}
                help={t`Registration closes on a day before the event starts. A new event needs a future deadline.`}
              />
            }
          >
            {error("bookingClosesAt", t`Choose a registration deadline on a day before the event.`)}
          </DateTimePicker>
        </>
      ) : (
        <section
          data-form-field
          data-form-error={fieldError("dates") || fieldError("startTime") || undefined}
          className="space-y-2"
        >
          <SearchHelpLabel
            required
            label={form.flexibleSchedule ? t`Dates and times` : t`Date and time`}
            helpTitle={helpTitle}
            help={
              form.flexibleSchedule
                ? t`Propose dates and times for participants to vote on.`
                : t`Choose one date and time. Remove the selected option before choosing another.`
            }
          />
          <GroupedList>
            {draft.dates.map((date) => (
              <GroupedRow key={date.id}>
                <CalendarClock className="size-5 shrink-0 text-muted" aria-hidden />
                <time className="min-w-0 flex-1" dateTime={eventDateWall(draft, date)}>
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${eventDateWall(draft, date)}Z`))}
                </time>
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  aria-label={`${t`Remove date`}: ${eventDateWall(draft, date).replace("T", " ")}`}
                  isDisabled={busy}
                  onPress={() =>
                    form.patch({ dates: draft.dates.filter((row) => row.id !== date.id) })
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </GroupedRow>
            ))}
            {(form.flexibleSchedule || !draft.dates.length) &&
            draft.dates.length < MAX_EVENT_OPTIONS ? (
              <GroupedRow>
                <CalendarClock className="size-5 shrink-0 text-muted" aria-hidden />
                <DateTimePicker
                  className="min-w-0 flex-1"
                  aria-label={t`Date and time`}
                  value={dateTime}
                  onChange={onDateTimeChange}
                  onConfirm={addDate}
                  isDisabled={busy}
                />
                <Button
                  isIconOnly
                  variant="primary"
                  aria-label={t`Add date`}
                  isDisabled={busy || !dateTime}
                  onPress={() => addDate(dateTime)}
                >
                  <Plus className="size-5" aria-hidden />
                </Button>
              </GroupedRow>
            ) : null}
          </GroupedList>
          {fieldError("dates") || fieldError("startTime") ? (
            <p role="alert" className="text-sm text-danger">
              {form.flexibleSchedule
                ? t`Choose at least one valid date and time.`
                : t`Choose exactly one valid date and time.`}
            </p>
          ) : null}
        </section>
      )}
      <section
        data-form-field
        data-form-error={fieldError("locations") || fieldError("timeZone") || undefined}
        className="space-y-2"
      >
        <SearchHelpLabel
          required
          label={t`Location`}
          helpTitle={helpTitle}
          help={t`Suggest locations for participants to vote on.`}
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
                  variant="danger-soft"
                  aria-label={`${t`Remove location`}: ${location.name}`}
                  isDisabled={busy}
                  onPress={() =>
                    form.patch({
                      locations: draft.locations.filter((row) => row.id !== location.id),
                    })
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              }
            />
          ))}
          {(form.flexibleSchedule || !draft.locations.length) &&
          draft.locations.length < MAX_EVENT_OPTIONS ? (
            <LocationListRow name={t`Choose a location`} onPress={busy ? undefined : onLocation} />
          ) : null}
        </GroupedList>
        {error(
          "locations",
          form.flexibleSchedule
            ? t`Choose at least one verified location.`
            : t`Choose exactly one verified location.`,
        )}
        {draft.locations.length
          ? error("timeZone", t`Could not determine the location time zone. Choose a location.`)
          : null}
      </section>
      {form.flexibleSchedule ? (
        <section className="space-y-3" aria-label={t`Participant proposals`}>
          <h2 className="font-semibold">{t`Participant proposals`}</h2>
          <p className="text-sm text-muted">{t`Only seated participants may submit proposals. Proposals are reviewed before they become options.`}</p>
          {(
            [
              ["allowParticipantDates", t`Allow date proposals`],
              ["allowParticipantLocations", t`Allow location proposals`],
            ] as const
          ).map(([key, label]) => (
            <Switch
              key={key}
              name={key}
              className="w-full"
              aria-label={label}
              isSelected={Boolean(draft[key])}
              isDisabled={busy}
              onChange={(value) => form.patch({ [key]: value })}
            >
              <Switch.Content className="flex w-full items-center justify-between gap-3">
                {label}
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          ))}
        </section>
      ) : null}
    </div>
  );
}
