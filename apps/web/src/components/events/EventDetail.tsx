"use client";
import {
  communityAccessDenied,
  formatLocationAddress,
  useEvent,
  useEventActions,
  useEventTables,
  useEventWindow,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventDetail({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { t, i18n } = useLingui();
  const options = useCommunityApi();
  const detail = useEvent(options, eventId);
  const event = communityAccessDenied(detail.error) ? undefined : detail.data;
  const open = useEventWindow(event);
  const actions = useEventActions(options);
  const [cancel, setCancel] = useState(false);
  const tables = useEventTables({ ...options, enabled: Boolean(event) }, eventId);
  if (!event)
    return (
      <div>
        {detail.isPending ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <div role="alert">
            <p>{t`Could not load event`}</p>
            <Button onPress={() => void detail.refetch()}>{t`Retry`}</Button>
          </div>
        )}
      </div>
    );
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <Link href="/events" aria-label={t`Back`}>
        <ArrowLeft aria-hidden />
      </Link>
      <h1 className="text-xl font-semibold">{event.name}</h1>
      <Link href={`/organizations/${event.organizationId}`}>{event.organizationName}</Link>
      <p>
        {new Intl.DateTimeFormat(i18n.locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: event.timeZone,
        }).format(new Date(event.startsAt))}{" "}
        –{" "}
        {new Intl.DateTimeFormat(i18n.locale, {
          timeStyle: "short",
          timeZone: event.timeZone,
        }).format(new Date(event.endsAt))}{" "}
        · {event.timeZone}
      </p>
      <p>
        {event.location.name} · {formatLocationAddress(event.location.address)}
      </p>
      <p>
        {t`Booking deadline`}:{" "}
        {new Intl.DateTimeFormat(i18n.locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: event.timeZone,
        }).format(new Date(event.bookingClosesAt))}
      </p>
      {!open && event.status === "PUBLISHED" ? (
        <p>{t`Bookings are closed. Results can still be recorded.`}</p>
      ) : null}
      {event.role === "admin" && open ? (
        <div className="flex gap-3">
          <Link href={`/events/${event.id}/edit`}>
            <Pencil aria-hidden className="inline size-4" /> {t`Edit event`}
          </Link>
          <Button variant="danger" isDisabled={actions.busy} onPress={() => setCancel(true)}>
            <Trash2 aria-hidden className="size-4" />
            {t`Cancel event`}
          </Button>
        </div>
      ) : null}
      {tables.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {tables.items.map((table) => (
        <LinkedListCard
          key={table.id}
          href={`/events/${event.id}/tables/${table.id}`}
          label={`${t`Open table`}: ${table.name}`}
        >
          <span>
            <span className="block font-semibold">{table.name}</span>
            <span className="block">
              {table.gameName} · {table.confirmedCount}/{table.maxPlayers} {t`confirmed players`}
            </span>
            <span className="block text-sm">
              {table.reservedCount} {t`reserved places`} ·{" "}
              {table.status === "PLANNING"
                ? t`Planning`
                : table.status === "CREATED"
                  ? t`Confirmed`
                  : table.status === "TERMINATED"
                    ? t`Finished`
                    : t`Cancelled`}
            </span>
          </span>
        </LinkedListCard>
      ))}
      {!tables.isPending && !tables.isError && !tables.items.length ? (
        <EmptyList icon={<LayoutGrid className="size-7" />}>{t`No tables found`}</EmptyList>
      ) : null}
      {tables.isError ? (
        <Button onPress={() => void tables.refetch()}>{t`Could not load tables. Retry`}</Button>
      ) : null}
      {tables.hasNextPage ? (
        <Button
          isDisabled={tables.isFetchingNextPage}
          onPress={() => void tables.fetchNextPage()}
        >{t`Load more`}</Button>
      ) : null}
      {tables.isFetchingNextPage ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {cancel ? (
        <ContactConfirmDialog
          title={t`Cancel event`}
          description={t`All unfinished tables and reservations will be cancelled.`}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setCancel(false);
          }}
          actions={[
            {
              label: t`Cancel event`,
              variant: "danger",
              onPress: () =>
                void actions.cancel
                  .mutateAsync(event.id)
                  .then(() => {
                    setCancel(false);
                    router.replace("/events");
                  })
                  .catch(() => {}),
            },
          ]}
        />
      ) : null}
    </section>
  );
}
