"use client";
import type { ComponentProps } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GameListRow } from "./GameListRow";

export function GameListCard(props: ComponentProps<typeof GameListRow>) {
  return (
    <GroupedList className="min-w-0 w-full flex-1">
      <GameListRow {...props} />
    </GroupedList>
  );
}
