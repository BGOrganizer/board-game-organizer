"use client";
import {
  type BookingAction,
  communityAccessDenied,
  useEvent,
  useEventActions,
  useEventBookings,
  useEventTable,
  useEventWindow,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Trash2, X } from "lucide-react";
import Link from "next/link";

import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";

import { useCommunityApi } from "@/lib/useCommunityApi";

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
