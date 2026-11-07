import {
  type EventRecord,
  type NotificationAttentionTarget,
  type NotificationItem,
  notificationItemId,
  type TableRecord,
} from "@board-game-organizer/schemas";
import { eventDateWall } from "../events/eventRecordPolicy";

export function eventItemTargets(
  event: Pick<EventRecord, "id" | "dates" | "locations">,
): NotificationAttentionTarget[] {
  return [
    ...event.dates.map((row) => notificationItemId(event.id, "date", row.id)),
    ...event.locations.map((row) => notificationItemId(event.id, "location", row.id)),
    ...(["overview", "dates", "locations", "tables"] as const).map((field) =>
      notificationItemId(event.id, field),
    ),
  ].map((id) => ({ kind: "item", id }));
}
export function tableItemTargets(
  table: Pick<TableRecord, "id" | "games">,
): NotificationAttentionTarget[] {
  return [
    ...table.games.map((row) => notificationItemId(table.id, "game", row.gameId)),
    ...(["overview", "games", "invitation"] as const).map((field) =>
      notificationItemId(table.id, field, undefined, "table"),
    ),
  ].map((id) => ({ kind: "item", id }));
}

/** Immutable formatting/identity references only; no notification copy is parsed to recover changes. */
export function eventNotificationItems(
  before: EventRecord,
  after: EventRecord,
  oldTables: readonly TableRecord[],
  tables: readonly TableRecord[],
): NotificationItem[] {
  const items = new Map<string, NotificationItem>();
  const add = (
    scope: string,
    field: Parameters<typeof notificationItemId>[1],
    option: string | number | undefined,
    tableIds: string[],
    resource?: Parameters<typeof notificationItemId>[3],
  ) => {
    const id = notificationItemId(scope, field, option, resource);
    items.set(id, {
      id,
      revision: after.version,
      sectionId: ["date", "location", "game"].includes(field)
        ? notificationItemId(
            scope,
            field === "date" ? "dates" : field === "location" ? "locations" : "games",
          )
        : id,
      eventId: after.id,
      ...(after.groupId ? { groupId: after.groupId } : {}),
      tableIds,
    });
  };
  const ids = tables.map((table) => table.id);
  for (const row of after.dates) {
    const old = before.dates.find((value) => value.id === row.id);
    if (
      !old ||
      eventDateWall(before, old) !== eventDateWall(after, row) ||
      before.timeZone !== after.timeZone
    )
      add(after.id, "date", row.id, ids);
  }
  if (before.dates.some((row) => !after.dates.some((value) => value.id === row.id)))
    add(after.id, "dates", undefined, ids);
  for (const row of after.locations) {
    const old = before.locations.find((value) => value.id === row.id);
    if (
      !old ||
      old.name !== row.name ||
      old.address !== row.address ||
      old.latitude !== row.latitude ||
      old.longitude !== row.longitude ||
      old.timeZone !== row.timeZone
    )
      add(after.id, "location", row.id, ids);
  }
  if (before.locations.some((row) => !after.locations.some((value) => value.id === row.id)))
    add(after.id, "locations", undefined, ids);
  for (const table of tables) {
    const old = oldTables.find((row) => row.id === table.id);
    for (const game of table.games) {
      const previous = old?.games.find((row) => row.gameId === game.gameId);
      if (!previous || previous.durationMinutes !== game.durationMinutes)
        add(table.id, "game", game.gameId, [table.id]);
    }
    if (old?.games.some((row) => !table.games.some((value) => value.gameId === row.gameId)))
      add(table.id, "games", undefined, [table.id]);
    if (
      !old ||
      old.name !== table.name ||
      old.minPlayers !== table.minPlayers ||
      old.maxPlayers !== table.maxPlayers ||
      old.startsAt !== table.startsAt ||
      old.demonstratorUserId !== table.demonstratorUserId ||
      old.rankingEnabled !== table.rankingEnabled
    )
      add(table.id, "overview", undefined, [table.id], "table");
  }
  if (oldTables.some((row) => !tables.some((value) => value.id === row.id)))
    add(after.id, "tables", undefined, ids);
  if (
    before.name !== after.name ||
    before.endsAt !== after.endsAt ||
    before.bookingClosesAt !== after.bookingClosesAt
  )
    add(after.id, "overview", undefined, ids);
  return [...items.values()];
}

export function removedNotificationItems(
  before: EventRecord,
  after: EventRecord,
  oldTables: readonly TableRecord[],
  tables: readonly TableRecord[],
) {
  const sections = eventNotificationItems(before, after, oldTables, tables);
  const changes: { from: string; to: NotificationItem }[] = [];
  for (const field of ["date", "location"] as const) {
    const section = sections.find(
      (item) => item.id === notificationItemId(after.id, field === "date" ? "dates" : "locations"),
    );
    const old = field === "date" ? before.dates : before.locations;
    const current = field === "date" ? after.dates : after.locations;
    if (section)
      for (const item of old)
        if (!current.some((row) => row.id === item.id))
          changes.push({ from: notificationItemId(before.id, field, item.id), to: section });
  }
  for (const old of oldTables) {
    const current = tables.find((row) => row.id === old.id);
    if (!current) {
      const removed = sections.find((item) => item.id === notificationItemId(after.id, "tables"));
      if (removed)
        for (const from of [
          ...old.games.map((game) => notificationItemId(old.id, "game", game.gameId)),
          notificationItemId(old.id, "games"),
          notificationItemId(old.id, "overview", undefined, "table"),
        ])
          changes.push({ from, to: removed });
      continue;
    }
    const section = sections.find((item) => item.id === notificationItemId(old.id, "games"));
    if (current && section)
      for (const game of old.games)
        if (!current.games.some((row) => row.gameId === game.gameId))
          changes.push({ from: notificationItemId(old.id, "game", game.gameId), to: section });
  }
  return changes;
}
