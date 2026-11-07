"use client";
import type { EventProposalResponse } from "@board-game-organizer/schemas";
import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameListRow } from "@/components/games/GameListRow";

export function EventProposalItem({
  row,
  children,
  actions,
  authorNames,
}: {
  row: EventProposalResponse;
  authorNames?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div data-testid={`event-proposal-${row.id}`}>
      {row.payload.kind === "game" ? (
        <GameListRow
          name={row.game?.name ?? row.label}
          imageUrl={row.game?.imageUrl}
          titleAccessory={
            authorNames ? (
              <span className="min-w-0 truncate text-sm text-muted" title={authorNames}>
                {authorNames}
              </span>
            ) : undefined
          }
          actions={actions}
        >
          {children}
        </GameListRow>
      ) : (
        <GroupedRow>
          {row.payload.kind === "location" ? (
            <MapPin className="size-5 shrink-0 text-muted" aria-hidden />
          ) : null}
          <div className="min-w-0 flex-1 space-y-1">
            {row.payload.kind === "date" ? (
              <DateTimeInfo
                startsAt={`${row.payload.day}T${row.payload.startTime}:00Z`}
                timeZone="UTC"
                dateStyle="medium"
              />
            ) : (
              <>
                <p className="break-words font-medium">{row.payload.location.name}</p>
                <p className="break-words text-sm text-muted">{row.payload.location.address}</p>
              </>
            )}
            {children}
          </div>
          {actions}
        </GroupedRow>
      )}
    </div>
  );
}
