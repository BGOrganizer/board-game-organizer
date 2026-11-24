import type { BggSearchItem } from "@board-game-organizer/schemas";
import type { ReactNode } from "react";
import type { CardNavigation } from "@/components/common/ui/LinkedListCardLayout";
import { EventCardView } from "@/components/events/EventCardView";
import { EventTableCardIndicatorView } from "@/components/events/EventTableCardIndicatorView";
import { EventTableCardView } from "@/components/events/EventTableCardView";
import { EventTableGamesPopoverView } from "@/components/events/EventTableGamesPopoverView";
import { GroupCardView } from "@/components/groups/GroupCardView";
import type { RecordResultRow } from "./RecordResults";

export function RecordResultCard({
  row,
  renderNavigation,
  renderGameRow,
  viewerUserId,
  groupContext,
  eventContext,
  moderation,
}: {
  row: RecordResultRow;
  renderNavigation: CardNavigation;
  renderGameRow: (game: BggSearchItem) => ReactNode;
  viewerUserId?: string;
  groupContext?: boolean;
  eventContext?: boolean;
  moderation?: boolean;
}) {
  switch (row.kind) {
    case "event":
      return (
        <EventCardView
          event={row.data}
          context={groupContext ? "group" : "personal"}
          renderNavigation={renderNavigation}
        />
      );
    case "table":
      return (
        <EventTableCardView
          table={row.data}
          context={eventContext ? "event" : "personal"}
          renderNavigation={renderNavigation}
          indicators={
            <EventTableCardIndicatorView
              table={row.data}
              userId={viewerUserId}
              renderGames={(props) => (
                <EventTableGamesPopoverView {...props} renderGameRow={renderGameRow} />
              )}
            />
          }
        />
      );
    case "group":
      return (
        <GroupCardView
          group={row.data}
          href={moderation ? `/moderation/${row.data.id}` : undefined}
          renderNavigation={renderNavigation}
        />
      );
  }
}
