"use client";

import type { useEventRecordForm } from "@board-game-organizer/shared";
import { Button, Input, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Plus, X } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";

export function EventScheduleFields({
  form,
  busy,
  day,
  onDayChange,
  onGroup,
  onLocation,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
  day: string;
  onDayChange: (day: string) => void;
  onGroup: () => void;
  onLocation: () => void;
}) {
  const { t, i18n } = useLingui();
  const { draft, fieldError } = form;
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
        ) : form.groupLocked ? (
          <p>{form.group?.name ?? t`No group`}</p>
        ) : (
          <Button variant="outline" isDisabled={busy} onPress={onGroup}>
            {form.group?.name ?? t`No group`}
          </Button>
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
          label={t`Event day`}
          helpTitle={fieldHelp}
          help={t`Each event has one calendar day. Remove the selected day before choosing another.`}
        />
        <GroupedList>
          {draft.dates.map((date) => (
            <GroupedRow key={date.id}>
              <CalendarDays className="size-5 shrink-0 text-default-500" aria-hidden />
              <time className="min-w-0 flex-1" dateTime={date.day}>
                {new Intl.DateTimeFormat(i18n.locale, {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(new Date(`${date.day}T00:00:00Z`))}
              </time>
              <Button
                isIconOnly
                size="sm"
                variant="danger-soft"
                aria-label={`${t`Remove date`}: ${date.day}`}
                isDisabled={busy}
                onPress={() =>
                  form.patch({ dates: draft.dates.filter((row) => row.id !== date.id) })
                }
              >
                <X className="size-4" aria-hidden />
              </Button>
            </GroupedRow>
          ))}
          {!draft.dates.length ? (
            <GroupedRow>
              <CalendarDays className="size-5 shrink-0 text-default-500" aria-hidden />
              <TextField
                className="min-w-0 flex-1"
                aria-label={t`Event day`}
                value={day}
                onChange={onDayChange}
                isDisabled={busy}
                isInvalid={fieldError("dates")}
              >
                <Input type="date" />
              </TextField>
              <Button
                isIconOnly
                variant="primary"
                aria-label={t`Add date`}
                isDisabled={busy || !day}
                onPress={() => {
                  form.addDate(day);
                  onDayChange("");
                }}
              >
                <Plus className="size-5" aria-hidden />
              </Button>
            </GroupedRow>
          ) : null}
        </GroupedList>
        {error("dates", t`Choose exactly one event day.`)}
      </section>
      <TextField
        value={draft.startTime}
        onChange={(startTime) => form.patch({ startTime })}
        isRequired
        isDisabled={busy}
        isInvalid={fieldError("startTime")}
      >
        <SearchHelpLabel
          label={t`Common start time`}
          helpTitle={fieldHelp}
          help={t`The event starts at this local time. Its time zone is determined automatically from the selected location.`}
        />
        <Input type="time" />
        {error("startTime", t`Choose a valid local start time.`)}
      </TextField>
      <section className="space-y-2">
        <SearchHelpLabel
          label={t`Location`}
          helpTitle={fieldHelp}
          help={t`Each event has one verified address. Its time zone is automatic. Remove the location before choosing another.`}
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
          {!draft.locations.length ? (
            <LocationListRow
              name={t`Choose a verified address`}
              onPress={busy ? undefined : onLocation}
            />
          ) : null}
        </GroupedList>
        {error("locations", t`Choose exactly one verified location.`)}
        {draft.locations.length
          ? error(
              "timeZone",
              t`Could not determine the location time zone. Choose a verified address.`,
            )
          : null}
      </section>
      {form.group?.type === "PUBLIC" ? (
        <>
          <TextField
            value={draft.endsWall}
            onChange={(endsWall) => form.patch({ endsWall })}
            isRequired
            isDisabled={busy}
            isInvalid={fieldError("endsAt")}
          >
            <SearchHelpLabel
              label={t`Event end`}
              helpTitle={fieldHelp}
              help={t`The end must follow the event start. All public tables must finish within this interval.`}
            />
            <Input type="datetime-local" />
            {error("endsAt", t`Choose an event end after its start.`)}
          </TextField>
          <TextField
            value={draft.cutoffWall}
            onChange={(cutoffWall) => form.patch({ cutoffWall })}
            isRequired
            isDisabled={busy}
            isInvalid={fieldError("bookingClosesAt")}
          >
            <SearchHelpLabel
              label={t`Booking cutoff`}
              helpTitle={fieldHelp}
              help={t`Registration closes at this local date and time, before the event starts. A new event needs a future cutoff.`}
            />
            <Input type="datetime-local" />
            {error("bookingClosesAt", t`Choose a valid booking cutoff before the event starts.`)}
          </TextField>
        </>
      ) : null}
    </div>
  );
}
