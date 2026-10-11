"use client";
import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { matchParticipants, useEventTableContext } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Gamepad2, type LucideIcon, MapPin, Presentation } from "lucide-react";
import type { ReactNode } from "react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";

function TableSection({
  label,
  helpLabel,
  help,
  icon: Icon,
  children,
}: {
  label: string;
  helpLabel: string;
  help: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2" aria-label={label}>
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4" aria-hidden />
          {label}
        </h2>
        <HelpPopover label={helpLabel} title={label}>
          {help}
        </HelpPopover>
      </div>
      <GroupedList>{children}</GroupedList>
    </section>
  );
}

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
  const location = event?.location ?? match?.match.locations?.[0];
  const frozen =
    match && match.match.status !== "PLANNING" ? matchParticipants(match).length : undefined;
  const confirmed = table?.confirmedCount ?? frozen;
  const reserved = table?.reservedCount ?? frozen;
  const max = table?.maxPlayers ?? match?.match.maxPlayers;
  return (
    <div className="space-y-4">
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
        label={t`Location`}
        helpLabel={t`Table location help`}
        help={t`This table uses the event's verified venue and address. There is no location voting.`}
        icon={MapPin}
      >
        {location ? (
          <LocationListRow name={location.name} address={location.address} />
        ) : (
          <GroupedRow>
            <Skeleton className="h-10 w-64 rounded" />
          </GroupedRow>
        )}
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
      {confirmed !== undefined && reserved !== undefined ? (
        <p className="text-sm text-default-500">
          {confirmed}/{max} {t`confirmed players`} · {reserved} {t`reserved places`}
        </p>
      ) : (
        <Skeleton className="h-5 w-64 rounded" />
      )}
      {table?.demonstrator ? (
        <p className="flex items-center gap-2 text-sm">
          <Presentation className="size-4 text-default-500" aria-hidden />
          {t`Demonstrator`}: {table.demonstrator.username ?? t`Username unavailable`}
        </p>
      ) : null}
      {!context.open && event ? (
        <p className="text-sm text-default-500">{t`Bookings are closed. Results can still be recorded.`}</p>
      ) : null}
    </div>
  );
}
