import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../components/events/${file}.tsx`, import.meta.url), "utf8");
it.each(["EventDetail", "EventTable", "EventTableCard", "EventInvitationPicker"])(
  "uses exact boundary timer in %s instead of waiting for a list refetch",
  (name) => expect(source(name)).toContain("useEventCutoff"),
);
it("never creates a synthetic Match or organizer seat from a table link", () => {
  for (const name of ["EventTable", "EventInvitationPicker", "EventResults", "EventWizard"]) {
    expect(source(name)).not.toContain("useMatch");
    expect(source(name)).not.toContain("/match/");
  }
  expect(source("EventWizard")).toContain("organizer has no automatic playing seat");
});
it("preserves whole-event immutable result finalization with per-table draft scores and genuine sheet interactions", () => {
  expect(source("EventResults")).toContain("Finalization is atomic and irreversible.");
  expect(source("EventResults")).toContain("f.finalize()");
  expect(source("EventResults")).toContain("<ConfirmDialog");
  expect(source("TableScoreEditor")).toMatch(/onSubmit\(\{\s*lowerWins/);
  expect(source("TableScoreEditor")).toContain("previewTableResults");
  expect(source("TableScoreEditor")).toContain("useBottomSheetAwareHandlers");
});
