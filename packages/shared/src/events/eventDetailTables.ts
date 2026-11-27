import type { EventTableListOrder, PlannedTableResponse } from "@board-game-organizer/schemas";

function tableStart(table: PlannedTableResponse) {
  if (table.eventStatus !== "PLANNING") return table.confirmed?.startsAt;
  if (table.groupType === "PUBLIC") return table.startsAt ?? undefined;
  return table.eventSchedule?.dates?.reduce<string | undefined>((earliest, option) => {
    const start = option.localStartsAt;
    return earliest === undefined || start < earliest ? start : earliest;
  }, undefined);
}

/** Event detail lists contain at most 20 active tables, delivered on the first authorized page. */
export function filterEventDetailTables(
  tables: readonly PlannedTableResponse[],
  query: string,
  order: EventTableListOrder,
  title: (table: PlannedTableResponse) => string,
  locale: string,
) {
  const search = query.toLocaleLowerCase(locale);
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const direction = order.direction === "asc" ? 1 : -1;
  return tables
    .map((table) => ({ table, name: title(table), start: tableStart(table) }))
    .filter(({ name }) => name.toLocaleLowerCase(locale).includes(search))
    .sort((left, right) => {
      let comparison = 0;
      switch (order.sort) {
        case "name":
          comparison = collator.compare(left.name, right.name);
          break;
        case "date": {
          if (left.start === undefined && right.start !== undefined) return 1;
          if (left.start !== undefined && right.start === undefined) return -1;
          comparison = (left.start ?? "").localeCompare(right.start ?? "");
          break;
        }
        case "participants":
          comparison = (left.table.seatedCount ?? 0) - (right.table.seatedCount ?? 0);
          break;
      }
      return comparison * direction || left.table.order - right.table.order;
    })
    .map(({ table }) => table);
}
