"use client";

import type { ComponentProps } from "react";
import { GameListRow } from "@/components/games/GameListRow";
import { EventTableGamesPopoverView } from "./EventTableGamesPopoverView";

/** Visible rows can load missing BGG details in the web client. */
export function EventTableGamesPopover(
  props: Omit<ComponentProps<typeof EventTableGamesPopoverView>, "renderGameRow">,
) {
  return (
    <EventTableGamesPopoverView
      {...props}
      renderGameRow={(game) => (
        <GameListRow game={game} name={game.name} imageUrl={game.imageUrl} />
      )}
    />
  );
}
