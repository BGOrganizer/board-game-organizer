"use client";
import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import {
  formatLocationAddress,
  matchParticipants,
  useEventTableContext,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, Dices, MapPin, Presentation, UsersRound } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventTableOverview({
  eventId,
  tableId,
  match,
}: {
  eventId: string;
  tableId: string;
  match?: MatchDetailResponse;
}) {
  const { t, i18n } = useLingui();
  const context = useEventTableContext(useCommunityApi(), eventId, tableId);
  const { event, table } = context;
  const date = new Intl.DateTimeFormat(i18n.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: event?.timeZone,
  });
  const start = table?.startsAt ?? match?.match.selectedDate;
  const end = table?.endsAt ?? match?.match.eventTable?.endsAt;
  const game = match?.games.find((game) => game.id === match.match.selectedGameId);
  const gameName = table?.gameName ?? game?.name;
  const image = table?.image ?? game?.thumbnail;
  const location = event?.location ?? match?.match.locations?.[0];
  const frozen =
    match && match.match.status !== "PLANNING" ? matchParticipants(match).length : undefined;
  const confirmed = table?.confirmedCount ?? frozen;
  const reserved = table?.reservedCount ?? frozen;
  const min = table?.minPlayers ?? match?.match.minPlayers;
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
      <GroupedList>
        <GroupedRow>
          <Clock3 aria-hidden className="size-5 shrink-0 text-default-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t`Start time`}</p>
            {start ? (
              <p>{date.format(new Date(start))}</p>
            ) : (
              <Skeleton className="h-5 w-40 rounded" />
            )}
          </div>
        </GroupedRow>
        <GroupedRow>
          <Clock3 aria-hidden className="size-5 shrink-0 text-default-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t`End time`}</p>
            {end ? <p>{date.format(new Date(end))}</p> : <Skeleton className="h-5 w-40 rounded" />}
          </div>
        </GroupedRow>
        <GroupedRow>
          <Dices aria-hidden className="size-5 shrink-0 text-default-500" />
          <div className="flex min-w-0 items-center gap-3">
            {gameName ? (
              <>
                <Avatar className="rounded-xl" style={{ width: 80, height: 80 }}>
                  <Avatar.Image
                    src={image ?? undefined}
                    alt={gameName}
                    className="object-contain"
                  />
                  <Avatar.Fallback>
                    <Dices className="size-8" />
                  </Avatar.Fallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t`Board games`}</p>
                  <p className="break-words">{gameName}</p>
                </div>
              </>
            ) : (
              <Skeleton className="h-20 w-64 rounded-xl" />
            )}
          </div>
        </GroupedRow>
        <GroupedRow>
          <MapPin aria-hidden className="size-5 shrink-0 text-default-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t`Location`}</p>
            {location ? (
              <>
                <p className="break-words">{location.name}</p>
                <p className="break-words text-sm text-default-500">
                  {formatLocationAddress(location.address)}
                </p>
              </>
            ) : (
              <Skeleton className="h-10 w-64 rounded" />
            )}
          </div>
        </GroupedRow>
        <GroupedRow>
          <UsersRound aria-hidden className="size-5 shrink-0 text-default-500" />
          <div>
            <p className="text-sm font-semibold">{t`Players`}</p>
            {min !== undefined && max !== undefined ? (
              <p>
                {min}–{max}
              </p>
            ) : (
              <Skeleton className="h-5 w-32 rounded" />
            )}
            {confirmed !== undefined && reserved !== undefined ? (
              <p className="text-sm text-default-500">
                {confirmed}/{max} {t`confirmed players`} · {reserved} {t`reserved places`}
              </p>
            ) : (
              <Skeleton className="h-5 w-64 rounded" />
            )}
          </div>
        </GroupedRow>
        {table?.demonstrator ? (
          <GroupedRow>
            <Presentation aria-hidden className="size-5 shrink-0 text-default-500" />
            <p>
              {t`Demonstrator`}: {table.demonstrator.username ?? t`Username unavailable`}
            </p>
          </GroupedRow>
        ) : null}
      </GroupedList>
      {!context.open && event ? (
        <p className="text-sm text-default-500">{t`Bookings are closed. Results can still be recorded.`}</p>
      ) : null}
    </div>
  );
}
