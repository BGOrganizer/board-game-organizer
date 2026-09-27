import type { MatchResponse } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { matchCardData, matchCardStatusColor } from "../matchCard";

const match: MatchResponse = {
  id: "bf5946bb-8845-439e-ae46-d54e059c0e6a",
  adminUserId: "admin",
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z", "2026-10-02T20:00:00.000Z"],
  minPlayers: 2,
  maxPlayers: 5,
  invitedUserIds: ["guest", "pending"],
  gameIds: [1, 2],
  status: "PLANNING",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  invitations: [
    {
      id: "8b34c2c6-9afe-47e9-bc50-96cab4957376",
      matchId: "bf5946bb-8845-439e-ae46-d54e059c0e6a",
      inviterUserId: "admin",
      inviteeUserId: "guest",
      status: "ACCEPTED",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "822b7bcf-50c1-4e82-975f-7937b9e98afc",
      matchId: "bf5946bb-8845-439e-ae46-d54e059c0e6a",
      inviterUserId: "admin",
      inviteeUserId: "pending",
      status: "PENDING",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    },
  ],
};

describe("matchCardData", () => {
  it("keeps semantic colors ready for future match states", () => {
    expect(matchCardStatusColor).toEqual({
      PLANNING: "warning",
      CREATED: "success",
      IN_PROGRESS: "accent",
      TERMINATED: "default",
      CANCELLED: "danger",
    });
  });
  it("shows min/max, all dates, and game count while planning", () => {
    expect(matchCardData(match)).toEqual({
      date: match.dates[0],
      additionalDates: 1,
      players: 2,
      maxPlayers: 5,
      gameCount: 2,
      selectedGameName: undefined,
      winnerNames: undefined,
    });
  });

  it("shows accepted players, selected date, and selected game after confirmation", () => {
    expect(
      matchCardData({
        ...match,
        status: "CREATED",
        selectedDate: match.dates[1],
        selectedGameId: 2,
        selectedGameName: "Cascadia",
      }),
    ).toEqual({
      date: match.dates[1],
      additionalDates: 0,
      players: 2,
      maxPlayers: 5,
      gameCount: undefined,
      selectedGameName: "Cascadia",
      winnerNames: undefined,
    });
  });

  it("picks the next upcoming date, or the most recent when all have passed", () => {
    const dates = [match.dates[1], match.dates[0]];
    expect(matchCardData({ ...match, dates }, Date.parse("2026-10-01T21:00:00Z")).date).toBe(
      match.dates[1],
    );
    expect(matchCardData({ ...match, dates }, Date.parse("2026-10-03T00:00:00Z")).date).toBe(
      match.dates[1],
    );
    expect(dates).toEqual([match.dates[1], match.dates[0]]);
    expect(
      matchCardData({ ...match, status: "CREATED" }, Date.parse("2026-09-01T00:00:00Z"))
        .additionalDates,
    ).toBe(1);
  });

  it("exposes only terminated winners", () => {
    expect(matchCardData({ ...match, winnerNames: ["Guest Player"] }).winnerNames).toBeUndefined();
    expect(
      matchCardData({ ...match, status: "TERMINATED", winnerNames: ["Guest Player"] }).winnerNames,
    ).toEqual(["Guest Player"]);
  });
});
