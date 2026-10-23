import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Structural contracts only. Maestro/manual native runs own actual rendering and gestures.
const source = (feature: string, file: string) =>
  readFileSync(new URL(`../../components/${feature}/${file}.tsx`, import.meta.url), "utf8");
it("keeps native time picking independent from choosing an event day, without removing bounds or cancellation", () => {
  const text = source("events", "EventDateTimeField");
  expect(text).toContain("DateTimePickerAndroid.open");
  expect(text).not.toMatch(/mode\s*===\s*"time"\s*&&\s*!day/);
  expect(text).toContain('timeZoneName: "UTC"');
  expect(text).toContain("min && next < min");
  expect(text).toContain("max && next > max");
  expect(text).toContain('event.type === "set"');
  expect(text).toContain("<SearchHelpLabel");
});
it("uses a centered spaced stage strip, arrow-only Next/Back, platform fields and virtualized table cards", () => {
  const text = source("events", "EventWizard");
  expect(text).toContain("paddingTop: 16");
  expect(text).toContain('justifyContent: "center"');
  expect(text).toContain("<ArrowLeft");
  expect(text).toContain("<ArrowRight");
  expect(text).toContain("!form.canNext");
  expect(text).toContain("<EventScheduleFields");
  expect(text).toContain("<EventDraftTableCard");
  expect(text).toContain("<FlatList");
  expect(source("events", "EventScheduleFields")).toContain("form.groupLocked");
  expect(source("events", "EventScheduleFields")).not.toContain("onChangeText={(timeZone)");
});
it("owns removal actions inside grouped location/game rows and uses constrained primary player counters", () => {
  const schedule = source("events", "EventScheduleFields"),
    table = source("events", "EventDraftTableEditor");
  expect(schedule).toMatch(/<LocationListRow[\s\S]*?actions=\{/);
  expect(table).toMatch(/<GameListRow[\s\S]*?actions=\{/);
  expect(table).toContain("min={2}");
  expect(table).toMatch(/max=\{row.maxPlayers\s*-\s*1\}/);
  expect(table).toContain("value <= min");
  expect(table).toContain("value >= max");
  expect(table).toContain('alignItems: "flex-end"');
  expect(table).toContain('variant="danger"');
  expect(table).toContain("color={dangerForeground}");
  expect(source("events", "EventWizardSummary")).not.toContain("onPress=");
});
it("offers group bans only through roster actions, with a separate edit FAB and padded detail row", () => {
  expect(source("groups", "GroupMembers")).not.toContain("Exclude a user");
  expect(source("groups", "GroupMembers")).toContain("Ban from group");
  expect(source("groups", "GroupPeoplePicker")).not.toContain("actions.ban");
  expect(source("groups", "GroupDetail")).toContain("<FloatingActions");
  expect(source("groups", "GroupDetailsCard")).toContain("<GroupedRow");
  expect(source("groups", "GroupWizard")).toMatch(/<LocationListRow[\s\S]*?actions=\{/);
  expect(source("groups", "GroupBanDialog")).toContain("<Ban");
});
