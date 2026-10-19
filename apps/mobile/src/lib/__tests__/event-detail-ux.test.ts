import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../components/events/${file}.tsx`, import.meta.url), "utf8");
it("owns date/location votes on event and game votes only on accepted table registrations", () => {
  const event = source("EventDetail"),
    table = source("EventTable");
  expect(event).toMatch(/kind:\s*"date"/);
  expect(event).toMatch(/kind:\s*"location"/);
  expect(event).toContain("<EventVoteLegend");
  expect(source("EventVoteLegend")).toContain("Pending invitations reserve a place");
  expect(table).toMatch(/kind:\s*"game"/);
  expect(table).toMatch(/myRegistration\?\.status\s*===\s*"ACCEPTED"/);
  expect(event).not.toContain("useMatch");
  expect(table).not.toContain("matchId");
});
it("keeps manual agreement confirmation/replanning independent of cutoff and terminal result editing", () => {
  const event = source("EventDetail");
  for (const cap of ["canConfirm", "canReplan", "canFinalize"]) expect(event).toContain(cap);
  expect(event).toContain(
    "Votes, invitations and waiting priorities are retained. The booking cutoff is not extended.",
  );
  expect(event).toContain("GAME_DISAGREEMENT");
  expect(event).toContain("Could not");
});
it("uses paged real table cards and loads missing detail fields without replacing usable content", () => {
  expect(source("EventDetail")).toContain("<EventTableCard");
  expect(source("EventTable")).toContain("Could not load complete table details");
  expect(source("EventTable")).toContain("eventTablePeople");
  expect(source("EventTable")).toContain("<ScoreIdentity");
  expect(source("EventTable")).toContain("groupDelta");
});
