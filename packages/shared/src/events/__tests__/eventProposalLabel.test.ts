import { expect, it } from "vitest";
import { eventProposalLabel } from "../eventProposalLabel";

it("formats EN/IT proposed wall clocks without moving to another venue's zone", () => {
  const date = { kind: "date" as const, day: "2030-06-04", startTime: "20:00" };
  expect(eventProposalLabel(date, "fallback", "en-US")).toBe("Jun 4, 2030, 8:00 PM");
  expect(eventProposalLabel(date, "fallback", "it")).toBe("4 giu 2030, 20:00");
  expect(eventProposalLabel({ kind: "game", tableId: "table", gameId: 1 }, "Game", "it")).toBe(
    "Game",
  );
  expect(eventProposalLabel({ ...date, day: "invalid" }, "Historical label", "it")).toBe(
    "Historical label",
  );
});
