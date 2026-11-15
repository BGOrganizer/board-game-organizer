import type { ComponentProps } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GameListRow } from "./GameListRow";

export function GameListCard(props: ComponentProps<typeof GameListRow>) {
  return (
    <GroupedList>
      <GameListRow {...props} />
    </GroupedList>
  );
}
