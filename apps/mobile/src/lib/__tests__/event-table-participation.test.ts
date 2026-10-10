import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
it("keeps framework entries small and points both entrances at the canonical table/match content", () => {
  expect(source("app/event/table.tsx")).toContain("<EventTable");
  expect(source("app/match/[matchId].tsx")).toContain("<MatchDetail");
  const table = source("components/events/EventTable.tsx");
  expect(table).toContain("useEventTableMatch(options, table?.matchId)");
  expect(table).toContain("<MatchDetail");
  expect(table).toContain('testID="table-players-tab"');
  const match = source("components/matches/MatchDetail.tsx");
  for (const component of [
    "<EventTableHeading",
    "<EventTableOverview",
    "<EventTablePlayers",
    "<EventTableEditAction",
  ])
    expect(match).toContain(component);
  expect(match).not.toContain('t("Open event table")');
  expect(match).toContain('match?.status === "TERMINATED" && activeTab === "players"');
});
it("virtualizes event participants outside the ordinary match scroll container", () => {
  const players = source("components/events/EventTablePlayers.tsx");
  expect(players).toContain("<UserList");
  expect(players).not.toContain("ScrollView");
  expect(players).toContain('testID="event-table-players"');
  const match = source("components/matches/MatchDetail.tsx");
  expect(match).toContain('match?.eventTable && activeTab === "players" ? View : ScreenScrollView');
});
it("uses seat icons, pending status and membership-style decisions without organization bans", () => {
  const players = source("components/events/EventTablePlayers.tsx");
  for (const text of [
    "Armchair",
    "ClipboardCheck",
    "Clock3",
    't("Accept")',
    't("Reject")',
    "onCancel={flow.dismiss}",
    't("Awaiting admin approval")',
    't("Reserved place")',
  ])
    expect(players).toContain(text);
  expect(players).toContain("You will be notified when it is accepted or rejected.");
  expect(players).not.toContain('t("Ban")');
  expect(players).toContain('mode === "manage" ? "approve" : "accept"');
});
it("uses the creator-only contextual table editor, never an ordinary match edit route", () => {
  const fab = source("components/events/EventTableEditAction.tsx");
  expect(fab).toContain('event?.role !== "admin"');
  expect(fab).toContain('pathname: "/event/table-edit"');
  expect(fab).toContain('table.status !== "PLANNING"');
  expect(fab).toContain("!event.canModify || !open");
  expect(source("app/event/table-edit.tsx")).toContain("<EventTableEdit");
  const editor = source("components/events/EventTableEdit.tsx");
  expect(editor).toContain("useState(event.version)");
  expect(editor).toContain("eventTableEditInput({ ...event, version }, draft.input)");
  expect(editor).toContain('t("Reset reservations")');
  expect(editor).toContain("if (actions.busy) return");
});
it("keeps the label/icon/name and accent Rating badge free of the voting legend", () => {
  const heading = source("components/events/EventTableHeading.tsx");
  for (const text of ["LayoutGrid", 't("Table name")', 't("Rating")', 'color="accent"', "Trophy"])
    expect(heading).toContain(text);
  expect(heading).not.toContain("VoteLegend");
});
it("keeps page Back separate from table/location and wizard-step Back", () => {
  const wizard = source("components/events/EventWizard.tsx");
  expect(wizard).toContain('testID="event-wizard-header-back"');
  expect(wizard).toContain("goBackFromEventWizard");
  expect(wizard).toContain("headerBackVisible: false");
  expect(wizard).toContain("minHeight: 44");
  expect(source("components/events/EventTableEditor.tsx")).toContain(
    'testID="event-table-header-back"',
  );
});
