"use client";
import { notificationItemId, type TableSeatResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  eventOptionsRequireVote,
  hasOtherAcceptedTable,
  tableCardGames,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useNotificationAttentionContext,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { GameListRow } from "@/components/games/GameListRow";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventCard } from "./EventCard";
import { EventProposalSection } from "./EventProposalSection";
import { EventTableScheduleCard } from "./EventTableScheduleCard";
import { EventTableSeats } from "./EventTableSeats";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteCounts } from "./EventVoteCounts";
export function EventTableOverview({
  eventId,
  tableId,
  context = "personal",
  section = "overview",
}: {
  eventId: string;
  tableId: string;
  context?: "personal" | "event";
  section?: "overview" | "participants";
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    attention = useNotificationAttentionContext();
  const [confirm, setConfirm] = useState<{
    registrationId: string;
    version: number;
    action: "cancel" | "remove";
    person: Pick<TableSeatResponse, "userId" | "name" | "username" | "avatarUrl">;
  } | null>(null);
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  const closed = useEventCutoff(table?.bookingClosesAt, table?.groupType === "PUBLIC");
  if (!table)
    return q.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load table`}</p>
        <Button
          onPress={() => {
            void q.refetch();
            void event.refetch();
          }}
        >{t`Try again`}</Button>
      </div>
    );
  const run = (command: NonNullable<typeof confirm>) => {
    if (
      (command.action === "cancel" && closed) ||
      table.eventStatus !== "PLANNING" ||
      a.blocking ||
      a.isResponding(command.registrationId) ||
      (command.action === "remove"
        ? !table.canInvite
        : !table.canLeave || table.myRegistration?.id !== command.registrationId)
    )
      return;
    a.respond.mutate({
      tableId,
      registrationId: command.registrationId,
      person: command.person,
      input: { action: command.action, version: command.version },
    });
    setConfirm(null);
  };
  const gameVotes = table.myRegistration?.gameVotes ?? {};
  const votableGames = eventOptionsRequireVote(table.games);
  const canVote =
    votableGames &&
    table.eventStatus === "PLANNING" &&
    event.data?.status === "PLANNING" &&
    event.data.canVote &&
    table.myRegistration?.status === "ACCEPTED";
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <div hidden={section === "participants"} className="space-y-5">
        <EventTableScheduleCard
          table={table}
          timeZone={event.data?.timeZone ?? table.eventSchedule?.location?.timeZone}
        />
        {context === "personal" ? (
          <section className="space-y-2" aria-label={t`Event`}>
            <h2 className="font-semibold">{t`Event`}</h2>
            {event.data?.id === table.eventId &&
            typeof event.data.tableCount === "number" &&
            Array.isArray(event.data.myRegistrations) ? (
              <EventCard event={event.data} />
            ) : (
              <LinkedListCard
                artworkLayout="cover"
                href={`/events/${table.eventId}`}
                notificationCount={attention?.get({ kind: "event", id: table.eventId })?.count}
                label={`${t`Open event`}: ${table.eventName}`}
                artwork={
                  <AnimatedDicebearArtwork
                    seed={table.eventId}
                    variant="constellation"
                    presentation="cover"
                  />
                }
              >
                <span className="flex min-w-0 flex-1 self-center items-center gap-2">
                  <span className="min-w-0 truncate font-medium">{table.eventName}</span>
                  <NotificationUnreadDot
                    active={Boolean(attention?.get({ kind: "event", id: table.eventId })?.count)}
                  />
                </span>
                <Skeleton className="h-4 w-28 rounded" />
              </LinkedListCard>
            )}
          </section>
        ) : null}
        {q.isError ? (
          <div role="alert">
            <p className="text-danger">{t`Could not load complete table details`}</p>
            <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
          </div>
        ) : null}
        <section className="space-y-3" aria-label={t`Board games`}>
          <NotificationItem itemId={notificationItemId(table.id, "games")} readOnly>
            <h2 className="font-semibold">{t`Board games`}</h2>
          </NotificationItem>
          <GroupedList>
            {tableCardGames(table).map((game) => (
              <GameListRow
                key={game.id}
                name={game.name}
                imageUrl={game.imageUrl}
                year={game.year}
                titleAccessory={
                  <NotificationItem
                    itemId={notificationItemId(table.id, "game", game.id)}
                    readOnly={!canVote}
                  />
                }
                average={game.average}
                rank={game.rank}
                durationMinutes={game.durationMinutes}
                metadata={
                  votableGames ? (
                    <EventVoteCounts
                      label={game.name}
                      counts={table.gameVoteCounts?.[String(game.id)]}
                    />
                  ) : undefined
                }
                actions={
                  <>
                    {canVote ? (
                      <EventVoteButtons
                        label={game.name}
                        value={gameVotes[String(game.id)]}
                        disabledVotes={
                          eventAvailabilityVoteIsAllowed(
                            table.games.map((row) => ({ id: String(row.gameId) })),
                            gameVotes,
                            String(game.id),
                            "NO",
                          )
                            ? []
                            : ["NO"]
                        }
                        busy={a.blocking || q.isPlaceholderData || event.isPlaceholderData}
                        onChange={(vote) =>
                          a.vote.mutate({ kind: "game", tableId, gameId: game.id, vote })
                        }
                      />
                    ) : undefined}
                  </>
                }
              />
            ))}
          </GroupedList>
          {event.data ? (
            <EventProposalSection
              event={event.data}
              kind="game"
              table={table}
              disabled={q.isPlaceholderData || event.isPlaceholderData}
            />
          ) : null}
        </section>
      </div>
      {event.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load event`}</p>
          <Button onPress={() => void event.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {!table.sharedResultsOnly && (
        <EventTableSeats
          key={table.id}
          table={table}
          active={section === "participants"}
          hasJoinedEvent={
            event.data?.myRegistrations
              ? hasOtherAcceptedTable(event.data.myRegistrations, table.id)
              : undefined
          }
          onRemove={(row, own) => {
            setConfirm({
              registrationId: row.id,
              version: row.version,
              action: own ? "cancel" : "remove",
              person: {
                userId: row.userId,
                name: row.name,
                username: row.username,
                avatarUrl: row.avatarUrl,
              },
            });
          }}
        />
      )}
      {confirm ? (
        <ContactConfirmDialog
          title={confirm.action === "cancel" ? t`Leave table` : t`Remove player`}
          description={t`This removes the active table registration.`}
          busy={a.blocking || a.isResponding(confirm.registrationId)}
          onCancel={() => setConfirm(null)}
          actions={[{ label: t`Confirm`, variant: "danger", onPress: () => void run(confirm) }]}
        />
      ) : null}
    </div>
  );
}
