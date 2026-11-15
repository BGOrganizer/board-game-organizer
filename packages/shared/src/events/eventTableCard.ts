import type { BggSearchItem, PlannedTableResponse } from "@board-game-organizer/schemas";

/** Cached display facts only. Missing old projections stay unknown until ordinary reconciliation. */
export function tableCardDates(table: PlannedTableResponse) {
  const schedule = table.eventSchedule;
  const timeZone = schedule?.timeZone ?? schedule?.location?.timeZone;
  if (table.eventStatus !== "PLANNING") {
    if (!table.confirmed) return [];
    return timeZone ? [{ id: table.id, startsAt: table.confirmed.startsAt, timeZone }] : undefined;
  }
  if (table.groupType === "PUBLIC" && table.startsAt)
    return timeZone ? [{ id: table.id, startsAt: table.startsAt, timeZone }] : undefined;
  return schedule?.dates?.map((date) => ({
    id: date.id,
    startsAt: `${date.localStartsAt}Z`,
    // These are wall-time proposals; the viewer's device zone must not shift them.
    timeZone: "UTC",
  }));
}

export function tableCardLocations(table: PlannedTableResponse) {
  const schedule = table.eventSchedule;
  if (table.eventStatus === "PLANNING") return schedule?.locations;
  // A stale planning preview is not evidence of the chosen venue.
  if (!schedule || schedule.locationCount > 1) return undefined;
  if (schedule.locations)
    return schedule.locations.filter((location) => location.id === schedule.location?.id);
  return schedule.location ? [schedule.location] : [];
}

export function tableCardGames(
  table: PlannedTableResponse,
): Array<BggSearchItem & { durationMinutes?: number }> {
  const games =
    table.eventStatus === "PLANNING"
      ? table.gamesDetail
      : table.gamesDetail.filter((game) => game.id === table.confirmed?.gameId);
  return games.map((game) => {
    const durationMinutes = table.games.find(
      (option) => option.gameId === game.id,
    )?.durationMinutes;
    return durationMinutes === undefined ? game : { ...game, durationMinutes };
  });
}
