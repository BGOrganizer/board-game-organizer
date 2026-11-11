"use client";
import {
  notificationItemId,
  type PlannedTableResponse,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  formatUsername,
  tableUserRoles,
  useEventCutoff,
  useEventRecordActions,
  useEventTableRoster,
  useTableSeatOrder,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowUpDown, Clock3, LogOut, Mail, UserRoundPlus, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventJoinSheet } from "./EventJoinSheet";
import { EventSeatListHeading } from "./EventSeatListHeading";
import { EventSeatOrderEditor } from "./EventSeatOrderEditor";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
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
    [joining, setJoining] = useState(false);
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
  if (order.editing)
    return (
      <div hidden={!active}>
        <EventSeatOrderEditor
          model={order}
          header={header}
          demonstratorUserId={table.demonstratorUserId}
        />
      </div>
    );
  return (
    <div className="space-y-3" hidden={!active}>
      {header}
      {table.canManage && table.eventStatus === "PLANNING" ? (
        <Button
          isIconOnly
          variant="primary"
          className="fixed right-6 bottom-6 z-40 size-14 rounded-full"
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
                  <GroupedRow key={item.key}>
                    <UserIdentity
                      name={formatUsername(item.username, item.name || t`You`)}
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
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-default">
                      <UserRoundPlus className="size-5 text-muted" aria-hidden />
                    </span>
                    <Button
                      className="min-h-11 min-w-0 flex-1 justify-start px-0"
                      variant="ghost"
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
                    >
                      {label}
                    </Button>
                  </GroupedRow>
                );
              }
              const row = item.user,
                own = row.userId === o.userId,
                name = formatUsername(
                  row.username,
                  own && (!row.name || row.name === o.userId) ? t`You` : (row.name ?? row.userId),
                );
              const pending = row.status === "PENDING";
              const roles = tableUserRoles({
                ...row,
                demonstrator: table.demonstratorUserId === row.userId,
              });
              const primary = roles[0];
              const status = primary
                ? i18n._(recordUserRoleMessages[primary])
                : pending && row.kind === "SELF"
                  ? t`Participation requested`
                  : t`Loading…`;
              return (
                <GroupedRow
                  key={item.key}
                  className="[contain-intrinsic-size:auto_4rem] [content-visibility:auto]"
                >
                  <UserIdentity
                    titleAccessory={
                      <NotificationItem
                        itemId={
                          own && pending
                            ? notificationItemId(table.id, "invitation", undefined, "table")
                            : undefined
                        }
                      />
                    }
                    name={name}
                    avatarUrl={row.avatarUrl}
                    secondary={status}
                    badge={<UserRoleBadge roles={roles} />}
                  />
                  <span className="flex shrink-0 items-center gap-1">
                    {own && table.canRespond && pending && table.myRegistration ? (
                      <EventTableInvitationActions
                        eventId={table.eventId}
                        registration={table.myRegistration}
                      />
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
                  </span>
                </GroupedRow>
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
    </div>
  );
}
