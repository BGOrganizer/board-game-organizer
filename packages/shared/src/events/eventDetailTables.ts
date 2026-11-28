import type { EventTableListOrder, PlannedTableResponse } from "@board-game-organizer/schemas";

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
    .map((table) => ({ table, name: title(table) }))
    .filter(({ name }) => name.toLocaleLowerCase(locale).includes(search))
    .sort((left, right) => {
      const comparison =
        order.sort === "name"
          ? collator.compare(left.name, right.name)
          : (left.table.seatedCount ?? 0) - (right.table.seatedCount ?? 0);
      return comparison * direction || left.table.order - right.table.order;
    })
    .map(({ table }) => table);
}
