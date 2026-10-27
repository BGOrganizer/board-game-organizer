import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Source contracts only. They do not establish native rendering/gesture acceptance.
const source = (feature: string, file: string) =>
  readFileSync(new URL(`../../components/${feature}/${file}.tsx`, import.meta.url), "utf8");
it("owns two top Group tabs, retains consent filters, and confines edit/create FABs to their contexts", () => {
  const tabs = source("groups", "Groups");
  expect(tabs).toContain('value="groups"');
  expect(tabs).toContain('value="search"');
  expect(tabs).toContain('section === "search" ? "public" : "mine"');
  expect(source("groups", "GroupList")).not.toContain('t("Search public groups")');
  expect(source("groups", "GroupDetail")).toContain('group.canEdit && tab === "info"');
  expect(source("events", "Events")).not.toContain("left={Boolean(groupId)}");
});
it("uses first-step header back, compact reachable counters, row game selection and context-aware review", () => {
  const wizard = source("events", "EventWizard");
  expect(wizard).toContain("step > 0 ? (");
  expect(wizard).toContain("headerBackVisible: true");
  expect(wizard).toContain("<CalendarPlus");
  expect(wizard).toContain('router.dismissTo("/(tabs)/events")');
  expect(source("groups", "GroupWizard")).toContain('"/(tabs)/groups"');
  const editor = source("events", "EventDraftTableEditor");
  expect(editor).not.toContain('t("Add game")');
  expect(editor).toContain('name={t("Choose a game")}');
  expect(editor).toContain("hitSlop={4}");
  expect(editor).toContain("minWidth: 36");
  expect(source("events", "EventDraftTableCard")).toContain(
    "publicGroup || row.demonstratorUserId",
  );
  expect(source("games", "GamePicker")).toMatch(
    /accessibilityLabel=\{t\("Back"\)\}[\s\S]*?<ArrowLeft/,
  );
});
it("resets header confirmation on access loss, preserves cutoff/manual version guards and labels metadata", () => {
  const detail = source("events", "EventDetail");
  expect(detail.indexOf("headerRight:")).toBeLessThan(detail.indexOf("if (!event)"));
  expect(detail).toContain("event?.adminUserId === o.userId");
  expect(detail).toContain("confirmationBlocked");
  expect(detail).toContain("event?.agreement?.agreed !== true");
  expect(detail).toContain("minWidth: 36");
  expect(detail).toContain("hitSlop={4}");
  expect(detail.indexOf("event.agreement?.reasons.map")).toBeLessThan(
    detail.indexOf("if (!event)"),
  );
  expect(detail).not.toContain('t("Agreement available. Confirmation remains manual.")');
  expect(detail).toContain('t("Why confirmation is unavailable")');
  expect(detail).toContain("<EventDetailsCard");
  const identity = source("events", "EventDetailsCard");
  expect(identity).toContain('t("Details")');
  expect(identity).toContain("<Info");
  expect(identity).toContain("<EventVoteLegend");
  expect(identity).toContain('<AnimatedDicebearArtwork seed={event.id} variant="constellation"');
  expect(identity).toContain("<CalendarDays");
  expect(identity).toContain("<UsersRound");
  expect(identity).toContain("<EventStatusBadge status={event.status}");
  expect(source("events", "EventStatusBadge")).toContain('"warning"');
  expect(detail).toContain('t("Start Date and Time")');
  expect(detail).toContain('t("Date and time")');
  expect(detail).toContain("<DateTimeInfo");
  expect(detail).not.toContain("eventRecordDisplayTimeZone");
  expect(identity).toContain('className="text-base font-normal text-foreground"');
  expect(identity.indexOf("<EventVoteLegend")).toBeLessThan(identity.indexOf("<ListCard>"));
  expect(detail).toMatch(/event\?\.status\s*===\s*"CONFIRMED"[\s\S]*?event.canFinalize/);
  expect(detail).toContain("<ClipboardPenLine");
  expect(detail).toContain("<RotateCcw");
  expect(detail).toContain("<CalendarCheck");
  expect(detail).toContain("<GroupedList");
  expect(detail).toContain("<FloatingActions");
  expect(detail).toContain("version: event.version");
});
it("places Table Settings help before the identity card and keeps limits inside with Rating", () => {
  const table = source("events", "EventTableInfo");
  expect(table).toContain('label={t("Settings")}');
  expect(table).toContain("The minimum is required for agreement.");
  expect(table.indexOf('label={t("Settings")}')).toBeLessThan(table.indexOf("<ListCard>"));
  expect(table).toContain('<AnimatedDicebearArtwork seed={table.id} variant="planets"');
  expect(table).toContain("<Dices");
  expect(table).toContain("<EventTableRatingBadge");
  for (const token of [
    "<UserRoundCheck",
    "<UsersRound",
    "number.format(table.minPlayers)",
    "number.format(table.maxPlayers)",
  ])
    expect(table).toContain(token);
  expect(table).not.toContain('label={t("Table name")}');
});
it("shares one Table card across personal/Event lists with only the parent metadata row varying", () => {
  const card = source("events", "EventTableCard");
  expect(source("events", "Tables")).toContain('context="personal"');
  expect(source("events", "EventDetail")).toContain('context="event"');
  expect(card).toContain('context === "personal"');
  expect(card).toContain('variant="planets"');
  expect(card).toContain("leadingActions=");
  expect(card).toContain("<IconLegend");
  expect(card).toContain("horizontal");
  for (const field of [
    "minPlayers",
    "maxPlayers",
    "acceptedCount",
    "waitingCount",
    "pendingRegistrationCount",
  ])
    expect(card).toContain(`table.${field}`);
  expect(card).toContain('id: "event.table.moreGames"');
  expect(card).toContain("<EventTableRatingBadge");
  expect(card).toContain("<EventTableInvitationActions");
  expect(card).toContain("table.demonstratorUserId");
  expect(card).not.toContain('t("Reserved place")');
});
