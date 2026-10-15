"use client";
import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { useEventTableParticipation } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Armchair,
  Check,
  ClipboardCheck,
  Clock3,
  LockKeyhole,
  LogOut,
  UserRoundMinus,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { MatchPlayerLimits } from "@/components/matches/MatchPlayerLimits";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

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
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(flow.hasMore),
    isFetchingNextPage: flow.bookings.isFetchingNextPage,
    isFetchNextPageError: flow.bookings.isFetchNextPageError,
    fetchNextPage: flow.advance,
  });
  const byId = new Map(flow.live.map((row) => [row.id, row]));
  const limits = frozen?.match ?? flow.table;
  const unavailableExplanation =
    flow.joinUnavailableReason === "closed"
      ? t`Bookings for this table are not open. Free places cannot currently be reserved.`
      : flow.joinUnavailableReason === "already-booked"
        ? t`You already have a reservation or pending request for this table.`
        : flow.joinUnavailableReason === "busy"
          ? t`Wait for the current action to finish before reserving a place.`
          : t`This place is free, but booking is currently unavailable to you.`;
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
            : t`Leave place`;
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
  return (
    <section aria-label={t`Seats`} className="space-y-4">
      {!flow.visitor && limits ? (
        <MatchPlayerLimits minPlayers={limits.minPlayers} maxPlayers={limits.maxPlayers} />
      ) : null}
      {!flow.visitor ? (
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Armchair className="size-4 text-default-500" aria-hidden />
          {t`Table seats`}
        </h2>
      ) : null}
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
                    <UserIdentity
                      name={name}
                      avatarUrl={person.avatarUrl}
                      secondary={person.secondary ?? t`Username unavailable`}
                      badge={
                        booking?.status === "PENDING" ? (
                          <Clock3
                            role="img"
                            aria-label={t`Pending`}
                            className="absolute -right-1 -bottom-1 size-4 rounded-full bg-warning text-warning-foreground"
                          />
                        ) : null
                      }
                    >
                      {booking?.status === "PENDING" ? (
                        <span className="block text-sm text-default-500">
                          {booking.kind === "REQUEST" ? t`Awaiting admin approval` : t`Invited`}
                        </span>
                      ) : null}
                    </UserIdentity>
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
                        aria-label={`${t`Leave place`}: ${name}`}
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
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Button
                      variant="ghost"
                      className="min-h-11 min-w-0 flex-1 justify-start text-default-500"
                      aria-label={`${seat.reserved ? t`Reserved place` : t`Reserve a place`}: ${seat.index + 1}`}
                      isDisabled={seat.reserved || !flow.canJoin}
                      onPress={() => flow.openJoin(seat.index)}
                    >
                      {seat.reserved ? (
                        <LockKeyhole aria-hidden className="size-5" />
                      ) : (
                        <Armchair aria-hidden className="size-5" />
                      )}
                      {seat.reserved ? t`Reserved place` : t`Empty place`}
                    </Button>
                    {seat.reserved || !flow.canJoin ? (
                      <HelpPopover
                        label={`${seat.reserved ? t`Why is this place reserved?` : t`Why can't I reserve this place?`}: ${seat.index + 1}`}
                        title={seat.reserved ? t`Reserved place` : t`Empty place`}
                        placement="bottom end"
                        className="max-w-xs"
                      >
                        <p>
                          {seat.reserved
                            ? t`This place is already reserved and cannot be selected. It may belong to a pending request or a player whose details are not currently shown.`
                            : unavailableExplanation}
                        </p>
                      </HelpPopover>
                    ) : null}
                  </div>
                )}
              </GroupedRow>
            );
          })}
        </GroupedList>
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
          cancelLast={mode === "manage" || mode === "invitation" || mode === "remove"}
          actionsInRow
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
                    variant: "danger-soft",
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
                      ) : mode === "remove" ? (
                        <UserRoundMinus className="size-4" />
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
