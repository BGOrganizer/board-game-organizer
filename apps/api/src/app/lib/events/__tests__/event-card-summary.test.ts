import type { EventRecord, TableRecord, TableRegistration } from "@board-game-organizer/schemas";
import { calculateEventAgreement, type EventAgreementInput } from "@board-game-organizer/shared";
import { describe, expect, it } from "vitest";
import { eventCardSummary, tableCardSummary, tablePlanningBlockers } from "../event-card-summary";

const at = "2030-01-01T12:00:00.000Z";
function input(): EventAgreementInput & {
  registrations: Array<EventAgreementInput["registrations"][number]>;
} {
  return {
    planningMode: "ASSISTED",
    playerPreference: "MORE_PLAYERS",
    fixedDateAndLocation: false,
    dateIds: ["date"],
    locationIds: ["venue"],
    tables: [{ id: "table", minPlayers: 2, maxPlayers: 3, fixedGame: true, gameIds: [1] }],
    registrations: ["a", "b"].map((userId, sequence) => ({
      id: userId,
      userId,
      tableId: "table",
      status: "ACCEPTED",
      priorityAt: at,
      sequence,
    })),
    dateVotes: {},
    locationVotes: {},
    gameVotes: {},
  };
}
const blocked = (value: EventAgreementInput) =>
  tablePlanningBlockers(value, calculateEventAgreement(value), "table");
const event = {
  id: "event",
  status: "CONFIRMED",
  dates: [{ id: "date" }],
  locations: [{ id: "venue" }],
  confirmed: { dateId: "date", locationId: "venue", at },
} as EventRecord;
const table = {
  id: "table",
  name: "Table",
  games: [{ gameId: 1 }],
  confirmed: { gameId: 1, playerIds: ["a", "b"], startsAt: at },
} as TableRecord;
const registration = { userId: "c", status: "ACCEPTED", gameVotes: {} } as TableRegistration;

