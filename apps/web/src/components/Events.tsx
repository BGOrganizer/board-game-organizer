"use client";
import {
  type BookingAction,
  communityAccessDenied,
  formatLocationAddress,
  useEvent,
  useEventActions,
  useEventBookings,
  useEventList,
  useEventTable,
  useEventTables,
  useEventWindow,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, CalendarDays, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { LinkedListCard } from "@/components/LinkedListCard";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
export function Events({ organizationId = "" }: { organizationId?: string }) {
  const { t, i18n } = useLingui();
  const options = useCommunityApi();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const list = useEventList(options, organizationId, search);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    fetchNextPage: list.fetchNextPage,
  });
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-28">
      <TextField value={query} onChange={setQuery}>
        <Label>{t`Search events`}</Label>
        <div className="flex gap-2">
          <Input name="events-search" autoComplete="off" maxLength={120} />
          <Button variant="ghost" onPress={() => setQuery("")}>{t`Clear`}</Button>
        </div>
      </TextField>
      {list.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {(communityAccessDenied(list.error) ? [] : list.items).map((event) => (
        <LinkedListCard
          key={event.id}
          href={`/events/${event.id}`}
          label={`${t`Open event`}: ${event.name}`}
        >
          <CalendarDays aria-hidden className="size-6 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{event.name}</span>
            <span className="block text-sm">
              {event.organizationName} · {event.status === "DRAFT" ? t`Draft` : t`Published`}
            </span>
            <time dateTime={event.startsAt}>
              {new Intl.DateTimeFormat(i18n.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(event.startsAt))}
            </time>
            <span className="block truncate text-sm">
              {formatLocationAddress(event.location.address)}
            </span>
          </span>
        </LinkedListCard>
      ))}
      {list.isError ? (
        <div role="alert">
          <p>{t`Could not load events`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Retry`}</Button>
        </div>
      ) : null}
      {!list.isPending && !list.isError && !list.items.length ? <p>{t`No events found`}</p> : null}
      <div ref={sentinel} />
      {list.isFetchingNextPage ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
      {list.hasNextPage ? (
        <Button
          isDisabled={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
        >{t`Load more`}</Button>
      ) : null}
      <Link
        href={`/events/new${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""}`}
        className="fixed right-6 bottom-6 flex min-h-14 items-center gap-2 rounded-full bg-accent px-5 text-accent-foreground shadow-lg"
      >
        <Plus aria-hidden />
        {t`New event`}
      </Link>
    </section>
  );
}
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
        <p>{t`No tables found`}</p>
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
export function EventTableDetail({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t, i18n } = useLingui();
  const o = useCommunityApi();
  const eventQuery = useEvent(o, eventId);
  const event = communityAccessDenied(eventQuery.error) ? undefined : eventQuery.data;
  const tableQuery = useEventTable({ ...o, enabled: Boolean(event) }, eventId, tableId);
  const table = communityAccessDenied(tableQuery.error) ? undefined : tableQuery.data;
  const open = useEventWindow(event);
  const actions = useEventActions(o);
  const [confirm, setConfirm] = useState<{ id: string; action: BookingAction } | null>(null);
  const [invite, setInvite] = useState(false);
  const bookings = useEventBookings(
    { ...o, enabled: Boolean(event && event.role !== "visitor" && table) },
    eventId,
    tableId,
  );
  const members = useOrganizationMembers(
    { ...o, enabled: invite && event?.role === "admin" && open },
    event?.organizationId ?? "",
    "accepted",
  );
  const act = (id: string, action: BookingAction) => {
    if (["cancel", "remove"].includes(action)) setConfirm({ id, action });
    else void actions.booking.mutateAsync({ id, action, eventId }).catch(() => {});
  };
  if (!event || !table)
    return (
      <div>
        {eventQuery.isPending || (Boolean(event) && tableQuery.isPending) ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div role="alert">
            <p>{t`Could not load table`}</p>
            <Button
              onPress={() => {
                void eventQuery.refetch();
                if (event) void tableQuery.refetch();
              }}
            >{t`Retry`}</Button>
          </div>
        )}
      </div>
    );
  const mine = table.myBooking;
  const admin = event.role === "admin";
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <Link href={`/events/${eventId}`}>{t`Back to event`}</Link>
      <h1 className="text-xl font-semibold">{table.name}</h1>
      <p>{table.gameName}</p>
      <p>
        {new Intl.DateTimeFormat(i18n.locale, {
          timeStyle: "short",
          timeZone: event.timeZone,
        }).format(new Date(table.startsAt))}{" "}
        –{" "}
        {new Intl.DateTimeFormat(i18n.locale, {
          timeStyle: "short",
          timeZone: event.timeZone,
        }).format(new Date(table.endsAt))}
      </p>
      <p>
        {table.confirmedCount}/{table.maxPlayers} {t`confirmed players`} · {table.reservedCount}{" "}
        {t`reserved places`}
      </p>
      <p>
        {t`Minimum players`}: {table.minPlayers}
      </p>
      {table.demonstrator ? (
        <p>
          {t`Demonstrator`}: {table.demonstrator.username ?? t`Username unavailable`}
        </p>
      ) : null}
      <p>{table.openSkill ? t`Global ratings enabled` : t`Global ratings disabled`}</p>
      {open && table.canBook ? (
        <Button
          isDisabled={actions.busy}
          onPress={() => void actions.request.mutateAsync({ eventId, tableId }).catch(() => {})}
        >{t`Request a place`}</Button>
      ) : null}
      {open && mine?.status === "PENDING" && mine.kind === "INVITATION" ? (
        <div className="flex gap-2">
          <Button
            isDisabled={actions.busy}
            onPress={() => act(mine.id, "accept")}
          >{t`Accept invitation`}</Button>
          <Button
            variant="danger"
            isDisabled={actions.busy}
            onPress={() => act(mine.id, "decline")}
          >{t`Decline invitation`}</Button>
        </div>
      ) : null}
      {open &&
      mine &&
      (mine.status === "CONFIRMED" || (mine.status === "PENDING" && mine.kind === "REQUEST")) ? (
        <Button
          variant="danger"
          isDisabled={actions.busy}
          onPress={() => act(mine.id, "cancel")}
        >{t`Cancel booking`}</Button>
      ) : null}
      {!open ? <p>{t`Bookings are closed. Results can still be recorded.`}</p> : null}
      {table.matchId ? (
        <Link href={`/matches/${table.matchId}`}>
          {table.status === "TERMINATED" ? t`View results` : t`Open table match`}
        </Link>
      ) : null}
      {admin && open ? (
        <Button onPress={() => setInvite(!invite)}>{t`Invite organization members`}</Button>
      ) : null}
      {invite && admin && open ? (
        <div className="space-y-2">
          {members.isPending ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
          {members.items.map((member) => (
            <Button
              key={member.userId}
              isDisabled={actions.busy || bookings.items.some((b) => b.userId === member.userId)}
              onPress={() =>
                void actions.invite
                  .mutateAsync({ eventId, tableId, userId: member.userId })
                  .catch(() => {})
              }
            >
              {member.username ?? t`Username unavailable`}
            </Button>
          ))}
          {members.isError ? (
            <Button onPress={() => void members.refetch()}>{t`Retry`}</Button>
          ) : null}
          {members.hasNextPage ? (
            <Button onPress={() => void members.fetchNextPage()}>{t`Load more`}</Button>
          ) : null}
        </div>
      ) : null}
      {event.role !== "visitor" ? (
        <div className="space-y-3">
          {bookings.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
          {(communityAccessDenied(bookings.error) ? [] : bookings.items).map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-xl bg-surface p-3">
              <span className="min-w-0 flex-1 truncate">
                {b.username ?? t`Username unavailable`} ·{" "}
                {b.status === "CONFIRMED" ? t`Confirmed` : t`Pending`}
              </span>
              {admin && open ? (
                <div className="flex gap-2">
                  {b.status === "PENDING" && b.kind === "REQUEST" ? (
                    <>
                      <Button
                        isIconOnly
                        aria-label={t`Approve request`}
                        isDisabled={actions.busy}
                        onPress={() => act(b.id, "approve")}
                      >
                        <Check className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        isIconOnly
                        aria-label={t`Reject request`}
                        variant="danger-soft"
                        isDisabled={actions.busy}
                        onPress={() => act(b.id, "reject")}
                      >
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                  <Button
                    isIconOnly
                    aria-label={t`Remove player`}
                    variant="danger-soft"
                    isDisabled={actions.busy}
                    onPress={() => act(b.id, "remove")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {bookings.isError ? (
            <div role="alert">
              <Button
                onPress={() => void bookings.refetch()}
              >{t`Could not load bookings. Retry`}</Button>
            </div>
          ) : null}
          {bookings.hasNextPage ? (
            <Button onPress={() => void bookings.fetchNextPage()}>{t`Load more`}</Button>
          ) : null}
          {bookings.isFetchingNextPage ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
        </div>
      ) : null}
      {confirm ? (
        <ContactConfirmDialog
          title={confirm.action === "remove" ? t`Remove player` : t`Cancel booking`}
          description={t`This reservation will be removed. The player can request a place again before the deadline.`}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setConfirm(null);
          }}
          actions={[
            {
              label: t`Confirm`,
              variant: "danger",
              onPress: () =>
                void actions.booking
                  .mutateAsync({ ...confirm, eventId })
                  .then(() => setConfirm(null))
                  .catch(() => {}),
            },
          ]}
        />
      ) : null}
    </section>
  );
}
