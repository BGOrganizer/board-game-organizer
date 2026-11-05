import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (feature: string, file: string) =>
  readFileSync(new URL(`../../components/${feature}/${file}.tsx`, import.meta.url), "utf8");
// Source contracts only; these do not prove native rendering, navigation or gestures.
it("owns confirmed/terminated Table top tabs with platform-specific virtualized overview/results/current ranking", () => {
  const tabs = source("events", "EventTable");
  expect(tabs).toMatch(/<TabTrigger value="overview"[^>]*>/);
  expect(tabs).toContain('<NotificationTabBadge target={{ kind: "table", id: tableId }} />');
  expect(tabs).toContain('<TabTrigger value="ranking">');
  expect(tabs).toContain('<TabTrigger value="results">');
  expect(tabs).toContain('table.eventStatus === "TERMINATED"');
  expect(tabs).toContain('table.eventStatus === "PLANNING"');
  expect(tabs).toContain("<EventTableOverview");
  expect(tabs).toContain("<EventTableResults");
  expect(tabs).toContain("<EventTableLeaderboard");
  expect(tabs).not.toContain("<ScrollView");
  expect(source("events", "EventTableOverview")).toContain("<EventTableSeats");
  for (const file of ["EventTableResults", "EventTableLeaderboard"]) {
    expect(source("events", file)).toContain("<FlatList");
    expect(source("events", file)).toContain("useSafeAreaInsets");
  }
  const results = source("events", "EventTableResults");
  expect(results).toContain("table.rankingEnabled && table.groupId");
  expect(results).toMatch(/table.rankingEnabled\s*\? table.ratingChanges/);
  expect(results).toContain('t("Group ranking")');
  expect(results).toContain('t("Global ranking")');
  expect(source("events", "EventTableLeaderboard")).toContain("table.confirmed?.gameId");
});
it("places admin result registration on included confirmed Tables and finalization in the Event header", () => {
  const detail = source("events", "EventDetail"),
    table = source("events", "EventTable"),
    action = source("events", "EventFinalizeAction");
  expect(detail).toContain("<EventFinalizeAction");
  expect(detail).not.toContain("<ClipboardPenLine");
  expect(table).toContain("<ClipboardPenLine");
  expect(table).toContain("canManageEvent(event.data, o.userId)");
  expect(table).toContain("table.confirmed");
  expect(table).toContain('table.eventStatus === "CONFIRMED"');
  expect(action).toContain("event.resultsReady !== true");
  expect(action).toContain("<ConfirmDialog");
  expect(action).toContain("Excluded tables do not require results.");
  expect(action).toContain("<Flag");
  expect(detail).toContain('variant="secondary"');
});
it("edits one server-backed Table result with a singular header and no Event finalization control", () => {
  const results = source("events", "EventResults"),
    card = source("events", "EventResultTableCard");
  expect(results).toContain('t("Register result")');
  expect(results).toContain("useEventResultsForm(o, eventId, tableId)");
  expect(results).toContain("f.save(input");
  expect(results).not.toContain("f.finalize()");
  expect(results).not.toContain("<EventResultTableCard");
  expect(results).toContain("headerBackOptions");
  expect(source("events", "TableScoreEditor")).not.toContain('t("Back to tables")');
  expect(source("events", "EventTableOverview")).toContain('t("Event")');
  expect(source("events", "EventTableOverview")).toContain('variant="constellation"');
  expect(source("events", "EventTableSeats")).toContain("setJoining(true)");
  expect(source("events", "EventJoinSheet")).toContain('value="games"');
  expect(source("events", "EventJoinSheet")).toContain('votingTabs.includes("games")');
  expect(source("events", "EventJoinSheet")).toContain("<FixedSettings");
  expect(source("events", "EventDetail")).toContain("eventAvailabilityVoteIsAllowed");
  expect(source("events", "TableScoreEditor")).toContain('t("Save result")');
  expect(card).toContain("<ListCard>");
  expect(card).toContain("<ListCardBody");
  expect(card).toContain("<CircleCheck");
  expect(card).toContain("right: 0");
  expect(card).toContain("bottom: 0");
  expect(card).toContain('"success"');
});
it("gives Group ranking the same horizontal inset as other native Group destinations", () => {
  expect(source("groups", "GroupDetail")).toMatch(/paddingHorizontal: 20[\s\S]*?<GroupLeaderboard/);
});
