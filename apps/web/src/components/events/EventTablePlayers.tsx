"use client";
import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { useEventTableParticipation } from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Armchair, Check, ClipboardCheck, Clock3, LogOut, UserRoundMinus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventTableInvitationPicker } from "./EventTableInvitationPicker";

export function EventTablePlayers({
  eventId,
  tableId,
  frozen,
  renderActions,
}: {
  eventId: string;
  tableId: string;
  frozen?: MatchDetailResponse;
  renderActions?: (userId: string) => ReactNode;
}) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const flow = useEventTableParticipation(options, eventId, tableId, frozen);
  const [inviting, setInviting] = useState(false);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(flow.hasMore),
    isFetchingNextPage: flow.bookings.isFetchingNextPage,
    isFetchNextPageError: flow.bookings.isFetchNextPageError,
    fetchNextPage: flow.advance,
  });
  const byId = new Map(flow.live.map((row) => [row.id, row]));
  const dialog = flow.dialog;
  const mode = dialog?.kind === "join" ? "join" : dialog?.mode;
  const run = (action?: Parameters<typeof flow.submit>[0]) => {
    void flow.submit(action).catch(() => undefined);
  };
  const title =
    mode === "join"
      ? t`Reserve a place`
      : mode === "manage"
        ? t`Respond to participation request`
        : mode === "invitation"
          ? t`Respond to table invitation`
          : mode === "remove"
            ? t`Remove player`
            : t`Leave table`;
  const description =
    mode === "join"
      ? t`Your place will be reserved while an administrator reviews your request. You will be notified when it is accepted or rejected.`
      : mode === "manage"
        ? t`Accept or reject this table participation request.`
        : mode === "invitation"
          ? t`Accept or reject this table invitation.`
          : mode === "remove"
            ? t`This player's reserved place will become available again.`
            : t`Your reserved place will become available again.`;
  if (inviting && flow.event && flow.table && flow.admin && flow.open)
    return (
      <EventTableInvitationPicker
        event={flow.event}
        table={flow.table}
        occupied={flow.live.map((row) => row.userId)}
        onClose={() => setInviting(false)}
      />
    );
  return (
    <section aria-label={t`Players`} className="space-y-4">
      {flow.loading ? <Skeleton className="h-48 w-full rounded-xl" /> : null}
      {flow.error ? (
        <div role="alert" className="space-y-2">
          <p className="text-danger">{t`Could not load table players.`}</p>
          <Button
            variant="secondary"
            onPress={() => {
              void flow.eventQuery.refetch();
              void flow.tableQuery.refetch();
              if (!flow.visitor) void flow.bookings.refetch();
            }}
          >{t`Retry`}</Button>
        </div>
      ) : null}
      {flow.visitor ? (
        <p>{t`Only confirmed organization members can view players and reserve places.`}</p>
      ) : !flow.loading ? (
        <GroupedList>
          {flow.seats.map((seat) => {
            const person = seat.user;
            const own = person?.userId === options.userId;
            const name = person?.name || (own ? t`You` : t`Username unavailable`);
            const booking = person ? byId.get(person.id) : undefined;
            return (
              <GroupedRow
                key={seat.index}
                style={{ contentVisibility: "auto", containIntrinsicSize: "72px" }}
              >
                {person ? (
                  <>
                    <div className="relative shrink-0">
                      <Avatar size="sm">
                        <Avatar.Image src={person.avatarUrl ?? undefined} alt="" />
                        <Avatar.Fallback>{name.slice(0, 2)}</Avatar.Fallback>
                      </Avatar>
                      {booking?.status === "PENDING" ? (
                        <Clock3
                          role="img"
                          aria-label={t`Pending`}
                          className="absolute -right-1 -bottom-1 size-4 rounded-full bg-warning text-warning-foreground"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{name}</p>
                      {person.secondary ? (
                        <p className="truncate text-sm text-default-500">{person.secondary}</p>
                      ) : null}
                      {booking?.status === "PENDING" ? (
                        <p className="text-sm text-default-500">
                          {booking.kind === "REQUEST" ? t`Awaiting admin approval` : t`Invited`}
                        </p>
                      ) : null}
                    </div>
                    {booking && flow.canManage(booking) ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="primary"
                        className="min-h-11 min-w-11"
                        aria-label={`${t`Respond to participation request`}: ${name}`}
                        isDisabled={flow.busy}
                        onPress={() => flow.openBooking(booking, "manage")}
                      >
                        <ClipboardCheck aria-hidden className="size-4" />
                      </Button>
                    ) : null}
                    {booking && flow.canRespond(booking) ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="primary"
                        className="min-h-11 min-w-11"
                        aria-label={`${t`Respond to table invitation`}: ${name}`}
                        isDisabled={flow.busy}
                        onPress={() => flow.openBooking(booking, "invitation")}
                      >
                        <ClipboardCheck aria-hidden className="size-4" />
                      </Button>
                    ) : null}
                    {own ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="danger"
                        className="min-h-11 min-w-11"
                        aria-label={`${t`Leave table`}: ${name}`}
                        isDisabled={flow.busy || !booking || !flow.canLeave(booking)}
                        onPress={() => {
                          if (booking) flow.openBooking(booking, "cancel");
                        }}
                      >
                        <LogOut aria-hidden className="size-4" />
                      </Button>
                    ) : booking && flow.admin && flow.open ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="danger"
                        className="min-h-11 min-w-11"
                        aria-label={`${t`Remove player`}: ${name}`}
                        isDisabled={flow.busy}
                        onPress={() => flow.openBooking(booking, "remove")}
                      >
                        <UserRoundMinus aria-hidden className="size-4" />
                      </Button>
                    ) : null}
                    {renderActions?.(person.userId)}
                  </>
                ) : seat.reserved ? (
                  <>
                    <Armchair aria-hidden className="size-5 text-default-500" />
                    <span className="text-default-500">{t`Reserved place`}</span>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    className="min-h-11 w-full justify-start text-default-500"
                    aria-label={`${t`Reserve a place`}: ${seat.index + 1}`}
                    isDisabled={!flow.canJoin}
                    onPress={() => flow.openJoin(seat.index)}
                  >
                    <Armchair aria-hidden className="size-5" />
                    {t`Empty place`}
                  </Button>
                )}
              </GroupedRow>
            );
          })}
        </GroupedList>
      ) : null}
      {flow.event && flow.table && flow.admin && flow.open && flow.event.status === "PUBLISHED" ? (
        <Button
          variant="secondary"
          isDisabled={flow.busy || flow.table.reservedCount >= flow.table.maxPlayers}
          onPress={() => setInviting(true)}
        >{t`Invite organization members`}</Button>
      ) : null}
      {flow.hasMore && !flow.visitor ? (
        <>
          <div ref={sentinel} aria-hidden className="h-1" />
          <Button
            variant="secondary"
            isDisabled={flow.bookings.isFetchingNextPage}
            onPress={() => {
              void (
                flow.bookings.isFetchNextPageError ? flow.bookings.fetchNextPage() : flow.advance()
              ).catch(() => undefined);
            }}
          >
            {flow.bookings.isFetchNextPageError ? t`Retry` : t`Load more`}
          </Button>
        </>
      ) : null}
      {dialog ? (
        <ContactConfirmDialog
          title={title}
          description={description}
          busy={flow.busy}
          onCancel={flow.dismiss}
          cancelLast
          actionsInRow={mode === "manage" || mode === "invitation"}
          cancelIcon={<X aria-hidden className="size-4" />}
          actions={
            mode === "manage" || mode === "invitation"
              ? [
                  {
                    label: t`Accept`,
                    variant: "primary",
                    icon: <Check className="size-4" />,
                    onPress: () => run(mode === "manage" ? "approve" : "accept"),
                  },
                  {
                    label: t`Reject`,
                    variant: "danger",
                    icon: <X className="size-4" />,
                    onPress: () => run(mode === "manage" ? "reject" : "decline"),
                  },
                ]
              : [
                  {
                    label: title,
                    variant: mode === "join" ? "primary" : "danger",
                    icon:
                      mode === "join" ? (
                        <Armchair className="size-4" />
                      ) : (
                        <LogOut className="size-4" />
                      ),
                    onPress: () =>
                      run(mode === "join" ? undefined : mode === "remove" ? "remove" : "cancel"),
                  },
                ]
          }
        />
      ) : null}
    </section>
  );
}
