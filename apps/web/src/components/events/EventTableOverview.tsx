"use client";
import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { matchParticipants, useEventTableContext } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Armchair,
  CalendarDays,
  Gamepad2,
  LockKeyhole,
  Presentation,
  UsersRound,
} from "lucide-react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { InfoSection as TableSection } from "@/components/common/ui/InfoSection";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { GameListRow } from "@/components/games/GameListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableHeading } from "./EventTableHeading";

export function EventTableOverview({
  eventId,
  tableId,
  match,
}: {
  eventId: string;
  tableId: string;
  match?: MatchDetailResponse;
}) {
  const { t } = useLingui();
  const context = useEventTableContext(useCommunityApi(), eventId, tableId);
  const { event, table } = context;
  const start = table?.startsAt ?? match?.match.selectedDate;
  const end = table?.endsAt ?? match?.match.eventTable?.endsAt;
  const game = match?.games.find((game) => game.id === match.match.selectedGameId);
  const gameName = table?.gameName ?? game?.name;
  const frozen =
    match && match.match.status !== "PLANNING" ? matchParticipants(match).length : undefined;
  const confirmed = table?.confirmedCount ?? frozen;
  const reserved = table?.reservedCount ?? frozen;
  const max = table?.maxPlayers ?? match?.match.maxPlayers;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <EventTableHeading
          name={table?.name ?? match?.match.eventTable?.tableName ?? t`Table details`}
          ratingsEnabled={table?.openSkill ?? match?.match.eventTable?.openSkill ?? false}
        />
        {confirmed !== undefined && max !== undefined && reserved !== undefined ? (
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <UsersRound className="size-4 text-default-500" aria-hidden />
              <span className="sr-only">{t`confirmed players`}: </span>
              {confirmed}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Armchair className="size-4 text-default-500" aria-hidden />
              <span className="sr-only">{t`Maximum players`}: </span>
              {max}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <LockKeyhole className="size-4 text-default-500" aria-hidden />
              <span className="sr-only">{t`reserved places`}: </span>
              {reserved}
            </span>
          </div>
        ) : (
          <Skeleton className="h-5 w-64 rounded" />
        )}
      </div>
      {context.eventQuery.error || context.tableQuery.error ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load table`}</p>
          <Button
            variant="secondary"
            onPress={() => {
              void context.eventQuery.refetch();
              if (event) void context.tableQuery.refetch();
            }}
          >{t`Retry`}</Button>
        </div>
      ) : null}
      <TableSection
        label={t`Date and time`}
        helpLabel={t`Date and time help`}
        help={t`The event day and this table's start and end times are fixed. There is no voting.`}
        icon={CalendarDays}
      >
        <GroupedRow>
          {start ? (
            <DateTimeInfo startsAt={start} endsAt={end} timeZone={event?.timeZone} />
          ) : (
            <Skeleton className="h-5 w-64 rounded" />
          )}
        </GroupedRow>
      </TableSection>
      <TableSection
        label={t`Board games`}
        helpLabel={t`Table game help`}
        help={t`This table's game is fixed. The cover, BoardGameGeek rating and rank describe the selected game, not player ratings.`}
        icon={Gamepad2}
      >
        {gameName ? (
          <GameListRow
            name={gameName}
            imageUrl={table?.image ?? game?.thumbnail}
            year={table?.yearPublished ?? game?.yearPublished}
            average={table?.average ?? game?.average}
            rank={table?.rank ?? game?.rank}
          />
        ) : (
          <GroupedRow>
            <Skeleton className="h-20 w-64 rounded-xl" />
          </GroupedRow>
        )}
      </TableSection>
      {table?.demonstrator ? (
        <TableSection
          label={t`Demonstrator`}
          helpLabel={t`Demonstrator help`}
          help={t`The demonstrator explains the game and can record this table's results. This role does not automatically reserve a player seat.`}
          icon={Presentation}
        >
          <GroupedRow>
            <UserIdentity
              name={
                table.demonstrator.name || table.demonstrator.username || t`Username unavailable`
              }
              secondary={table.demonstrator.username ?? t`Username unavailable`}
              avatarUrl={table.demonstrator.avatarUrl}
            />
          </GroupedRow>
        </TableSection>
      ) : null}
      {!context.open && event ? (
        <p className="text-sm text-default-500">{t`Bookings are closed. Results can still be recorded.`}</p>
      ) : null}
    </div>
  );
}