describe("card readiness uses real confirmation and bounded independent diagnostics", () => {
  it("reports ready and tolerates an unavailable table diagnostic", () => {
    expect(blocked(input())).toEqual([]);
    const noGames = input();
    noGames.tables[0].gameIds = [];
    expect(blocked(noGames)).toEqual(["GAME_AGREEMENT"]);
    expect(
      tablePlanningBlockers(input(), { agreed: false, tables: [], situationKey: "" }, "missing"),
    ).toEqual(["COMBINED_AGREEMENT"]);
  });
  it("distinguishes missing acceptance, occupied pending slots and Manual queue", () => {
    const one = input();
    one.registrations.pop();
    expect(blocked(one)).toEqual(["MIN_PLAYERS"]);
    const pending = input();
    pending.tables[0].maxPlayers = 2;
    pending.registrations[1].status = "PENDING";
    expect(blocked(pending)).toEqual(["MIN_PLAYERS", "PENDING_INVITATIONS"]);
    pending.registrations.push({
      ...pending.registrations[0],
      id: "queue",
      userId: "queue",
      sequence: 3,
    });
    expect(blocked(pending)).toEqual(["PENDING_INVITATIONS"]);
    const manual = input();
    manual.planningMode = "MANUAL";
    manual.registrations[0].seatIndex = 0;
    manual.registrations[1].seatIndex = null;
    expect(blocked(manual)).toEqual(["MIN_PLAYERS"]);
    manual.planningMode = "ASSISTED";
    manual.tables[0].preserveSeatAllocation = true;
    expect(blocked(manual)).toEqual(["MIN_PLAYERS"]);
  });
  it("uses BGG's genuine minimum when higher than the Table minimum", () => {
    const value = input();
    value.tables[0].gamePlayerBounds = { 1: { minPlayers: 3, maxPlayers: 4 } };
    expect(blocked(value)).toEqual(["MIN_PLAYERS"]);
  });
  it.each(["DATE_AGREEMENT", "LOCATION_AGREEMENT", "GAME_AGREEMENT"] as const)(
    "identifies %s without treating singleton UNKNOWN as disagreement",
    (category) => {
      const value = input();
      if (category === "DATE_AGREEMENT") value.dateIds = ["one", "two"];
      if (category === "LOCATION_AGREEMENT") value.locationIds = ["one", "two"];
      if (category === "GAME_AGREEMENT") value.tables[0].gameIds = [1, 2];
      expect(blocked(value)).toEqual([category]);
    },
  );
  it("reports all independent missing categories and honors YES/IF_NEEDED", () => {
    const value = input();
    value.dateIds = ["one", "two"];
    value.locationIds = ["one", "two"];
    value.tables[0].gameIds = [1, 2];
    expect(blocked(value)).toEqual(["DATE_AGREEMENT", "LOCATION_AGREEMENT", "GAME_AGREEMENT"]);
    value.dateVotes = { a: { one: "YES" }, b: { one: "IF_NEEDED" } };
    value.locationVotes = { a: { two: "YES" }, b: { two: "IF_NEEDED" } };
    value.gameVotes = { table: { a: {} } };
    expect(blocked(value)).toEqual(["GAME_AGREEMENT"]);
    value.gameVotes = { table: { a: { 1: "YES" }, b: { 1: "IF_NEEDED" } } };
    expect(blocked(value)).toEqual([]);
    value.fixedDateAndLocation = true;
    value.dateVotes = {};
    value.locationVotes = {};
    expect(blocked(value)).toEqual([]);
  });
  it("distinguishes joint incompatibility from independent category disagreement", () => {
    const value = input();
    value.dateIds = ["one", "two"];
    value.locationIds = ["one", "two"];
    value.tables[0].maxPlayers = 4;
    value.registrations = ["a", "b", "c"].map((userId, sequence) => ({
      id: userId,
      userId,
      tableId: "table",
      status: "ACCEPTED",
      priorityAt: at,
      sequence,
    }));
    value.dateVotes = { a: { one: "YES" }, b: { one: "YES" } };
    value.locationVotes = { b: { one: "YES" }, c: { one: "YES" } };
    expect(blocked(value)).toEqual(["COMBINED_AGREEMENT"]);
  });
  it("keeps locked and Manual seats mandatory while evaluating a category", () => {
    const value = input();
    value.dateIds = ["one", "two"];
    value.registrations.push({ ...value.registrations[0], id: "c", userId: "c", sequence: 2 });
    value.dateVotes = { a: { one: "YES" }, b: { one: "YES" }, c: { two: "NO" } };
    value.registrations[2].locked = true;
    expect(blocked(value)).toEqual(["DATE_AGREEMENT"]);
    value.registrations[2].locked = false;
    value.planningMode = "MANUAL";
    expect(blocked(value)).toEqual(["DATE_AGREEMENT"]);
  });
  it("retains combined game/count constraints instead of inventing a vote failure", () => {
    const value = input();
    value.tables[0].gamePlayerBounds = { 1: { minPlayers: 2, maxPlayers: 1 } };
    expect(blocked(value)).toEqual(["COMBINED_AGREEMENT"]);
  });
});

