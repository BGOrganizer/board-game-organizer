import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (feature: string, file: string) =>
  readFileSync(new URL(`../../components/${feature}/${file}.tsx`, import.meta.url), "utf8");
// Source contracts only; these do not prove native rendering, navigation or gestures.
it("owns confirmed/terminated Table top tabs with platform-specific virtualized overview/results/current ranking", () => {
  const tabs = source("events", "EventTable");
  expect(tabs).toContain('<Tabs.Trigger value="overview">');
  expect(tabs).toContain('<Tabs.Trigger value="ranking">');
  expect(tabs).toContain('<Tabs.Trigger value="results">');
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
it("keeps owner-only icon header registration/replan FAB and semantic confirmation/finalization icons", () => {
  const detail = source("events", "EventDetail"),
    results = source("events", "EventResults");
  for (const icon of ["CalendarCheck", "RotateCcw", "ClipboardPenLine"])
    expect(detail).toContain(`<${icon}`);
  expect(detail).toContain("event.adminUserId === o.userId");
  expect(detail).toContain('variant="secondary"');
  expect(detail).not.toContain('<Button.Label>{t("Reopen planning")}</Button.Label>');
  expect(results).toContain("<Flag");
  expect(results).toContain("<ConfirmDialog");
  expect(results).toContain('t("Tables list")');
  expect(results).toContain("Record results for every table to finalize the event.");
  expect(results).toContain("All-ND tables do not change ratings or statistics.");
});
it("keeps staged table-result cards, explicit completion artwork and plural/singular screen titles without discarding other drafts", () => {
  const results = source("events", "EventResults"),
    card = source("events", "EventResultTableCard");
  expect(results).toContain('t("Register Table Result")');
  expect(results).toContain('t("Register Tables Results")');
  expect(results).toContain("<EventResultTableCard");
  expect(results).toContain("ready={Boolean(f.scores[item.id])}");
  expect(results).toContain("hardwareBackPress");
  expect(results).toContain("f.close()");
  expect(results).toContain("headerLeft:");
  expect(source("events", "TableScoreEditor")).not.toContain('t("Back to tables")');
  expect(source("events", "EventTableOverview")).toContain('t("Event")');
  expect(source("events", "EventTableOverview")).toContain('variant="constellation"');
  expect(source("events", "EventTableSeats")).toContain(
    'table.groupType === "PRIVATE" && !hasJoinedEvent',
  );
  expect(source("events", "EventDetail")).toContain("eventAvailabilityVoteIsAllowed");
  expect(results).toContain("f.finalize()");
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
