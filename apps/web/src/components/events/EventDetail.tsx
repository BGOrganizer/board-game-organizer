"use client";
import {
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  eventDateWall,
  eventLocalToIso,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ClipboardPenLine,
  Dices,
  Pencil,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventDeleteAction } from "./EventDeleteAction";
import { EventDetailsCard } from "./EventDetailsCard";
import { EventTableCard } from "./EventTableCard";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteCounts } from "./EventVoteCounts";
export function EventDetail({ eventId }: { eventId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    tables = useRecordTables(o, eventId),
    [confirm, setConfirm] = useState<"confirm" | "replan" | null>(null),
    [error, setError] = useState(false),
    event = communityAccessDenied(q.error) ? undefined : q.data,
    end = useInfiniteScroll({
      hasNextPage: !!tables.hasNextPage,
      isFetchingNextPage: tables.isFetchingNextPage,
      isFetchNextPageError: tables.isFetchNextPageError,
      fetchNextPage: tables.fetchNextPage,
    });
  const closed = useEventCutoff(event?.bookingClosesAt, event?.groupType === "PUBLIC");
  const confirmationBlocked =
    a.busy || q.isPlaceholderData || !event?.canConfirm || event?.agreement?.agreed !== true;
  const confirmationHint = a.busy
    ? t`An event action is in progress.`
    : q.isPlaceholderData
      ? t`Event details are still loading.`
      : t`No complete agreement yet. Check participation and votes for the date, location and game.`;
  if (!event)
    return q.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load event`}</p>
        <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
      </div>
    );
  const transition = (action: "confirm" | "replan") => {
    if (
      a.busy ||
      q.isPlaceholderData ||
      event.adminUserId !== o.userId ||
      (action === "confirm" && confirmationBlocked) ||
      (action === "replan" && !event.canReplan)
    ) {
      setError(true);
      return;
    }
    setError(false);
    a.transition.mutate({ action, version: event.version });
    setConfirm(null);
  };
  return (
    <div className="mx-auto max-w-4xl space-y-3 pb-24">
      <Link href="/events" className="inline-flex items-center gap-2 text-accent">
        <ArrowLeft className="size-4" aria-hidden />
        {t`Back`}
      </Link>
      {event.adminUserId === o.userId && event.status === "PLANNING" ? (
        <HeaderActions>
          <div className="flex items-center gap-1">
            {confirmationBlocked ? (
              <HelpPopover label={t`Why confirmation is unavailable`} title={t`Confirm event`}>
                <div className="space-y-2">
                  <p>{confirmationHint}</p>
                  {event.agreement?.reasons.map((reason) => (
                    <p key={reason.tableId}>
                      {tables.items.find((row) => row.id === reason.tableId)?.name ?? t`Table`}:{" "}
                      {reason.code === "PENDING_RESERVATIONS"
                        ? t`Pending invitations still reserve places.`
                        : reason.code === "GAME_DISAGREEMENT"
                          ? t`Seated players agree on date and location but not game. Change votes or edit the games; waiting players cannot replace them for this reason.`
                          : t`No compatible accepted players for this table.`}
                    </p>
                  ))}
                </div>
              </HelpPopover>
            ) : null}
            <Button
              isIconOnly
              size="sm"
              variant="primary"
              className="size-9 min-h-9 min-w-9"
              aria-label={t`Confirm event`}
              isDisabled={confirmationBlocked}
              onPress={() => {
                setError(false);
                setConfirm("confirm");
              }}
            >
              <Check className="size-4" aria-hidden />
            </Button>
            <EventDeleteAction event={event} disabled={q.isPlaceholderData} />
          </div>
        </HeaderActions>
      ) : null}
      {event.adminUserId === o.userId && event.status === "CONFIRMED" && event.canFinalize ? (
        <HeaderActions>
          <Link
            href={`/events/${event.id}/results`}
            aria-label={t`Register results`}
            aria-disabled={a.busy || q.isPlaceholderData}
            onClick={(e) => {
              if (a.busy || q.isPlaceholderData) e.preventDefault();
            }}
            className="button button--primary button--icon-only size-9 min-h-9 min-w-9"
          >
            <ClipboardPenLine className="size-4" aria-hidden />
          </Link>
        </HeaderActions>
      ) : null}
      <EventDetailsCard event={event} />
      <section
        aria-label={event.groupType === "PUBLIC" ? t`Start Date and Time` : t`Date and time`}
        className="space-y-3"
      >
        <SearchHelpLabel
          label={event.groupType === "PUBLIC" ? t`Start Date and Time` : t`Date and time`}
          helpTitle={t`Field help`}
          help={t`Times are local to the location chosen for the event.`}
        />
        <GroupedList>
          {event.dates
            .filter(
              (row) =>
                event.status === "PLANNING" ||
                !event.confirmed ||
                row.id === event.confirmed.dateId,
            )
            .map((row) => (
              <GroupedRow key={row.id} className="flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <DateTimeInfo
                    startsAt={eventLocalToIso(eventDateWall(event, row), event.timeZone)}
                    timeZone={event.timeZone}
                  />
                  {event.groupType !== "PUBLIC" ? (
                    <EventVoteCounts
                      label={eventDateWall(event, row).replace("T", " ")}
                      counts={event.voteCounts?.dates[row.id]}
                    />
                  ) : null}
                </div>
                {event.groupType !== "PUBLIC" && event.canVote && !closed ? (
                  <EventVoteButtons
                    label={eventDateWall(event, row).replace("T", " ")}
                    value={event.myVotes?.dateVotes[row.id]}
                    disabledVotes={
                      eventAvailabilityVoteIsAllowed(
                        event.dates,
                        event.myVotes?.dateVotes ?? {},
                        row.id,
                        "NO",
                      )
                        ? []
                        : ["NO"]
                    }
                    busy={a.blocking || q.isPlaceholderData}
                    onChange={(vote) => a.vote.mutate({ kind: "date", optionId: row.id, vote })}
                  />
                ) : null}
              </GroupedRow>
            ))}
        </GroupedList>
      </section>
      {event.endsAt ? (
        <section aria-label={t`End Date and Time`} className="space-y-3">
          <SearchHelpLabel
            label={t`End Date and Time`}
            helpTitle={t`Field help`}
            help={t`Choose a later time on the same day as the event start. All public tables must finish by this time.`}
          />
          <GroupedList>
            <GroupedRow>
              <DateTimeInfo
                startsAt={event.endsAt}
                timeZone={event.timeZone}
                timeLabel={t`End time`}
              />
            </GroupedRow>
          </GroupedList>
        </section>
      ) : null}
      {event.bookingClosesAt ? (
        <section aria-label={t`Registration Deadline Date and Time`} className="space-y-3">
          <SearchHelpLabel
            label={t`Registration Deadline Date and Time`}
            helpTitle={t`Field help`}
            help={t`Registration closes on a day before the event starts. A new event needs a future deadline.`}
          />
          <GroupedList>
            <GroupedRow>
              <DateTimeInfo
                startsAt={event.bookingClosesAt}
                timeZone={event.timeZone}
                timeLabel={t`Registration Deadline Date and Time`}
              />
            </GroupedRow>
          </GroupedList>
        </section>
      ) : null}
      <section aria-label={t`Locations`} className="space-y-3">
        <h2 className="font-semibold">{t`Locations`}</h2>
        <GroupedList>
          {event.locations
            .filter(
              (row) =>
                event.status === "PLANNING" ||
                !event.confirmed ||
                row.id === event.confirmed.locationId,
            )
            .map((row) => (
              <LocationListRow
                key={row.id}
                name={row.name}
                address={row.address}
                actions={
                  event.groupType !== "PUBLIC" && event.canVote && !closed ? (
                    <EventVoteButtons
                      label={row.name}
                      value={event.myVotes?.locationVotes[row.id]}
                      disabledVotes={
                        eventAvailabilityVoteIsAllowed(
                          event.locations,
                          event.myVotes?.locationVotes ?? {},
                          row.id,
                          "NO",
                        )
                          ? []
                          : ["NO"]
                      }
                      busy={a.blocking || q.isPlaceholderData}
                      onChange={(vote) =>
                        a.vote.mutate({ kind: "location", optionId: row.id, vote })
                      }
                    />
                  ) : undefined
                }
              >
                {event.groupType !== "PUBLIC" ? (
                  <EventVoteCounts label={row.name} counts={event.voteCounts?.locations[row.id]} />
                ) : null}
              </LocationListRow>
            ))}
        </GroupedList>
      </section>
      <section aria-label={t`Tables`} className="space-y-3">
        <h2 className="font-semibold">{t`Tables`}</h2>
        {tables.items.map((row) => (
          <EventTableCard key={row.id} table={row} context="event" />
        ))}
        {!tables.isPending && !tables.isError && !tables.items.length ? (
          <EmptyList icon={<Dices className="size-7" />}>{t`No tables found`}</EmptyList>
        ) : null}
        {tables.isPending || tables.isFetchingNextPage ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : null}
        {tables.isError ? (
          <div role="alert">
            <p className="text-danger">{t`Could not load tables`}</p>
            <Button onPress={() => void tables.refetch()}>{t`Try again`}</Button>
          </div>
        ) : null}
        <div ref={end} />
        {tables.hasNextPage ? (
          <Button
            isDisabled={tables.isFetchingNextPage}
            onPress={() => void tables.fetchNextPage()}
          >{t`Load more`}</Button>
        ) : null}
      </section>
      {event.adminUserId === o.userId && event.status === "CONFIRMED" && event.canReplan ? (
        <FloatingActions
          label={t`Reopen planning`}
          variant="secondary"
          isDisabled={a.busy || q.isPlaceholderData}
          onPress={() => {
            setError(false);
            setConfirm("replan");
          }}
        >
          <RotateCcw className="size-5" aria-hidden />
        </FloatingActions>
      ) : null}
      {event.status === "PLANNING" && event.canEdit && !closed ? (
        <FloatingActions
          href={`/events/${event.id}/edit`}
          label={t`Edit event`}
          isDisabled={a.busy || q.isPlaceholderData}
        >
          <Pencil className="size-5" aria-hidden />
        </FloatingActions>
      ) : null}
      {confirm ? (
        <ContactConfirmDialog
          title={confirm === "confirm" ? t`Confirm event` : t`Reopen planning`}
          description={
            confirm === "confirm"
              ? t`Only agreed tables and accepted players are frozen. Other tables and invitations are retained but excluded.`
              : t`Votes, invitations and waiting priorities are retained. The booking cutoff is not extended.`
          }
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={[
            {
              label: t`Confirm`,
              variant: "primary",
              icon:
                confirm === "confirm" ? (
                  <CalendarCheck className="size-4" aria-hidden />
                ) : (
                  <RotateCcw className="size-4" aria-hidden />
                ),
              onPress: () => void transition(confirm),
            },
          ]}
        >
          {error ? (
            <p
              role="alert"
              className="text-danger"
            >{t`Could not change event state. Refresh and try again.`}</p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
    </div>
  );
}