describe("durable personal card facts", () => {
  it("marks only the requesting user's demonstration assignment", () => {
    const demonstration = { ...table, demonstratorUserId: "guide" };
    expect(tableCardSummary(event, demonstration, "guide", null, []).myDemonstrator).toBe(true);
    expect(tableCardSummary(event, demonstration, "other", null, []).myDemonstrator).toBe(false);
    expect(tableCardSummary(event, demonstration, "", null, []).myDemonstrator).toBe(false);
  });

  it("reports frozen attendance even without a registration and preserves tied winner handles", () => {
    const winners = [
      { userId: "a", username: "alice" },
      { userId: "b", username: "bob" },
    ];
    expect(tableCardSummary(event, table, "a", null, winners)).toMatchObject({
      confirmed: true,
      ready: true,
      myParticipation: "CONFIRMED",
      blockers: [],
      exclusionReasons: [],
      winners,
    });
    expect(tableCardSummary(event, table, "viewer", null, [])).toMatchObject({
      myParticipation: "NONE",
    });
    for (const status of ["DECLINED", "CANCELLED"] as const)
      expect(
        tableCardSummary(event, table, "c", { ...registration, status }, []).myParticipation,
      ).toBe("NONE");
  });
  it("distinguishes excluded tables, pending consent and unspecified historical roster exclusion", () => {
    expect(
      tableCardSummary(event, { ...table, confirmed: undefined }, "c", registration, [])
        .exclusionReasons,
    ).toEqual(["TABLE_EXCLUDED"]);
    expect(
      tableCardSummary(event, table, "c", { ...registration, status: "PENDING" }, [])
        .exclusionReasons,
    ).toEqual(["PENDING_INVITATION"]);
    expect(tableCardSummary(event, table, "c", registration, []).exclusionReasons).toEqual([
      "NOT_SELECTED",
    ]);
  });
  it("explains factual incompatibility with frozen chosen options without claiming optimizer causality", () => {
    const variable = {
      ...event,
      dates: [...event.dates, { ...event.dates[0], id: "other-date" }],
      locations: [...event.locations, { ...event.locations[0], id: "other-venue" }],
    };
    const games = { ...table, games: [{ gameId: 1 }, { gameId: 2 }] };
    const summarize = (
      availability:
        | {
            dateVotes: Record<string, "YES" | "NO" | "IF_NEEDED">;
            locationVotes: Record<string, "YES" | "NO" | "IF_NEEDED">;
          }
        | null
        | undefined,
      gameVotes: TableRegistration["gameVotes"] = {},
    ) =>
      tableCardSummary(
        variable,
        games,
        "c",
        { ...registration, gameVotes },
        [],
        undefined,
        availability,
      ).exclusionReasons;
    expect(summarize({ dateVotes: { date: "NO" }, locationVotes: { venue: "NO" } })).toEqual([
      "DATE_AGREEMENT",
      "LOCATION_AGREEMENT",
      "GAME_AGREEMENT",
    ]);
    expect(summarize(null)).toEqual(["DATE_AGREEMENT", "LOCATION_AGREEMENT", "GAME_AGREEMENT"]);
    expect(summarize(undefined)).toEqual(["GAME_AGREEMENT"]);
    expect(
      summarize(
        { dateVotes: { date: "IF_NEEDED" }, locationVotes: { venue: "YES" } },
        { "1": "YES" },
      ),
    ).toEqual(["NOT_SELECTED"]);
    expect(
      tableCardSummary(event, table, "c", registration, [], undefined, null).exclusionReasons,
    ).toEqual(["NOT_SELECTED"]);
    expect(
      tableCardSummary(
        { ...variable, confirmed: undefined },
        table,
        "c",
        registration,
        [],
        undefined,
        null,
      ).exclusionReasons,
    ).toEqual(["NOT_SELECTED"]);
  });
  it("does not label a Planning registration as excluded and carries readiness independently", () => {
    const value = input();
    const agreement = calculateEventAgreement(value);
    const summary = tableCardSummary(
      { ...event, status: "PLANNING" },
      { ...table, confirmed: undefined },
      "c",
      registration,
      [],
      { input: value, agreement },
    );
    expect(summary).toMatchObject({
      ready: true,
      myParticipation: "NONE",
      blockers: [],
      exclusionReasons: [],
    });
    expect(eventCardSummary(true, [summary])).toEqual({ ready: true, tables: [summary] });
    value.registrations.pop();
    const blockedSummary = tableCardSummary(
      { ...event, status: "PLANNING" },
      { ...table, confirmed: undefined },
      "c",
      registration,
      [],
      { input: value, agreement: calculateEventAgreement(value) },
    );
    expect(blockedSummary).toMatchObject({ ready: false, blockers: ["MIN_PLAYERS"] });
  });
});
