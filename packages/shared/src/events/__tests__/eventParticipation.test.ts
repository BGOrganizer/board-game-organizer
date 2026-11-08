import type {
  PlannedEventResponse,
  TableRegistration,
  TableSeatPosition,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  eventParticipation,
  eventParticipationFlags,
  tableParticipation,
  tableRegistrationPosition,
} from "../eventParticipation";

const row = (changes: Partial<TableRegistration> & { position?: TableSeatPosition } = {}) =>
  ({
    id: "registration",
    eventId: "event",
    tableId: "table",
    userId: "player",
    kind: "SELF",
    status: "ACCEPTED",
    version: 1,
    priorityAt: "2030-01-01T00:00:00Z",
    sequence: 1,
    gameVotes: {},
    createdAt: "2030-01-01T00:00:00Z",
    updatedAt: "2030-01-01T00:00:00Z",
    ...changes,
  }) as PlannedEventResponse["myRegistrations"][number];

describe("source positions", () => {
  it("does not create a seat for an administrator or missing registration", () => {
    expect(tableRegistrationPosition("PLANNING", null, [], ["player"])).toBeNull();
  });
  it("uses reservation IDs during planning and immutable roster after confirmation", () => {
    expect(tableRegistrationPosition("PLANNING", row(), ["registration"], [])).toBe("SEATED");
    expect(tableRegistrationPosition("PLANNING", row(), [], ["player"])).toBe("WAITING");
    for (const status of ["CONFIRMED", "TERMINATED"] as const) {
      expect(tableRegistrationPosition(status, row(), [], ["player"])).toBe("FROZEN");
      expect(tableRegistrationPosition(status, row(), ["registration"], [])).toBe("WAITING");
    }
  });
});

describe("Table indicator", () => {
  it("distinguishes pending consent, accepted queue and real confirmed places", () => {
    expect(tableParticipation(null, null)).toBeNull();
    expect(tableParticipation(null, "FROZEN")).toBe("confirmed");
    expect(tableParticipation(null, "WAITING")).toBe("waiting");
    expect(tableParticipation(row({ status: "PENDING", kind: "INVITATION" }), "SEATED")).toBe(
      "invitation",
    );
    expect(tableParticipation(row({ status: "PENDING" }), "WAITING")).toBe("request");
    expect(tableParticipation(row(), "WAITING")).toBe("waiting");
    expect(tableParticipation(row(), "SEATED")).toBe("confirmed");
    expect(tableParticipation(row({ status: "CANCELLED" }), "FROZEN")).toBe("confirmed");
    expect(tableParticipation(row({ status: "DECLINED" }), "SEATED")).toBeNull();
    expect(tableParticipation(row(), null)).toBeUndefined();
    expect(tableParticipation(row(), undefined)).toBeUndefined();
  });
});

describe("independent Event consent flags", () => {
  it("shows accepted and pending facts together without converting a queue into a seated place", () => {
    expect(eventParticipationFlags([])).toEqual({ accepted: false, pending: false });
    expect(
      eventParticipationFlags([
        row({ position: "WAITING" }),
        row({ tableId: "other", status: "PENDING" }),
      ]),
    ).toEqual({ accepted: true, pending: true });
    expect(
      eventParticipationFlags([row({ status: "DECLINED" }), row({ status: "CANCELLED" })]),
    ).toEqual({ accepted: false, pending: false });
    expect(eventParticipationFlags([row({ status: "PENDING", kind: "INVITATION" })])).toEqual({
      accepted: false,
      pending: true,
    });
    expect(eventParticipationFlags([row({ status: "CANCELLED", position: "FROZEN" })])).toEqual({
      accepted: true,
      pending: false,
    });
    expect(eventParticipationFlags([row({ position: undefined })])).toEqual({
      accepted: true,
      pending: false,
    });
  });
});

describe("Event aggregate", () => {
  const request = row({ status: "PENDING" }),
    invitation = row({ status: "PENDING", kind: "INVITATION" }),
    waiting = row({ position: "WAITING" });
  it("prioritizes any confirmed Table, then request, invitation, waiting", () => {
    expect(eventParticipation([waiting, invitation, request, row({ position: "SEATED" })])).toBe(
      "confirmed",
    );
    expect(eventParticipation([waiting, invitation, request])).toBe("request");
    expect(eventParticipation([waiting, invitation])).toBe("invitation");
    expect(eventParticipation([waiting])).toBe("waiting");
    expect(eventParticipation([row({ position: "FROZEN" })])).toBe("confirmed");
  });
  it("requires complete source evidence rather than guessing from cached/partial seats or admin role", () => {
    expect(eventParticipation([])).toBeNull();
    expect(
      eventParticipation([row({ status: "CANCELLED" }), row({ status: "DECLINED" })]),
    ).toBeNull();
    expect(eventParticipation([row(), request, invitation, waiting])).toBeUndefined();
    expect(eventParticipation([row(), row({ position: "SEATED" })])).toBe("confirmed");
    const receipt = { ...row({ position: "SEATED" }), position: undefined };
    expect(eventParticipation([receipt])).toBeUndefined();
  });
});
