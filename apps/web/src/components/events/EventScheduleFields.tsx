"use client";

import { MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import {
  eventDateWall,
  eventLocalDateTime,
  publicEventBounds,
  type useEventRecordForm,
} from "@board-game-organizer/shared";
import { Button, Input, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, Plus, X } from "lucide-react";
import { useId } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { EventGroupSelect } from "./EventGroupSelect";

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
  const startFieldId = useId();
  const { draft, fieldError } = form;
  const startWall = draft.dates[0] ? eventDateWall(draft, draft.dates[0]) : "";
  const bounds = publicEventBounds(startWall);
  const cutoffMin =
    draft.version === undefined && draft.locations[0]?.timeZone
      ? publicEventBounds(eventLocalDateTime(new Date().toISOString(), draft.timeZone).slice(0, 16))
          .endMin
      : undefined;
  const fieldHelp = t`Field help`;
  const error = (path: string, message: string) =>
    fieldError(path) ? (
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
    ) : null;
  return (
    <div className="space-y-5">
      <TextField
        value={draft.name}
        onChange={(name) => form.patch({ name })}
        isRequired
        isDisabled={busy}
        isInvalid={fieldError("name")}
      >
        <SearchHelpLabel
          label={t`Event name`}
          helpTitle={fieldHelp}
          help={t`Choose a recognizable event name between 5 and 120 characters.`}
        />
        <Input placeholder={t`Friday game night`} />
        {error("name", t`Enter an event name between 5 and 120 characters.`)}
      </TextField>
      <section className="space-y-2">
        <SearchHelpLabel
          label={t`Group`}
          helpTitle={fieldHelp}
          help={
            form.groupLocked
              ? t`This event belongs to this group. The group cannot be changed.`
              : t`Choose one of your groups, or create a standalone event without a group.`
          }
        />
        {draft.groupId && form.groupQuery.isPending ? (
          <Skeleton className="h-12 w-full rounded-xl" />
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
          <div role="alert">
            <p className="text-danger">{t`Could not load group`}</p>
            <Button
              variant="outline"
              onPress={() => void form.groupQuery.refetch()}
            >{t`Try again`}</Button>
          </div>
        ) : (
          error("groupId", t`An approved group and its administrator are required.`)
        )}
      </section>
      <section className="space-y-2">
        <SearchHelpLabel
          htmlFor={form.publicGroup ? startFieldId : undefined}
          label={
            form.publicGroup
              ? t`Start Date and Time`
              : form.flexibleSchedule
                ? t`Dates and times`
                : t`Date and time`
          }
          helpTitle={fieldHelp}
          help={
            form.publicGroup
              ? t`Choose the event start date and time.`
              : form.flexibleSchedule
                ? t`Propose dates and times for members to vote on. Times are local to the chosen location.`
                : t`Choose one date and time. Remove the selected option before choosing another.`
          }
        />
        {form.publicGroup ? (
          <TextField
            aria-label={t`Start Date and Time`}
            value={startWall}
            onChange={form.setStartDate}
            isRequired
            isDisabled={busy}
          >
            <Input id={startFieldId} name="startsAt" autoComplete="off" type="datetime-local" />
          </TextField>
        ) : (
          <GroupedList>
            {draft.dates.map((date) => (
              <GroupedRow key={date.id}>
                <CalendarClock className="size-5 shrink-0 text-default-500" aria-hidden />
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
                <CalendarClock className="size-5 shrink-0 text-default-500" aria-hidden />
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
        )}
        {fieldError("dates") || fieldError("startTime") ? (
          <p role="alert" className="text-sm text-danger">
            {form.flexibleSchedule
              ? t`Choose at least one valid date and time.`
              : t`Choose exactly one valid date and time.`}
          </p>
        ) : null}
      </section>
      {form.publicGroup ? (
        <>
          <TextField
            value={draft.endsWall}
            onChange={(endsWall) => {
              if (
                !endsWall ||
                (bounds.endMin &&
                  bounds.endMax &&
                  endsWall >= bounds.endMin &&
                  endsWall <= bounds.endMax)
              )
                form.patch({ endsWall });
            }}
            isRequired
            isDisabled={
              busy ||
              !startWall ||
              Boolean(bounds.endMin && bounds.endMax && bounds.endMin > bounds.endMax)
            }
            isInvalid={fieldError("endsAt")}
          >
            <SearchHelpLabel
              label={t`End Date and Time`}
              helpTitle={fieldHelp}
              help={t`Choose a later time on the same day as the event start. All public tables must finish by this time.`}
            />
            <Input
              name="endsAt"
              autoComplete="off"
              type="datetime-local"
              min={bounds.endMin}
              max={bounds.endMax}
            />
            {error("endsAt", t`Choose a later end time on the same day as the start.`)}
          </TextField>
          <TextField
            value={draft.cutoffWall}
            onChange={(cutoffWall) => {
              if (
                !cutoffWall ||
                (bounds.cutoffMax &&
                  cutoffWall <= bounds.cutoffMax &&
                  (!cutoffMin || cutoffWall >= cutoffMin))
              )
                form.patch({ cutoffWall });
            }}
            isRequired
            isDisabled={busy || !startWall}
            isInvalid={fieldError("bookingClosesAt")}
          >
            <SearchHelpLabel
              label={t`Booking cutoff`}
              helpTitle={fieldHelp}
              help={t`Registration closes at this local date and time, before the event starts. A new event needs a future cutoff.`}
            />
            <Input
              name="bookingClosesAt"
              autoComplete="off"
              type="datetime-local"
              min={cutoffMin}
              max={bounds.cutoffMax}
            />
            {error("bookingClosesAt", t`Choose a valid booking cutoff before the event starts.`)}
          </TextField>
        </>
      ) : null}
      <section className="space-y-2">
        <SearchHelpLabel
          label={t`Location`}
          helpTitle={fieldHelp}
          help={
            form.flexibleSchedule
              ? t`Propose verified addresses for members to vote on. Each location determines its local time zone.`
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
            <LocationListRow
              name={t`Choose a verified address`}
              onPress={busy ? undefined : onLocation}
            />
          ) : null}
        </GroupedList>
        {error(
          "locations",
          form.flexibleSchedule
            ? t`Choose at least one verified location.`
            : t`Choose exactly one verified location.`,
        )}
        {draft.locations.length
          ? error(
              "timeZone",
              t`Could not determine the location time zone. Choose a verified address.`,
            )
          : null}
      </section>
    </div>
  );
}
