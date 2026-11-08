import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Source contracts only. They do not establish native rendering/gesture acceptance.
const source = (feature: string, file: string) =>
  readFileSync(new URL(`../../components/${feature}/${file}.tsx`, import.meta.url), "utf8");
it("owns three top Group tabs, limits owned lists to member roles, and confines edit/create FABs to their contexts", () => {
  const tabs = source("groups", "Groups");
  expect(tabs).toContain('value="private"');
  expect(tabs).toContain('value="public"');
  expect(tabs.indexOf('value="private"')).toBeLessThan(tabs.indexOf('value="public"'));
  expect(tabs.indexOf('value="public"')).toBeLessThan(tabs.indexOf('value="search"'));
  expect(source("groups", "GroupList")).toContain(
    'useListSearch(groupRecordMemberRoles, scope === "mine" ? 0 : 4)',
  );
  expect(source("groups", "GroupList")).toContain('key: "invited"');
  expect(tabs).toContain('value="search"');
  expect(tabs).toContain('section === "search" ? "public" : "mine"');
  expect(source("groups", "GroupList")).not.toContain('t("Search public groups")');
  expect(source("groups", "GroupDetail")).toContain('group.canEdit && tab === "info"');
  expect(source("events", "Events")).not.toContain("left={Boolean(groupId)}");
});
it("uses first-step header back, compact reachable counters, row game selection and context-aware review", () => {
  const wizard = source("events", "EventWizard");
  expect(wizard).toContain("step > 0 ? (");
  expect(wizard).toContain("...headerBackOptions(() => router.back())");
  expect(wizard).toContain("<CalendarPlus");
  expect(wizard).toContain('params: { section: "available" }');
  expect(wizard).toContain('pathname: "/(tabs)/events"');
  expect(source("groups", "GroupWizard")).toContain('"/(tabs)/groups"');
  const editor = source("events", "EventDraftTableEditor");
  expect(editor).not.toContain('t("Add game")');
  expect(editor).toContain('name={t("Choose a game")}');
  expect(editor).toContain("hitSlop={4}");
  expect(editor).toContain("minWidth: 36");
  expect(source("events", "EventDraftTableCard")).toContain(
    "publicGroup || row.demonstratorUserId",
  );
  expect(source("games", "GamePicker")).toContain("<HeaderBackButton onPress={onClose}");
  const back = source("common/layout", "HeaderBackButton");
  expect(back).toContain('label ?? t("Back")');
  expect(back).toContain("<ArrowLeft size={HEADER_ICON_SIZE}");
  expect(back).toContain("onPress={onPress}");
});
it("resets header confirmation on access loss, preserves cutoff/manual version guards and labels metadata", () => {
  const detail = source("events", "EventDetail");
  expect(detail.indexOf("headerRight:")).toBeLessThan(detail.indexOf("if (!event)"));
  expect(detail).toContain("canManageEvent(event, o.userId)");
  expect(detail).toContain("confirmationBlocked");
  expect(detail).toContain("event?.agreement?.agreed !== true");
  expect(detail).toContain("{...headerButtonProps}");
  expect(detail).toContain("hitSlop={4}");
  expect(detail.indexOf("event.agreement?.reasons.map")).toBeLessThan(
    detail.indexOf("if (!event)"),
  );
  expect(detail).not.toContain('t("Agreement available. Confirmation remains manual.")');
  expect(detail).toContain('t("Why confirmation is unavailable")');
  expect(detail).toContain("<EventDetailsCard");
  const identity = source("events", "EventDetailsCard");
  expect(detail).toContain('t("Details")');
  expect(identity).toContain("background=");
  expect(detail).toContain("<EventVoteLegend");
  expect(identity).toContain("seed={event.id}");
  expect(identity).toContain('variant="constellation"');
  expect(identity).toContain("<CalendarDays");
  expect(identity).not.toContain("/group/[groupId]");
  expect(detail).toContain("<EventGroupLink");
  expect(source("events", "EventGroupLink")).toContain("<GroupArtwork");
  expect(source("events", "EventGroupLink")).toContain('t("Group")');
  expect(identity).toContain("<EventStatusBadge status={event.status}");
  expect(source("events", "EventStatusBadge")).toContain('"warning"');
  expect(detail).toContain('t("Start Date and Time")');
  expect(detail).toContain('t("Date and time")');
  expect(detail).toContain("<DateTimeInfo");
  expect(detail).not.toContain("eventRecordDisplayTimeZone");
  expect(identity).toContain('className="text-lg font-semibold text-foreground"');
  expect(identity).toContain('presentation="background"');
  expect(detail).toMatch(/event\?\.status\s*===\s*"CONFIRMED"[\s\S]*?<EventFinalizeAction/);
  expect(source("events", "EventFinalizeAction")).toContain("event.canFinalize");
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
  expect(table.indexOf("<ListCard")).toBeLessThan(table.indexOf('label={t("Settings")}'));
  expect(table).toContain('presentation="background"');
  expect(table).toContain("seed={table.id}");
  expect(table).toContain('variant="planets"');
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
it("shares one horizontal Table card across feeds with only Back context varying", () => {
  const card = source("events", "EventTableCard");
  const indicators = source("events", "EventTableCardIndicators");
  expect(source("events", "TableList")).toContain('context="personal"');
  expect(source("events", "EventDetail")).toContain('context="event"');
  expect(card).toContain('context === "event"');
  expect(card).toContain('artworkLayout="cover"');
  expect(card).toContain('presentation="cover"');
  expect(card).toContain('variant="planets"');
  expect(card).toContain("leadingActions=");
  expect(card).not.toContain("<IconLegend");
  expect(source("events", "TableListHeading")).toContain("<IconLegend");
  expect(source("events", "TableList")).toContain("<TableListHeading");
  expect(source("events", "EventDetail")).toContain("<TableListHeading");
  expect(card).toContain('flexWrap: "wrap"');
  expect(indicators).toContain("<EventTableGamesPopover");
  for (const field of [
    "minPlayers",
    "maxPlayers",
    "acceptedCount",
    "waitingCount",
    "pendingRegistrationCount",
  ])
    expect(card + indicators).toContain(`table.${field}`);
  expect(card).toContain('id: "table.card.participants"');
  expect(indicators).toContain('t("Rating enabled")');
  expect(card).not.toContain("<EventTableInvitationActions");
  expect(source("events", "EventTableSeats")).toContain("<EventTableInvitationActions");
  expect(indicators).toContain("table.demonstratorUserId");
  expect(card).not.toContain('t("Reserved place")');
});
