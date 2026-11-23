import { tableTitle } from "@board-game-organizer/shared";
import { useCallback } from "react";
import { useT } from "@/lib/i18n";

export function useTableTitle() {
  const label = useT()("Table");
  return useCallback(
    (table: Parameters<typeof tableTitle>[0]) =>
      tableTitle(table, (number) => (number === undefined ? label : `${label} #${number}`)),
    [label],
  );
}
