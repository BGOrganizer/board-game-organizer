import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Source ownership/composition policy, separate from real native UI assertions.
it("uses actual HeroUI background compositions and keeps the existing API-owned roster hook", () => {
  const source = (file: string) =>
    readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  for (const file of [
    "events/EventDetailsCard",
    "events/EventTableInfo",
    "groups/GroupIdentityCard",
  ]) {
    expect(source(file)).toContain("background=");
    expect(source(file)).toContain('presentation="background"');
  }
  const table = source("events/EventTable");
  expect(table.indexOf("<EventTableInfo")).toBeLessThan(table.indexOf("<Tabs value="));
  expect(table).toContain('value="participants"');
  expect(table).toContain("table.sharedResultsOnly");
  expect(table).toContain('table.eventStatus !== "PLANNING"');
  const roster = source("events/EventTableSeats");
  expect(roster).toContain("useEventTableRoster(o, table)");
  expect(roster).toContain("activePanel.current &&");
  expect(roster).toContain("roster.waitingRows");
});
