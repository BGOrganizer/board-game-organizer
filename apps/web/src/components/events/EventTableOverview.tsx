"use client";
import type { TableSeatResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  hasOtherAcceptedTable,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { GameListRow } from "@/components/games/GameListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableInfo } from "./EventTableInfo";
import { EventTableSeats } from "./EventTableSeats";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteCounts } from "./EventVoteCounts";
export function EventTableOverview({
  eventId,
  tableId,
  context = "personal",
}: {
  eventId: string;
  tableId: string;
  context?: "personal" | "event";
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId);
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
      closed ||
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
  const confirmed = table.confirmed;
  const gameVotes = table.myRegistration?.gameVotes ?? {};
  const canVote =
    table.eventStatus === "PLANNING" &&
    event.data?.status === "PLANNING" &&
    event.data.canVote &&
    !closed &&
    table.myRegistration?.status === "ACCEPTED";
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <EventTableInfo table={table} />
      {context === "personal" ? (
        <section className="space-y-2" aria-label={t`Event`}>
          <h2 className="font-semibold">{t`Event`}</h2>
          <LinkedListCard
            href={`/events/${table.eventId}`}
            label={`${t`Open event`}: ${table.eventName}`}
          >
            <AnimatedDicebearArtwork seed={table.eventId} variant="constellation" size={40} />
            <span className="min-w-0 self-center break-words font-medium">{table.eventName}</span>
          </LinkedListCard>
        </section>
      ) : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load complete table details`}</p>
          <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {event.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load event`}</p>
          <Button onPress={() => void event.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {table.startsAt ? (
        <div className="space-y-1">
          <DateTimeInfo
            startsAt={table.startsAt}
            endsAt={table.confirmed?.endsAt}
            timeZone={event.data?.timeZone}
          />
          <p>
            {t`Duration`}:{" "}
            {(confirmed
              ? table.games.find((game) => game.gameId === confirmed.gameId)?.durationMinutes
              : undefined) ??
              Math.max(0, ...table.games.map((game) => game.durationMinutes ?? 0))}{" "}
            {t`minutes`}
          </p>
        </div>
      ) : null}
      {table.demonstratorUserId ? (
        <p>
          {t`Demonstrator`}: {table.demonstratorName ?? t`Unknown`}
        </p>
      ) : null}
      <section className="space-y-3" aria-label={t`Board games`}>
        <h2 className="font-semibold">{t`Board games`}</h2>
        <GroupedList>
          {table.gamesDetail
            .filter(
              (game) =>
                table.eventStatus === "PLANNING" ||
                !table.confirmed ||
                table.confirmed.gameId === game.id,
            )
            .map((game) => (
              <GameListRow
                key={game.id}
                name={game.name}
                imageUrl={game.imageUrl}
                year={game.year}
                average={game.average}
                rank={game.rank}
                metadata={
                  <EventVoteCounts
                    label={game.name}
                    counts={table.gameVoteCounts?.[String(game.id)]}
                  />
                }
                actions={
                  canVote ? (
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
                  ) : undefined
                }
              />
            ))}
        </GroupedList>
      </section>
      <EventTableSeats
        key={table.id}
        table={table}
        hasJoinedEvent={
          event.data?.myRegistrations
            ? hasOtherAcceptedTable(event.data.myRegistrations, table.id)
            : undefined
        }
        onRemove={(row, own) =>
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
          })
        }
      />
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
