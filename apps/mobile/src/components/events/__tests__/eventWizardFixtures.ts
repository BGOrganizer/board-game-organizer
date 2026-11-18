import type { MatchLocation } from "@board-game-organizer/schemas";
import {
  type EventRecordDraft,
  type EventTableDraft,
  eventDraft,
} from "@board-game-organizer/shared";

export const wizardVenue: MatchLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Games club",
  address: "Via Roma 1, Rome, Italy",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};

export function tableDraftFixture(change: Partial<EventTableDraft> = {}): EventTableDraft {
  return {
    key: "local-table-key",
    name: "Strategy table",
    minPlayers: 2,
    maxPlayers: 4,
    rankingEnabled: false,
    startsWall: "2030-05-02T20:00",
    games: [
      {
        id: 1,
        name: "First strategy game",
        year: 2020,
        imageUrl: null,
        minPlayers: 2,
        maxPlayers: 4,
        durationMinutes: 60,
      },
    ],
    ...change,
  };
}

export function eventDraftFixture(change: Partial<EventRecordDraft> = {}): EventRecordDraft {
  return {
    ...eventDraft(),
    name: "Spring games evening",
    groupId: "group-private",
    timeZone: "Europe/Rome",
    planningMode: "ASSISTED",
    playerPreference: "MORE_PLAYERS",
    startTime: "20:00",
    endsWall: "2030-05-02T23:00",
    cutoffWall: "2030-05-01T18:00",
    dates: [
      { id: "date-one", day: "2030-05-02" },
      { id: "date-two", day: "2030-05-03", startTime: "18:30" },
    ],
    locations: [wizardVenue],
    tables: [tableDraftFixture()],
    ...change,
  };
}
