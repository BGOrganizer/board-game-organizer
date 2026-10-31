"use client";
import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import {
  useEventCutoff,
  useEventRecordActions,
  useEventTableRoster,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, LogOut, Mail, UserRoundCheck, UserRoundPlus, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventJoinSheet } from "./EventJoinSheet";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
export function EventTableSeats({
  table,
  header,
  onRemove,
  hasJoinedEvent,
}: {
  table: PlannedTableResponse;
  header?: ReactNode;
  hasJoinedEvent?: boolean;
  onRemove: (row: TableSeatResponse, own: boolean) => void;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    a = useEventRecordActions(o, table.eventId);
  const roster = useEventTableRoster(o, table),
    closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const [choose, setChoose] = useState(false),
    [joining, setJoining] = useState(false);
  const canAdd =
    !closed &&
    (table.canRegister || table.canInvite) &&
    (table.groupType !== "PRIVATE" || hasJoinedEvent !== undefined);
  const end = useInfiniteScroll({
    hasNextPage: roster.hasNextPage,
    isFetchingNextPage: roster.isFetchingNextPage,
    isFetchNextPageError: roster.isFetchNextPageError,
    fetchNextPage: async () => roster.more(),
  });
  const join = () => {
    setChoose(false);
    setJoining(true);
  };
  return (
    <section className="space-y-3" aria-label={t`Seats list`}>
      {header}
      <div className="flex items-center gap-1">
        <h2 className="font-semibold">{t`Seats list`}</h2>
        <HelpPopover label={`${t`Seats list`}: ${t`Field help`}`} title={t`Seats list`}>
          <IconLegend
            items={[
              { icon: UserRoundCheck, description: t`Accepted player` },
              { icon: Mail, description: t`Invitation pending` },
              { icon: Clock3, description: t`Waiting list` },
            ]}
          />
          <p className="mt-3 text-sm">{t`Pending invitations reserve a place but do not vote or count toward agreement. Accepted waiting players may vote.`}</p>
          <p className="mt-2 text-sm">{t`Free places allow joining or invitations. When capacity is reserved, an extra place lets new players join the queue. Places are not assigned physical seats.`}</p>
          <p className="mt-2 text-sm">{t`Only the organizer and recipient can see pending invitation identities.`}</p>
        </HelpPopover>
      </div>
      <GroupedList>
        {roster.rows.map((item) => {
          if (item.kind === "pending") {
            const label =
              item.phase === "verifying"
                ? t`Checking saved changes`
                : item.action === "join"
                  ? t`Joining table`
                  : item.action === "accept"
                    ? t`Accepting invitation`
                    : t`Sending invitation`;
            const Icon = item.action ? Clock3 : Mail;
            return (
              <GroupedRow key={item.key}>
                <UserIdentity
                  name={item.name || t`You`}
                  avatarUrl={item.avatarUrl}
                  secondary={label}
                  badge={
                    <span
                      role="img"
                      aria-label={label}
                      className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5 text-warning"
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                  }
                />
              </GroupedRow>
            );
          }
          if (item.kind !== "player") {
            const reserved = item.kind === "reserved",
              label = reserved
                ? t`Reserved place`
                : item.queue
                  ? t`Join waiting list`
                  : t`Free place`;
            return (
              <GroupedRow
                key={item.key}
                className="[contain-intrinsic-size:auto_4rem] [content-visibility:auto]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-default-100">
                  <UserRoundPlus className="size-5 text-default-500" aria-hidden />
                </span>
                <Button
                  className="min-h-11 min-w-0 flex-1 justify-start px-0"
                  variant="ghost"
                  isDisabled={reserved || !canAdd || a.blocking}
                  onPress={() => {
                    if (table.canInvite || table.groupType === "PRIVATE") setChoose(true);
                    else void join();
                  }}
                >
                  {label}
                </Button>
              </GroupedRow>
            );
          }
          const row = item.user,
            own = row.userId === o.userId,
            name = own && (!row.name || row.name === o.userId) ? t`You` : (row.name ?? row.userId);
          const pending = row.status === "PENDING",
            waiting = row.position === "WAITING";
          const Icon = pending ? Mail : waiting ? Clock3 : UserRoundCheck;
          const status = pending
            ? t`Invitation pending`
            : waiting
              ? t`Waiting list`
              : t`Accepted player`;
          return (
            <GroupedRow
              key={item.key}
              className="[contain-intrinsic-size:auto_4rem] [content-visibility:auto]"
            >
              <UserIdentity
                name={name}
                avatarUrl={row.avatarUrl}
                secondary={
                  table.eventStatus === "CONFIRMED"
                    ? row.email
                    : pending && waiting
                      ? `${status} · ${t`Waiting list`}`
                      : status
                }
                badge={
                  <span
                    role="img"
                    aria-label={status}
                    className={`absolute -right-1 -bottom-1 rounded-full bg-background p-0.5 ${pending || waiting ? "text-warning" : "text-success"}`}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                }
              />
              <span className="flex shrink-0 items-center gap-1">
                {own && table.canRespond && pending && !closed && table.myRegistration ? (
                  <EventTableInvitationActions
                    eventId={table.eventId}
                    registration={table.myRegistration}
                  />
                ) : null}
                {!closed &&
                (own ? table.canLeave && row.status === "ACCEPTED" : table.canInvite) ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    isDisabled={a.blocking}
                    aria-label={own ? t`Leave table` : `${t`Remove player`}: ${name}`}
                    onPress={() => onRemove(row, own)}
                  >
                    {own ? (
                      <LogOut className="size-4" aria-hidden />
                    ) : (
                      <UserRoundX className="size-4" aria-hidden />
                    )}
                  </Button>
                ) : null}
              </span>
            </GroupedRow>
          );
        })}
      </GroupedList>
      {roster.isPending || roster.isFetchingNextPage ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : null}
      {roster.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load players`}</p>
          <Button onPress={roster.refetch}>{t`Try again`}</Button>
        </div>
      ) : null}
      {roster.hasNextPage ? (
        <div ref={end}>
          <Button isDisabled={roster.isFetchingNextPage} onPress={roster.more}>
            {roster.isFetchNextPageError ? t`Try again` : t`Load more`}
          </Button>
        </div>
      ) : null}
      {choose ? (
        <ContactConfirmDialog
          title={table.canInvite ? t`Choose a place action` : t`Join table`}
          description={
            table.canInvite
              ? t`Join this table yourself or invite another player.`
              : t`Choose your availability before joining this table.`
          }
          busy={a.blocking}
          onCancel={() => setChoose(false)}
          actions={[
            ...(!closed && table.canRegister
              ? [{ label: t`Join table`, onPress: () => void join() }]
              : []),
            ...(!closed && table.canInvite
              ? [
                  {
                    label: t`Invite players`,
                    onPress: () => {
                      setChoose(false);
                      router.push(`/events/${table.eventId}/tables/${table.id}/invite`);
                    },
                  },
                ]
              : []),
          ]}
        ></ContactConfirmDialog>
      ) : null}
      {joining ? (
        <EventJoinSheet
          eventId={table.eventId}
          tableId={table.id}
          onClose={() => setJoining(false)}
        />
      ) : null}
    </section>
  );
}
