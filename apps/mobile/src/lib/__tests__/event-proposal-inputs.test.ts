import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const script = readFileSync(
  new URL("../../../.maestro/helpers/event-proposal-inputs.js", import.meta.url),
  "utf8",
);
const input = {
  eventId: "11111111-1111-4111-8111-111111111111",
  tableId: "22222222-2222-4222-8222-222222222222",
  proposalId: "33333333-3333-4333-8333-333333333333",
  mode: "submit-game",
  gameId: 42,
  gameName: "Game [owned]",
  gameQuery: "owned",
  proposerName: "player.name",
  proposalOffset: 6,
};
function run(change = {}, env = {}) {
  const output: {
    eventProposal?: {
      submitting: boolean;
      review: string;
      select: string;
      pages: number;
      rowId: string;
      result: string;
    };
  } = {};
  runInNewContext(script, {
    EVENT_PROPOSAL_FIXTURE_ACK: "owned-disposable-event-proposals",
    EVENT_PROPOSAL_BUILD_ACK: "owned-preview-build",
    EVENT_PROPOSAL_LOCALE: "en",
    EVENT_PROPOSAL_INPUT: JSON.stringify({ ...input, ...change }),
    ...env,
    output,
  });
  if (!output.eventProposal) throw new Error("Missing guarded selectors");
  return output.eventProposal;
}
it.each(["en", "it"])(
  "escapes names and keeps real submit/accept/reject branches distinct: %s",
  (locale) => {
    const a = run({}, { EVENT_PROPOSAL_LOCALE: locale });
    expect(a.submitting).toBe(true);
    expect(
      new RegExp(a.select).test(`${locale === "it" ? "Seleziona" : "Select"}: Game [owned]`),
    ).toBe(true);
    const b = run({ mode: "accept" }, { EVENT_PROPOSAL_LOCALE: locale });
    expect(b.submitting).toBe(false);
    expect(b.pages).toBe(1);
    expect(
      new RegExp(b.review).test(
        `${locale === "it" ? "Accetta proposta" : "Accept proposal"}: player.name — Game [owned]`,
      ),
    ).toBe(true);
    expect(b.rowId).toBe("event-proposal-" + input.proposalId);
    expect(run({ mode: "reject" }, { EVENT_PROPOSAL_LOCALE: locale }).result).not.toBe(b.result);
  },
);
it("escapes every grouped proposer in the one collective decision selector", () => {
  const grouped = run({ mode: "accept", proposerNames: ["alice[1]", "bob.name"] });
  expect(
    new RegExp(grouped.review).test("Accept proposal: alice[1], bob.name — Game [owned]"),
  ).toBe(true);
});
it.each([
  { EVENT_PROPOSAL_FIXTURE_ACK: "" },
  { EVENT_PROPOSAL_BUILD_ACK: "" },
  { EVENT_PROPOSAL_LOCALE: "fr" },
])("requires owned fixture/current build/locale: %j", (env) =>
  expect(() => run({}, env)).toThrow(),
);
it.each([
  { eventId: "bad" },
  { tableId: "bad" },
  { mode: "guess" },
  { gameId: 0 },
  { gameName: "" },
  { gameQuery: "abc" },
  { proposalOffset: 25 },
  { proposalOffset: -1 },
  { mode: "accept", proposalId: "bad" },
  { mode: "reject", proposerName: "" },
  { mode: "accept", proposerNames: "alice" },
  { mode: "accept", proposerNames: ["alice"] },
  { mode: "accept", proposerNames: ["alice", ""] },
  { mode: "accept", proposerNames: ["alice", 3] },
  { mode: "accept", proposerNames: ["alice", "b".repeat(121)] },
])("rejects unsafe or incomplete real-write inputs: %j", (change) =>
  expect(() => run(change)).toThrow(),
);
