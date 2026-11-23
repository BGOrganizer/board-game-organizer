"use client";
import {
  notificationItemId,
  type PlannedTableResponse,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  canEditTableGuestVotes,
  formatUsername,
  tableUserRoles,
  useEventCutoff,
  useEventRecordActions,
  useEventTableRoster,
  useTableSeatOrder,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowUpDown, Clock3, LogOut, Mail, UserRoundX, Vote } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { floatingActionPositionStyle } from "@/components/common/layout/floatingActionStyles";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventGuestBadge } from "./EventGuestBadge";
import { EventGuestVoteEditor } from "./EventGuestVoteEditor";
import { EventJoinSheet } from "./EventJoinSheet";
import { EventSeatListHeading } from "./EventSeatListHeading";
import { EventSeatOrderEditor } from "./EventSeatOrderEditor";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
import { EventTableParticipantsHelp } from "./EventTableParticipantsHelp";
export function EventTableSeats({
  table,
  header,
  onRemove,
  hasJoinedEvent,
  active = true,
}: {
  table: PlannedTableResponse;
  header?: ReactNode;
  active?: boolean;
  hasJoinedEvent?: boolean;
  onRemove: (row: TableSeatResponse, own: boolean) => void;
}) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    a = useEventRecordActions(o, table.eventId);
  const order = useTableSeatOrder(o, table);
  const roster = useEventTableRoster(o, table),
    closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const [choose, setChoose] = useState(false),
    [joining, setJoining] = useState(false),
    [guestVote, setGuestVote] = useState<{ registrationId: string; name: string } | null>(null);
  const editGuestVotes = canEditTableGuestVotes(table);
  const canAdd =
    ((!closed && table.canRegister) || table.canInvite) &&
    (table.groupType !== "PRIVATE" || hasJoinedEvent !== undefined);
  const end = useInfiniteScroll({
    hasNextPage: active && roster.hasNextPage,
    isFetchingNextPage: roster.isFetchingNextPage,
    isFetchNextPageError: roster.isFetchNextPageError,
    fetchNextPage: async () => roster.more(),
  });
  const join = () => {
    setChoose(false);
    setJoining(true);
  };
  const participantsHeader = (
    <>
      {header}
      <EventTableParticipantsHelp planning={table.eventStatus === "PLANNING"} />
    </>
  );
  if (order.editing)
    return (
      <div hidden={!active}>
        <EventSeatOrderEditor
          model={order}
          header={participantsHeader}
          demonstratorUserId={table.demonstratorUserId}
        />
      </div>
    );
  return (
    <div className="space-y-3" hidden={!active}>
      {participantsHeader}
      {table.canManage && table.eventStatus === "PLANNING" ? (
        <Button
          isIconOnly
          variant="primary"
          className="fixed right-6 z-40 size-14 rounded-full"
          style={floatingActionPositionStyle}
          aria-label={t`Reorder seats`}
          onPress={() => void order.start()}
        >
          <ArrowUpDown className="size-5" />
        </Button>
      ) : null}
      {[
        { title: t`Seats list`, rows: roster.seatRows, waiting: false },
        { title: t`Waiting list`, rows: roster.waitingRows, waiting: true },
      ].map((section) => (
        <section key={section.title} className="space-y-3" aria-label={section.title}>
          <EventSeatListHeading waiting={section.waiting} />
          <GroupedList>
            {section.rows.map((item) => {
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
                  <UserListRow
                    key={item.key}
                    name={formatUsername(item.username, item.name || t`You`)}
                    avatarUrl={item.avatarUrl}
                    secondary={label}
                    badge={
                      <IconBadge icon={Icon} label={label} title={label} color="warning">
                        <p>{label}</p>
                      </IconBadge>
                    }
                  />
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
                  <AddUserRow
                    className="[contain-intrinsic-size:auto_5.5rem] [content-visibility:auto]"
                    key={item.key}
                    label={label}
                    isDisabled={
                      reserved ||
                      item.key !== roster.rows.find((row) => row.kind === "empty")?.key ||
                      !canAdd ||
                      a.blocking
                    }
                    onPress={() => {
                      if (table.canInvite || table.groupType === "PRIVATE") setChoose(true);
                      else void join();
                    }}
                  />
                );
              }
              const row = item.user;
              const guest = row.kind === "GUEST";
              const own = !guest && row.userId === o.userId;
              const name = guest
                ? (row.guestName ?? t`Guest`)
                : formatUsername(
                    row.username,
                    own && (!row.name || row.name === o.userId) ? t`You` : (row.name ?? row.userId),
                  );
              const pending = row.status === "PENDING";
              const roles = tableUserRoles({
                ...row,
                demonstrator: !guest && table.demonstratorUserId === row.userId,
              });
              const primary = roles[0];
              const status = primary
                ? i18n._(recordUserRoleMessages[primary])
                : pending && row.kind === "SELF"
                  ? t`Participation requested`
                  : t`Loading…`;
              return (
                <UserListRow
                  className="[contain-intrinsic-size:auto_5.5rem] [content-visibility:auto]"
                  key={item.key}
                  titleAccessory={
                    <NotificationItem
                      itemId={
                        own && pending
                          ? notificationItemId(table.id, "invitation", undefined, "table")
                          : undefined
                      }
                    />
                  }
                  name={guest ? formatUsername(row.guestName, name) : name}
                  avatarUrl={guest ? null : row.avatarUrl}
                  avatarContent={guest ? <GuestAvatar name={name} /> : undefined}
                  secondary={guest ? t`Guest` : status}
                  badge={guest ? <EventGuestBadge /> : <UserRoleBadge roles={roles} />}
                  actions={
                    <>
                      {own && table.canRespond && pending && table.myRegistration ? (
                        <EventTableInvitationActions
                          eventId={table.eventId}
                          registration={table.myRegistration}
                        />
                      ) : null}
                      {guest && editGuestVotes ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="secondary"
                          isDisabled={a.blocking}
                          aria-label={`${t`Edit guest votes`}: ${name}`}
                          onPress={() => setGuestVote({ registrationId: row.id, name })}
                        >
                          <Vote className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                      {(
                        own
                          ? !closed && table.canLeave && row.status === "ACCEPTED"
                          : table.canInvite
                      ) ? (
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
                    </>
                  }
                />
              );
            })}
          </GroupedList>
          {section.waiting &&
          !section.rows.length &&
          !roster.isPending &&
          !roster.isError &&
          (!roster.queueOpen || !roster.hasNextPage) ? (
            <EmptyList icon={<Clock3 className="size-7" />}>{t`No players waiting`}</EmptyList>
          ) : null}
        </section>
      ))}
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
              : t`Joining accepts the current event and table settings. Vote only where multiple options are available.`
          }
          busy={a.blocking}
          onCancel={() => setChoose(false)}
          actions={[
            ...(!closed && table.canRegister
              ? [{ label: t`Join table`, onPress: () => void join() }]
              : []),
            ...(table.canInvite
              ? [
                  {
                    label: t`Invite players`,
                    onPress: () => {
                      setChoose(false);
                      const current = new URL(window.location.href);
                      current.searchParams.set("tab", "participants");
                      window.history.replaceState(null, "", current);
                      router.push(`/events/${table.eventId}/tables/${table.id}/invite`);
                    },
                  },
                ]
              : []),
          ]}
        ></ContactConfirmDialog>
      ) : null}
      {guestVote && editGuestVotes && active ? (
        <EventGuestVoteEditor
          table={table}
          registrationId={guestVote.registrationId}
          name={guestVote.name}
          onClose={() => setGuestVote(null)}
        />
      ) : null}
      {joining ? (
        <EventJoinSheet
          eventId={table.eventId}
          tableId={table.id}
          onClose={() => setJoining(false)}
        />
      ) : null}
    </div>
  );
}
