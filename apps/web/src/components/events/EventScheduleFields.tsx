"use client";

import { MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import {
  eventDateWall,
  eventLocalDateTime,
  publicEventBounds,
  type useEventRecordForm,
} from "@board-game-organizer/shared";
import { Button, Input, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, Plus, X } from "lucide-react";
import { useId } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
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
  const { t, i18n } = useLingui(),
    id = useId();
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
          <TextField
            value={day}
            onChange={(value) =>
              form.setStartDate(`${value}T${startWall.slice(11, 16) || draft.startTime}`)
            }
            isRequired
            isDisabled={busy}
            isInvalid={fieldError("dates")}
          >
            <SearchHelpLabel
              required
              htmlFor={`${id}-day`}
              label={t`Event date`}
              helpTitle={helpTitle}
              help={t`Choose the day of the event. Start and end times are on this same day.`}
            />
            <Input id={`${id}-day`} name="eventDay" type="date" autoComplete="off" />
            {error("dates", t`Choose exactly one valid date and time.`)}
          </TextField>
          <section
            className="space-y-2"
            data-form-field
            data-form-error={fieldError("startTime") || fieldError("endsAt") || undefined}
          >
            <SearchHelpLabel
              required
              label={t`Start / end time`}
              helpTitle={helpTitle}
              help={t`Choose a later time on the same day as the event start. All public tables must finish by this time.`}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                aria-label={t`Start time`}
                value={startWall.slice(11, 16)}
                onChange={(time) => form.setStartDate(`${day}T${time}`)}
                isRequired
                isDisabled={busy || !day}
                isInvalid={fieldError("startTime")}
              >
                <Input name="startTime" type="time" autoComplete="off" />
              </TextField>
              <TextField
                aria-label={t`End time`}
                value={draft.endsWall.slice(11, 16)}
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
              >
                <Input
                  name="endsAt"
                  type="time"
                  min={bounds.endMin?.slice(11, 16)}
                  max={bounds.endMax?.slice(11, 16)}
                  autoComplete="off"
                />
              </TextField>
            </div>
            {error("startTime", t`Choose exactly one valid date and time.`)}
            {error("endsAt", t`Choose a later end time on the same day as the start.`)}
          </section>
          <TextField
            value={draft.cutoffWall}
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
          >
            <SearchHelpLabel
              required
              label={t`Registration Deadline Date and Time`}
              helpTitle={helpTitle}
              help={t`Registration closes on a day before the event starts. A new event needs a future deadline.`}
            />
            <Input
              name="bookingClosesAt"
              type="datetime-local"
              min={cutoffMin}
              max={bounds.cutoffMax}
              autoComplete="off"
            />
            {error("bookingClosesAt", t`Choose a registration deadline on a day before the event.`)}
          </TextField>
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
                ? t`Propose dates and times for participants to vote on. Times are local to the chosen location.`
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
                <TextField
                  className="min-w-0 flex-1"
                  aria-label={t`Date and time`}
                  value={dateTime}
                  onChange={onDateTimeChange}
                  isDisabled={busy}
                >
                  <Input type="datetime-local" />
                </TextField>
                <Button
                  isIconOnly
                  variant="primary"
                  aria-label={t`Add date`}
                  isDisabled={busy || !dateTime}
                  onPress={() => {
                    form.addDate(dateTime);
                    onDateTimeChange("");
                  }}
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
          help={
            form.flexibleSchedule
              ? t`Propose verified addresses for participants to vote on. Each location determines its local time zone.`
              : t`Each event has one verified address. Its time zone is automatic. Remove the location before choosing another.`
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
