import type { MatchResponse } from "@board-game-organizer/schemas";

export type MatchCardStatus = MatchResponse["status"] | "IN_PROGRESS" | "CANCELLED";

export const matchCardStatusColor: Record<
  MatchCardStatus,
  "warning" | "success" | "accent" | "default" | "danger"
> = {
  PLANNING: "warning",
  CREATED: "success",
  IN_PROGRESS: "accent",
  TERMINATED: "default",
  CANCELLED: "danger",
};

export function formatMatchDateTime(iso: string, locale: string) {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "2-digit" }),
    time: date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
  };
}

export function matchCardData(match: MatchResponse, now = Date.now()) {
  const planning = match.status === "PLANNING";
  const dates = planning || !match.selectedDate ? match.dates : [match.selectedDate];
  const future = dates.filter((date) => Date.parse(date) >= now);
  const date = (future.length ? future : dates)
    .slice()
    .sort((a, b) => (future.length ? 1 : -1) * (Date.parse(a) - Date.parse(b)))[0];
  const locations = match.locations ?? [];
  const location = planning
    ? locations[0]
    : (locations.find((candidate) => candidate.id === match.selectedLocationId) ?? locations[0]);
  return {
    date,
    additionalDates: Math.max(0, dates.length - 1),
    location,
    additionalLocations: planning ? Math.max(0, locations.length - 1) : 0,
    players: match.eventTable
      ? match.invitations.filter((invitation) => invitation.status === "ACCEPTED").length
      : planning
        ? match.minPlayers
        : 1 + match.invitations.filter((invitation) => invitation.status === "ACCEPTED").length,
    maxPlayers: match.maxPlayers,
    gameCount: planning ? match.gameIds.length : undefined,
    selectedGameName: planning ? undefined : match.selectedGameName,
    winnerNames: match.status === "TERMINATED" ? match.winnerNames : undefined,
  };
}
