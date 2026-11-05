import type { EventRecord, TableRecord } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { eventProposalEdit } from "../eventProposalEdit";

const id = "11111111-1111-4111-8111-111111111111",
  tid = "22222222-2222-4222-8222-222222222222";
const venue = {
  id,
  name: "Club",
  address: "Via Roma 1",
  latitude: 41.9,
  longitude: 12.5,
  timeZone: "Europe/Rome",
};
const event: EventRecord = {
  id,
  groupId: tid,
  adminUserId: "owner",
  name: "Friday games",
  timeZone: "Europe/Rome",
  startTime: "20:00",
  status: "PLANNING",
  dates: [{ id, day: "2030-06-03" }],
  locations: [venue],
  version: 3,
  planningGeneration: 1,
  nextPriority: 1,
  nextTableOrder: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
const table: TableRecord = {
  id: tid,
  eventId: id,
  name: "Table one",
  minPlayers: 2,
  maxPlayers: 4,
  rankingEnabled: false,
  allowParticipantGames: true,
  demonstratorUserId: "demo",
  order: 0,
  games: [
    { gameId: 1, durationMinutes: 60, durationSource: "MANUAL" },
    { gameId: 2, durationMinutes: 90, durationSource: "BGG" },
  ],
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
};
describe("participant proposals canonical edit", () => {
  it("adds independent date/time, retains old identity and never writes ballots or consent", () => {
    const edit = eventProposalEdit(
      event,
      [table],
      { kind: "date", day: "2030-06-04", startTime: "21:00" },
      tid,
    );
    expect(edit.input?.dates).toEqual([
      ...event.dates,
      { id: tid, day: "2030-06-04", startTime: "21:00" },
    ]);
    expect(edit.input?.tables).toEqual([]);
    expect(edit.input?.version).toBe(3);
    expect(edit.input).not.toHaveProperty("votes");
    expect(event.dates).toHaveLength(1);
    expect(
      eventProposalEdit(event, [], { kind: "date", day: "2030-06-03", startTime: "20:00" }, tid),
    ).toEqual({ input: null, optionId: id });
  });
  it("deduplicates explicit clocks and enforces actual date limit only after known canonical lookup", () => {
    const full = {
      ...event,
      dates: Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        day: "2030-06-03",
        startTime: `${String(i).padStart(2, "0")}:00`,
      })),
    };
    expect(
      eventProposalEdit(full, [], { kind: "date", day: "2030-06-03", startTime: "00:00" }, tid)
        .optionId,
    ).toBe("0");
    expect(() =>
      eventProposalEdit(full, [], { kind: "date", day: "2030-06-04", startTime: "00:00" }, tid),
    ).toThrow("PROPOSAL_OPTION_LIMIT");
  });
  it("uses returned verified coordinates/address, replaces picker identity and respects location limit", () => {
    expect(
      eventProposalEdit(
        event,
        [],
        { kind: "location", location: { ...venue, id: tid, name: "Another label" } },
        tid,
      ),
    ).toEqual({ input: null, optionId: id });
    const location = { ...venue, id: "client", address: "Via Milano 2", longitude: 13 };
    expect(
      eventProposalEdit(event, [], { kind: "location", location }, tid).input?.locations.at(-1),
    ).toEqual({ ...location, id: tid });
    expect(() =>
      eventProposalEdit(
        { ...event, locations: Array.from({ length: 20 }, () => venue) },
        [],
        { kind: "location", location },
        tid,
      ),
    ).toThrow("PROPOSAL_OPTION_LIMIT");
  });
  it("edits only target Table, preserves manual duration/delegation and adds no vote", () => {
    const result = eventProposalEdit(
      event,
      [table],
      { kind: "game", tableId: tid, gameId: 3 },
      "unused",
    );
    expect(result.optionId).toBe("3");
    expect(result.input?.tables).toEqual([
      {
        id: tid,
        name: table.name,
        minPlayers: 2,
        maxPlayers: 4,
        rankingEnabled: false,
        allowParticipantGames: true,
        startsAt: undefined,
        demonstratorUserId: "demo",
        games: [{ gameId: 1, manualDurationMinutes: 60 }, { gameId: 2 }, { gameId: 3 }],
      },
    ]);
    expect(result.input?.dates).toBe(event.dates);
    expect(
      eventProposalEdit(event, [table], { kind: "game", tableId: tid, gameId: 1 }, id),
    ).toEqual({ input: null, optionId: "1" });
    expect(() =>
      eventProposalEdit(event, [], { kind: "game", tableId: tid, gameId: 3 }, id),
    ).toThrow("TABLE_NOT_FOUND");
    expect(() =>
      eventProposalEdit(
        event,
        [{ ...table, removedAt: event.createdAt }],
        { kind: "game", tableId: tid, gameId: 3 },
        id,
      ),
    ).toThrow("TABLE_NOT_FOUND");
    expect(() =>
      eventProposalEdit(event, [{ ...table, id }], { kind: "game", tableId: tid, gameId: 3 }, id),
    ).toThrow("TABLE_NOT_FOUND");
  });
  it("does not invent an administrative game cap absent from canonical schema", () => {
    const games = Array.from({ length: 21 }, (_, i) => ({ gameId: i + 1 }));
    expect(
      eventProposalEdit(
        event,
        [{ ...table, games }],
        { kind: "game", tableId: tid, gameId: 22 },
        id,
      ).input?.tables[0].games,
    ).toHaveLength(22);
  });
});
