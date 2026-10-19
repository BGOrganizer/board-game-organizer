"use client";
import {
  communityAccessDenied,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTable,
  useTableSeats,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, LogOut, Plus, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GameListRow } from "@/components/games/GameListRow";
import { ScoreIdentity } from "@/components/ratings/ScoreIdentity";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableCard } from "./EventTableCard";
import { EventVoteButtons } from "./EventVoteButtons";
export function EventTable({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    [pending, setPending] = useState(false),
    [confirm, setConfirm] = useState<{
      registrationId: string;
      version: number;
      action: "cancel" | "remove";
    } | null>(null),
    [error, setError] = useState(false),
    table =
      communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data,
    seats = useTableSeats(
      { ...o, enabled: o.enabled !== false && (!pending || table?.adminUserId === o.userId) },
      eventId,
      tableId,
      pending,
    );
  const closed = useEventCutoff(table?.bookingClosesAt, table?.groupType === "PUBLIC");
  if (!table)
    return q.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load table`}</p>
        <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
      </div>
    );
  const run = async (command: NonNullable<typeof confirm>) => {
    setError(false);
    try {
      await a.respond.mutateAsync({
        registrationId: command.registrationId,
        input: { action: command.action, version: command.version },
      });
      setConfirm(null);
    } catch {
      setError(true);
    }
  };
  const results =
      table.results?.entries.slice().sort((x, y) => (x.rank ?? Infinity) - (y.rank ?? Infinity)) ??
      [],
    canVote =
      table.eventStatus === "PLANNING" &&
      event.data?.status === "PLANNING" &&
      event.data.canVote &&
      !closed &&
      table.myRegistration?.status === "ACCEPTED",
    number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <Link href={`/events/${eventId}`} className="inline-flex items-center gap-2 text-accent">
        <ArrowLeft className="size-4" />
        {t`Back to event`}
      </Link>
      <EventTableCard table={table} />
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load complete table details`}</p>
          <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {table.canRegister && !closed ? (
          <Button
            isDisabled={a.busy}
            onPress={() => a.register.mutate(table.id)}
          >{t`Join table`}</Button>
        ) : null}
        {table.canLeave && !closed && table.myRegistration ? (
          <Button
            variant="danger-soft"
            isDisabled={a.busy}
            onPress={() =>
              setConfirm({
                registrationId: table.myRegistration!.id,
                version: table.myRegistration!.version,
                action: "cancel",
              })
            }
          >
            <LogOut className="size-4" />
            {t`Leave table`}
          </Button>
        ) : null}
        {table.canInvite && !closed ? (
          <Link
            href={`/events/${eventId}/tables/${tableId}/invite`}
            className="inline-flex items-center gap-2 text-accent"
          >
            <Plus className="size-4" />
            {t`Invite players`}
          </Link>
        ) : null}
      </div>
      {table.startsAt ? (
        <div className="space-y-1">
          <DateTimeInfo
            startsAt={table.startsAt}
            endsAt={table.confirmed?.endsAt}
            timeZone={event.data?.timeZone}
          />
          <p>
            {t`Duration`}:{" "}
            {(table.confirmed
              ? table.games.find((game) => game.gameId === table.confirmed!.gameId)?.durationMinutes
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
        {table.gamesDetail
          .filter((game) => !table.confirmed || table.confirmed.gameId === game.id)
          .map((game) => (
            <div
              key={game.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-default-100 p-3"
            >
              <GameListRow
                name={game.name}
                imageUrl={game.imageUrl}
                year={game.year}
                average={game.average}
                rank={game.rank}
              />
              {canVote ? (
                <EventVoteButtons
                  label={game.name}
                  value={table.myRegistration?.gameVotes[String(game.id)]}
                  busy={a.busy}
                  onChange={(vote) =>
                    a.vote.mutate({ kind: "game", tableId, gameId: game.id, vote })
                  }
                />
              ) : null}
            </div>
          ))}
      </section>
      {table.eventStatus === "TERMINATED" ? (
        <section className="space-y-3" aria-label={t`Results`}>
          <h2 className="font-semibold">{t`Results`}</h2>
          {results.map((row) => {
            const profile = table.resultProfiles?.find((p) => p.userId === row.userId),
              rating = table.ratingChanges.find((p) => p.userId === row.userId),
              groupRating = table.groupRatingChanges?.find((p) => p.userId === row.userId);
            return (
              <div
                key={row.userId}
                className="flex items-center gap-3 rounded-xl bg-default-100 p-3"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  {profile ? (
                    <div className="flex items-center gap-3">
                      <ScoreIdentity player={{ id: row.userId, ...profile }} rank={row.rank} />
                    </div>
                  ) : (
                    <Skeleton className="h-10 w-48 rounded-lg" />
                  )}
                  <p>
                    {t`Score`}: {row.score ?? t`ND`}
                  </p>
                  {rating ? (
                    <p>
                      {t`Global rating change`}: {rating.delta > 0 ? "+" : ""}
                      {number.format(rating.delta)}
                    </p>
                  ) : null}
                  {groupRating ? (
                    <p>
                      {t`Group rating change`}: {groupRating.delta > 0 ? "+" : ""}
                      {number.format(groupRating.delta)}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="space-y-3" aria-label={t`Seats`}>
          <h2 className="font-semibold">{t`Seats`}</h2>
          {table.adminUserId === o.userId ? (
            <div className="flex gap-2">
              <Button
                variant={pending ? "ghost" : "primary"}
                onPress={() => setPending(false)}
              >{t`Accepted`}</Button>
              <Button
                variant={pending ? "primary" : "ghost"}
                onPress={() => setPending(true)}
              >{t`Pending invitations`}</Button>
            </div>
          ) : null}
          {seats.items.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-xl bg-default-100 p-3">
              <Avatar>
                <Avatar.Image src={row.avatarUrl ?? undefined} alt="" />
                <Avatar.Fallback>{(row.name ?? row.userId).charAt(0)}</Avatar.Fallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p>{row.name ?? row.userId}</p>
                <p className="text-sm text-default-500">
                  {table.eventStatus === "CONFIRMED"
                    ? row.email
                    : row.position === "WAITING"
                      ? t`Waiting list`
                      : row.status === "PENDING"
                        ? t`Invitation pending`
                        : t`Reserved place`}
                </p>
              </div>
              {table.canInvite && !closed && row.userId !== o.userId ? (
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  aria-label={`${t`Remove player`}: ${row.name ?? row.userId}`}
                  isDisabled={a.busy}
                  onPress={() =>
                    setConfirm({ registrationId: row.id, version: row.version, action: "remove" })
                  }
                >
                  <UserRoundX className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {seats.isPending ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : !seats.isError && !seats.items.length ? (
            <p>{t`No players found`}</p>
          ) : null}
          {seats.isError ? (
            <div role="alert">
              <p className="text-danger">{t`Could not load players`}</p>
              <Button onPress={() => void seats.refetch()}>{t`Try again`}</Button>
            </div>
          ) : null}
          {seats.hasNextPage ? (
            <Button
              isDisabled={seats.isFetchingNextPage}
              onPress={() => void seats.fetchNextPage()}
            >{t`Load more`}</Button>
          ) : null}
        </section>
      )}
      {confirm ? (
        <ContactConfirmDialog
          title={confirm.action === "cancel" ? t`Leave table` : t`Remove player`}
          description={t`This removes the active table registration.`}
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={[{ label: t`Confirm`, variant: "danger", onPress: () => void run(confirm) }]}
        >
          {error ? (
            <p role="alert" className="text-danger">{t`Could not update table registration`}</p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
    </div>
  );
}
