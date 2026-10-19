"use client";
import {
  communityAccessDenied,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventTableCard } from "./EventTableCard";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteLegend } from "./EventVoteLegend";
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
  if (!event)
    return q.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load event`}</p>
        <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
      </div>
    );
  const transition = async (action: "confirm" | "replan") => {
    setError(false);
    try {
      await a.transition.mutateAsync({ action, version: event.version });
      setConfirm(null);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <Link href="/events" className="inline-flex items-center gap-2 text-accent">
        <ArrowLeft className="size-4" />
        {t`Back`}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{event.name}</h1>
        <EventVoteLegend />
      </div>
      <p>
        {event.status === "PLANNING"
          ? t`Planning`
          : event.status === "CONFIRMED"
            ? t`Confirmed`
            : t`Terminated`}{" "}
        · {event.startTime} ({event.timeZone})
      </p>
      {event.groupName ? (
        <Link href={`/groups/${event.groupId}`} className="text-accent">
          {event.groupName}
        </Link>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {event.canEdit && !closed ? (
          <Link
            href={`/events/${event.id}/edit`}
            className="inline-flex items-center gap-2 text-accent"
          >
            <Pencil className="size-4" />
            {t`Edit event`}
          </Link>
        ) : null}
        {event.canConfirm ? (
          <Button
            isDisabled={a.busy || q.isPlaceholderData}
            onPress={() => setConfirm("confirm")}
          >{t`Confirm event`}</Button>
        ) : null}
        {event.canReplan ? (
          <Button
            variant="secondary"
            isDisabled={a.busy}
            onPress={() => setConfirm("replan")}
          >{t`Reopen planning`}</Button>
        ) : null}
        {event.canFinalize ? (
          <Link
            href={`/events/${event.id}/results`}
            className="text-accent"
          >{t`Register results`}</Link>
        ) : null}
      </div>
      <section aria-label={t`Dates`} className="space-y-3">
        <h2 className="font-semibold">{t`Dates`}</h2>
        {event.dates
          .filter((row) => !event.confirmed || row.id === event.confirmed.dateId)
          .map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-default-100 p-3"
            >
              <span>{row.day}</span>
              {event.canVote && !closed ? (
                <EventVoteButtons
                  label={row.day}
                  value={event.myVotes?.dateVotes[row.id]}
                  busy={a.busy || q.isPlaceholderData}
                  onChange={(vote) => a.vote.mutate({ kind: "date", optionId: row.id, vote })}
                />
              ) : null}
            </div>
          ))}
      </section>
      <section aria-label={t`Locations`} className="space-y-3">
        <h2 className="font-semibold">{t`Locations`}</h2>
        {event.locations
          .filter((row) => !event.confirmed || row.id === event.confirmed.locationId)
          .map((row) => (
            <div key={row.id} className="space-y-2 rounded-xl bg-default-100 p-3">
              <LocationListRow name={row.name} address={row.address} />
              {event.canVote && !closed ? (
                <EventVoteButtons
                  label={row.name}
                  value={event.myVotes?.locationVotes[row.id]}
                  busy={a.busy || q.isPlaceholderData}
                  onChange={(vote) => a.vote.mutate({ kind: "location", optionId: row.id, vote })}
                />
              ) : null}
            </div>
          ))}
      </section>
      {event.bookingClosesAt ? (
        <p>
          {t`Booking cutoff`}: {new Date(event.bookingClosesAt).toLocaleString()} · {t`Event end`}:{" "}
          {event.endsAt ? new Date(event.endsAt).toLocaleString() : "—"}
        </p>
      ) : null}
      {event.agreement ? (
        <section aria-label={t`Agreement`} className="space-y-2">
          <h2 className="font-semibold">{t`Agreement`}</h2>
          <p>
            {event.agreement.agreed
              ? t`Agreement available. Confirmation remains manual.`
              : t`No complete agreement yet.`}
          </p>
          {event.agreement.reasons.map((reason) => (
            <p key={reason.tableId}>
              {tables.items.find((row) => row.id === reason.tableId)?.name ?? t`Table`}:{" "}
              {reason.code === "PENDING_RESERVATIONS"
                ? t`Pending invitations still reserve places.`
                : reason.code === "GAME_DISAGREEMENT"
                  ? t`Seated players agree on date and location but not game. Change votes or edit the games; waiting players cannot replace them for this reason.`
                  : t`No compatible accepted players for this table.`}
            </p>
          ))}
        </section>
      ) : q.isPlaceholderData ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : null}
      <section aria-label={t`Tables`} className="space-y-3">
        <h2 className="font-semibold">{t`Tables`}</h2>
        {tables.items.map((row) => (
          <EventTableCard key={row.id} table={row} />
        ))}
        {tables.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
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
            { label: t`Confirm`, variant: "primary", onPress: () => void transition(confirm) },
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
