import { expect, it } from "vitest";
import { eventProposalAuthors, eventProposalLabel } from "../eventProposalLabel";

it("keeps grouped usernames distinct and supports ordinary single-author proposals", () => {
  expect(eventProposalAuthors({ authorName: "one" })).toBe("one");
  const member = { id: "id", userId: "u", version: 1, status: "PENDING" as const };
  expect(
    eventProposalAuthors({
      authorName: "one",
      gameSuggestions: [
        { ...member, authorName: "one" },
        { ...member, id: "id2", authorName: "two" },
        { ...member, id: "id3", authorName: "one" },
      ],
    }),
  ).toBe("one, two");
  expect(eventProposalAuthors({ authorName: "one", gameSuggestions: [] })).toBe("");
});
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
