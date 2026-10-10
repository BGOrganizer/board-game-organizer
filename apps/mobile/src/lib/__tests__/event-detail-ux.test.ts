// Source contracts, not rendered device acceptance: Playwright/Maestro own the UI.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
it("keeps only a labeled event icon below match artwork and reuses shared legend help", () => {
  const matches = source("app/(tabs)/matches.tsx");
  expect(matches).toContain('testID="event-table-match-badge"');
  expect(matches).toContain("height: eventLabel ? 84 : 64");
  expect(matches).toContain("accessibilityLabel={eventLabel}");
  expect(matches).toContain("<MatchListLegend");
  expect(matches).not.toContain('{t("Event table")}</Typography>');
  const legend = source("components/matches/MatchListLegend.tsx");
  expect(legend).toContain("<HelpPopover");
  expect(legend).toContain("Crown");
  expect(legend).toContain("CalendarDays");
});
it("places guarded cancellation in the header, and keeps the shared edit FAB outside both tabs", () => {
  const detail = source("components/events/EventDetail.tsx");
  expect(detail).toContain("event?.canModify && open");
  expect(detail).toContain('testID="cancel-event-header"');
  expect(detail).toContain('testID="event-tab-details"');
  expect(detail).toContain('testID="event-tab-tables"');
  expect(detail).toContain("<TabBar>");
  expect(detail).toContain("<FlatList");
  expect(detail).toContain('tab === "tables" &&');
  expect(detail).toContain('<EventCard event={event} presentation="detail"');
  expect(detail).toContain("<EventTableCard");
  expect(detail.indexOf('testID="edit-event-fab"')).toBeGreaterThan(detail.indexOf("</Tabs>"));
  expect(detail).toContain("if (!editable || actions.busy) return");
});
it("composes the same table body without draft actions in the read-only event table card", () => {
  const readonly = source("components/events/EventTableCard.tsx");
  expect(readonly).toContain("<EventTableCardBody");
  expect(readonly).not.toMatch(/onEdit|onRemove|Trash2|Pencil/);
  expect(readonly).toContain("confirmedCount");
  expect(readonly).toContain("reservedCount");
  expect(source("components/events/EventDraftTableCard.tsx")).toContain("<EventTableCardBody");
});
