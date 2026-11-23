import { describe, expect, it } from "vitest";
import { confirmedTableGameId, tableTitleProjection } from "../table-title";

const priorConfirmation = {
  confirmed: { gameId: 42, playerIds: ["alice", "bob"], startsAt: "2026-11-23T18:00:00Z" },
};

describe("automatic table title projection", () => {
  it("uses the number when replanning a previously confirmed table", () => {
    expect(confirmedTableGameId("PLANNING", priorConfirmation)).toBeUndefined();
    expect(tableTitleProjection(3)).toEqual({ name: "Table #4" });
  });

  it.each(["CONFIRMED", "TERMINATED"] as const)("uses only the selected game when %s", (status) => {
    expect(confirmedTableGameId(status, priorConfirmation)).toBe(42);
    expect(confirmedTableGameId(status, {})).toBeUndefined();
    expect(tableTitleProjection(3, "Hegemony")).toEqual({
      name: "Hegemony",
      confirmedGameName: "Hegemony",
    });
  });
});
