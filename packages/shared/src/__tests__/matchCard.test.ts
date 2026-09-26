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
      FINISHED: "default",
      CANCELLED: "danger",
    });
  });
  it("shows min/max, all dates, and game count while planning", () => {
    expect(matchCardData(match)).toEqual({
      dates: match.dates,
      players: 2,
      maxPlayers: 5,
      gameCount: 2,
      selectedGameName: undefined,
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
      dates: [match.dates[1]],
      players: 2,
      maxPlayers: 5,
      gameCount: undefined,
      selectedGameName: "Cascadia",
    });
  });

  it("keeps dates when selected date is missing", () => {
    expect(matchCardData({ ...match, status: "CREATED" }).dates).toEqual(match.dates);
  });
});
