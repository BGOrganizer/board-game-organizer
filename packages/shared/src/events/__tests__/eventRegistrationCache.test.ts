import type { PlannedTableResponse, TableRegistration } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { acknowledgeTableRegistration } from "../eventRegistrationCache";

const registration = {
  id: "registration",
  eventId: "event",
  tableId: "table",
  userId: "owner",
  kind: "INVITATION",
  status: "ACCEPTED",
  version: 2,
  gameVotes: { "1": "YES" },
} as TableRegistration;
const table = {
  id: "table",
  eventId: "event",
  myRegistration: null,
  myPosition: null,
  canRegister: true,
  canRespond: false,
  canLeave: false,
  gameVoteCounts: { "1": { YES: 1, NO: 0, IF_NEEDED: 0, UNKNOWN: 2 } },
} as PlannedTableResponse;

describe("acknowledged Table participation", () => {
  it("adds only the consenting actor's votes without stealing another player's unknown ballot or inventing a seat", () => {
    const saved = acknowledgeTableRegistration(table, registration, "owner");
    expect(saved.myRegistration).toEqual(registration);
    expect(saved.gameVoteCounts?.["1"]).toEqual({ YES: 2, NO: 0, IF_NEEDED: 0, UNKNOWN: 2 });
    expect(saved).toMatchObject({
      myPosition: null,
      canRegister: false,
      canRespond: false,
      canLeave: false,
    });
    expect(acknowledgeTableRegistration(saved, registration, "owner").gameVoteCounts).toEqual(
      saved.gameVoteCounts,
    );
    expect(table.myRegistration).toBeNull();
  });
  it.each(["CANCELLED", "DECLINED"] as const)(
    "removes only the acknowledged actor's ballot when %s, not another player's count",
    (status) => {
      const previous = acknowledgeTableRegistration(table, registration, "owner");
      const saved = acknowledgeTableRegistration(
        { ...previous, myPosition: "SEATED", canLeave: true },
        { ...registration, version: 3, status },
        "owner",
      );
      expect(saved.gameVoteCounts).toEqual(table.gameVoteCounts);
      expect(saved).toMatchObject({ myPosition: null, canLeave: false });
    },
  );
  it("reconciles game-vote versions without double counting or dropping existing profile fields", () => {
    const before = acknowledgeTableRegistration(table, registration, "owner");
    const saved = acknowledgeTableRegistration(
      { ...before, myRegistration: { ...registration, name: "Owner" } },
      { ...registration, version: 3, gameVotes: { "1": "NO" } },
      "owner",
    );
    expect(saved.myRegistration).toMatchObject({
      version: 3,
      name: "Owner",
      gameVotes: { "1": "NO" },
    });
    expect(saved.gameVoteCounts?.["1"]).toEqual({ YES: 1, NO: 1, IF_NEEDED: 0, UNKNOWN: 2 });
  });
  it("does not count pending ballots, remove consent controls before acceptance, or fabricate missing count data", () => {
    const pending = { ...registration, status: "PENDING" as const };
    const saved = acknowledgeTableRegistration({ ...table, canRespond: true }, pending, "owner");
    expect(saved.canRespond).toBe(true);
    expect(saved.gameVoteCounts).toBe(table.gameVoteCounts);
    expect(
      acknowledgeTableRegistration(saved, registration, "owner").gameVoteCounts?.["1"].YES,
    ).toBe(2);
    const { gameVoteCounts: _counts, ...withoutCounts } = table;
    expect(
      acknowledgeTableRegistration(withoutCounts, registration, "owner").gameVoteCounts,
    ).toBeUndefined();
  });
  it("keeps unknown ballots bounded to accepted participants and clamps stale counters", () => {
    const unknown = { ...registration, gameVotes: {} };
    const joined = acknowledgeTableRegistration(table, unknown, "owner");
    expect(joined.gameVoteCounts?.["1"].UNKNOWN).toBe(3);
    const changed = acknowledgeTableRegistration(
      { ...table, myRegistration: unknown },
      { ...registration, version: 3 },
      "owner",
    );
    expect(changed.gameVoteCounts?.["1"].UNKNOWN).toBe(1);
    const stale = {
      ...table,
      gameVoteCounts: { "1": { YES: 0, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 } },
      myRegistration: registration,
    };
    expect(
      acknowledgeTableRegistration(
        stale,
        { ...registration, version: 3, status: "CANCELLED" },
        "owner",
      ).gameVoteCounts?.["1"].YES,
    ).toBe(0);
  });
  it("ignores foreign actors, resources and older acknowledgements", () => {
    expect(acknowledgeTableRegistration(table, registration, undefined)).toBe(table);
    expect(
      acknowledgeTableRegistration(table, { ...registration, tableId: "other" }, "owner"),
    ).toBe(table);
    expect(
      acknowledgeTableRegistration(table, { ...registration, eventId: "other" }, "owner"),
    ).toBe(table);
    const newer = { ...table, myRegistration: { ...registration, version: 3 } };
    expect(acknowledgeTableRegistration(newer, registration, "owner")).toBe(newer);
  });
});
