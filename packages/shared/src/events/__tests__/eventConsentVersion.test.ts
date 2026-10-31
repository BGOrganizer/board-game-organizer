import type { JoinTableInput } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { captureEventConsent, rebaseEventConsent } from "../eventConsentVersion";

const id = "11111111-1111-4111-8111-111111111111",
  second = "22222222-2222-4222-8222-222222222222",
  tableId = "33333333-3333-4333-8333-333333333333";
const event = {
  id,
  groupId: second,
  groupType: "PRIVATE",
  groupName: "Club",
  adminUserId: "owner",
  name: "Friday games",
  status: "PLANNING",
  planningGeneration: 1,
  version: 1,
  timeZone: "Europe/Rome",
  startTime: "09:00",
  dates: [
    { id, day: "2030-06-01" },
    { id: second, day: "2030-06-02", startTime: "20:00" },
  ],
  locations: [
    { id, name: "Club", address: "Via Roma 1", latitude: 41.9, longitude: 12.5 },
    {
      id: second,
      name: "Second venue",
      address: "Via Milano 2",
      latitude: 41.91,
      longitude: 12.5,
      timeZone: "Europe/Rome",
    },
  ],
} satisfies NonNullable<Parameters<typeof captureEventConsent>[1]>;
const table = {
  id: tableId,
  eventId: id,
  eventStatus: "PLANNING",
  name: "First table",
  minPlayers: 2,
  maxPlayers: 4,
  rankingEnabled: true,
  games: [{ gameId: 1 }, { gameId: 2, durationMinutes: 60, durationSource: "BGG" }],
} satisfies NonNullable<Parameters<typeof captureEventConsent>[2]>;
const input: JoinTableInput = {
  version: 1,
  gameVotes: { "1": "YES", "2": "YES" },
  availability: {
    version: 1,
    dateVotes: { [id]: "YES", [second]: "YES" },
    locationVotes: { [id]: "YES", [second]: "YES" },
  },
};

describe("not-yet-sent consent versions", () => {
  it("rebases only originally current consent over a matching direct owned ACK, retaining all choices by identity", () => {
    const snapshot = captureEventConsent(input, event, table);
    const changed = rebaseEventConsent(input, snapshot, { ...event, version: 2 }, table, 2);
    expect(changed).toEqual({
      ...input,
      version: 2,
      availability: { ...input.availability, version: 2 },
    });
    expect(changed.gameVotes).toBe(input.gameVotes);
    expect(changed.availability?.dateVotes).toBe(input.availability?.dateVotes);
    expect(changed.availability?.locationVotes).toBe(input.availability?.locationVotes);
    expect(input.version).toBe(1);
    expect(input.availability?.version).toBe(1);
  });
  it("does not manufacture availability for fixed public consent and compares explicit venue clocks/durations", () => {
    const fixed = {
      ...event,
      groupType: "PUBLIC" as const,
      dates: [event.dates[0]],
      locations: [event.locations[1]],
      endsAt: "2030-06-01T20:00:00Z",
      bookingClosesAt: "2030-05-31T20:00:00Z",
    };
    const scheduled = { ...table, startsAt: "2030-06-01T08:00:00Z", demonstratorUserId: "demo" };
    const consent = { version: 1, gameVotes: input.gameVotes };
    const snapshot = captureEventConsent(consent, fixed, scheduled);
    const changed = rebaseEventConsent(consent, snapshot, { ...fixed, version: 3 }, scheduled, 3);
    expect(changed).toEqual({ version: 3, gameVotes: input.gameVotes });
    expect(changed).not.toHaveProperty("availability");
  });
  it("never captures arbitrary stale, missing, foreign or frozen source state", () => {
    expect(captureEventConsent(input, undefined, table)).toBeUndefined();
    expect(captureEventConsent(input, event, undefined)).toBeUndefined();
    expect(captureEventConsent(input, event, { ...table, eventId: second })).toBeUndefined();
    expect(captureEventConsent(input, { ...event, status: "CONFIRMED" }, table)).toBeUndefined();
    expect(
      captureEventConsent(input, event, { ...table, eventStatus: "CONFIRMED" }),
    ).toBeUndefined();
    expect(captureEventConsent({ ...input, version: 2 }, event, table)).toBeUndefined();
    expect(
      captureEventConsent(
        { ...input, availability: { ...input.availability!, version: 2 } },
        event,
        table,
      ),
    ).toBeUndefined();
  });
  it("does not turn an unowned GET, missing/older source or changed input into permission to advance a version", () => {
    const snapshot = captureEventConsent(input, event, table),
      current = { ...event, version: 2 };
    expect(rebaseEventConsent(input, undefined, current, table, 2)).toBe(input);
    expect(rebaseEventConsent(input, snapshot, undefined, table, 2)).toBe(input);
    expect(rebaseEventConsent(input, snapshot, current, undefined, 2)).toBe(input);
    expect(rebaseEventConsent({ ...input, version: 2 }, snapshot, current, table, 2).version).toBe(
      2,
    );
    const invalid = { ...input, availability: { ...input.availability!, version: 2 } };
    expect(rebaseEventConsent(invalid, snapshot, current, table, 2)).toBe(invalid);
    expect(rebaseEventConsent(input, snapshot, { ...current, id: second }, table, 2)).toBe(input);
    expect(rebaseEventConsent(input, snapshot, current, { ...table, id: second }, 2)).toBe(input);
    expect(rebaseEventConsent(input, snapshot, current, { ...table, eventId: second }, 2)).toBe(
      input,
    );
    expect(rebaseEventConsent(input, snapshot, event, table, 1)).toBe(input);
    expect(rebaseEventConsent(input, snapshot, current, table, undefined)).toBe(input);
    expect(rebaseEventConsent(input, snapshot, current, table, 3)).toBe(input);
  });
  it("requires human review after any current consent definition changes, even with an owned receipt", () => {
    const snapshot = captureEventConsent(input, event, table),
      current = { ...event, version: 2 };
    for (const changed of [
      { ...current, name: "Changed event" },
      { ...current, status: "CONFIRMED" as const },
      { ...current, planningGeneration: 2 },
      { ...current, timeZone: "UTC" },
      { ...current, dates: [{ ...event.dates[0], startTime: "10:00" }, event.dates[1]] },
      { ...current, locations: [{ ...event.locations[0], longitude: 12.51 }, event.locations[1]] },
      { ...current, dates: [...current.dates].reverse() },
      { ...current, locations: [...current.locations].reverse() },
      { ...current, endsAt: "2030-06-01T20:00:00Z" },
      { ...current, bookingClosesAt: "2030-05-31T20:00:00Z" },
    ])
      expect(rebaseEventConsent(input, snapshot, changed, table, 2)).toBe(input);
    for (const changed of [
      { ...table, name: "Changed table" },
      { ...table, minPlayers: 3 },
      { ...table, maxPlayers: 3 },
      { ...table, rankingEnabled: false },
      { ...table, startsAt: "2030-06-01T08:00:00Z" },
      { ...table, demonstratorUserId: "other" },
      { ...table, eventStatus: "CONFIRMED" as const },
      { ...table, games: [table.games[1], table.games[0]] },
      { ...table, games: [{ gameId: 1, durationMinutes: 90, durationSource: "MANUAL" as const }] },
    ])
      expect(rebaseEventConsent(input, snapshot, current, changed, 2)).toBe(input);
  });
});
