import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Structural contracts only. Maestro/manual native runs own actual rendering and gestures.
const source = (feature: string, file: string) =>
  readFileSync(new URL(`../../components/${feature}/${file}.tsx`, import.meta.url), "utf8");
it("routes grouped creation to Group Events and keeps public table time/demo and invitation controls platform-owned", () => {
  const wizard = source("events", "EventWizard"),
    editor = source("events", "EventDraftTableEditor"),
    field = source("events", "EventDateTimeField");
  expect(wizard).toContain('pathname: "/group/[groupId]"');
  expect(wizard).toContain('tab: "events"');
  expect(editor).toContain("publicTableTimeBounds");
  expect(editor).toContain('mode="time"');
  expect(editor).toContain("const day = eventStartWall.slice(0, 10)");
  expect(editor).toContain("day={day}");
  expect(editor).toContain("<UserListRow");
  expect(editor).toContain("<AddUserRow");
  expect(field).toContain('mode === "time" && (min || max)');
  expect(field).toContain("<EventBoundedTimePicker");
  const invite = source("groups", "GroupInvitationCard");
  expect(invite).toContain('alignSelf: "center"');
  expect(invite).toContain('t("Accept")');
  expect(invite).toContain('t("Decline")');
  expect(invite).toContain("<Check");
  expect(invite).toContain("<X");
  expect(source("groups", "GroupPeoplePicker")).toContain("invitationGroupId={groupId}");
});
it("keeps native time picking independent from choosing an event day, without removing bounds or cancellation", () => {
  const text = source("events", "EventDateTimeField");
  expect(text).toContain("DateTimePickerAndroid.open");
  expect(text).not.toMatch(/mode\s*===\s*"time"\s*&&\s*!day/);
  expect(text).toContain('timeZoneName: "UTC"');
  expect(text).toContain("min && next < min");
  expect(text).toContain("max && next > max");
  expect(text).toContain('event.type !== "set" || !date');
  expect(text).toContain('timeEvent.type === "set" && time');
  expect(text).toContain('mode === "datetime" ? "date" : mode');
  expect(source("events", "EventWallDateTime")).toContain('mode="datetime"');
  expect(text).toContain("<SearchHelpLabel");
});
it("keeps date/time proposals and verified location add slots available only for private Groups", () => {
  const schedule = source("events", "EventScheduleFields");
  expect(schedule).toContain("form.flexibleSchedule || !draft.dates.length");
  expect(schedule).toContain("form.flexibleSchedule || !draft.locations.length");
  expect(schedule).toContain("MAX_EVENT_OPTIONS");
  expect(schedule).toContain('mode="datetime"');
  expect(schedule).toContain("onChange={form.addDate}");
  expect(schedule).not.toContain('t("Common start time")');
  expect(schedule).toContain('eventDateWall(draft, date).replace("T", " ")');
  const card = source("events", "EventTableSummaryCard");
  expect(card).toContain("<LinkedListCard");
  expect(card).toContain("onPress={() =>");
  expect(card).toContain("<AnimatedDicebearArtwork");
  expect(card).toContain("<EventTableRatingBadge");
  const badge = source("events", "EventTableRatingBadge");
  expect(badge).toContain('variant={enabled ? "primary" : "secondary"}');
  expect(badge).toContain('color={enabled ? "accent" : "default"}');
  expect(badge).toContain("color={enabled ? accentForeground : foreground}");
  expect(badge).toContain('<Chip.Label>{t("Rating")}</Chip.Label>');
  const preview = source("events", "EventCard");
  expect(preview).toContain("titleAccessory=");
  expect(preview).toContain("eventRecordPreviewDate(event)");
  expect(preview).toContain(
    '<DateTimeInfo startsAt={`${eventDateWall(event, date)}Z`} timeZone="UTC" />',
  );
  expect(preview).not.toContain("eventRecordDisplayTimeZone");
  expect(preview).toMatch(/<UsersRound[^>]*\/>\s*<Typography/);
  expect(preview).toContain("<UsersRound");
  expect(preview).toContain("<Dices");
  expect(preview).toContain("<EventStatusBadge");
  expect(source("events", "EventStatusBadge")).toContain('"warning"');
});
it("uses a centered spaced stage strip, arrow-only Next/Back, platform fields and virtualized table cards", () => {
  const text = source("events", "EventWizard");
  expect(text).toContain("paddingTop: 32");
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
  expect(table).toContain("max={row.maxPlayers}");
  expect(table).toContain("min={row.minPlayers}");
  expect(source("events", "EventDraftTableCard")).toContain(
    'seed={row.id ?? row.key} variant="shapes"',
  );
  expect(source("events", "EventDraftTableCard")).toContain("<EventTableRatingBadge");
  expect(table).toContain("value <= min");
  expect(table).toContain("value >= max");
  expect(table).toContain('alignItems: "flex-end"');
  expect(table).toContain('variant="danger"');
  expect(table).toContain("color={dangerForeground}");
  expect(source("events", "EventWizardSummary")).not.toContain("onPress=");
});
it("keeps draft Table game previews compact and their extra-game count localized", () => {
  const card = source("events", "EventDraftTableCard");
  expect(card).toContain('row.games[0]?.name ?? t("Unknown")');
  expect(card).toContain("Math.max(0, row.games.length - 1)");
  expect(card).toContain("<Dices");
  expect(card).toContain("remaining > 0");
  expect(card).toContain("+{remaining}");
  expect(card).toContain('id: "event.table.moreGames"');
  expect(card).not.toContain('row.games.map((game) => game.name).join(", ")');
});
it("uses the same grouped datetime component for public Start, End and Cutoff in creation and editing", () => {
  const schedule = source("events", "EventScheduleFields");
  for (const label of ["Start Date and Time", "End Date and Time", "Booking cutoff"]) {
    expect(schedule).toMatch(new RegExp(`<EventWallDateTime\\s+label=\\{t\\("${label}"\\)\\}`));
  }
  const start = schedule.match(
    /<EventWallDateTime\s+label=\{t\("Start Date and Time"\)\}[\s\S]*?\/>/,
  )?.[0];
  expect(start).toBeDefined();
  expect(start).not.toContain("rowOnly");
  expect(start).toContain("help={dayHelp}");
  expect(start).toContain("value={startWall}");
  expect(start).toContain("timeZone={draft.timeZone}");
  expect(start).toContain("isDisabled={busy}");
  expect(start).toContain('fieldError("dates") || fieldError("startTime")');
  expect(start).toContain("onChange={form.setStartDate}");
  expect(source("events", "EventWallDateTime")).not.toContain("rowOnly");
  expect(source("events", "EventDateTimeField")).toContain("rowOnly = false");
  expect(source("events", "EventDateTimeField")).toContain("<GroupedList>{row}</GroupedList>");
});
it("uses public combined pickers with valid time bounds before the final Location field and no public removal action", () => {
  const schedule = source("events", "EventScheduleFields"),
    field = source("events", "EventDateTimeField"),
    bounded = source("events", "EventBoundedTimePicker");
  expect(schedule).toContain("form.publicGroup");
  expect(schedule).toContain('t("Start Date and Time")');
  expect(schedule).toContain('t("End Date and Time")');
  expect(schedule).toContain("onChange={form.setStartDate}");
  expect(schedule.indexOf('label={t("End Date and Time")}')).toBeLessThan(
    schedule.indexOf('label={t("Booking cutoff")}'),
  );
  expect(schedule.indexOf('label={t("Booking cutoff")}')).toBeLessThan(
    schedule.indexOf('label={t("Location")}'),
  );
  expect(schedule).toContain("min={bounds.endMin}");
  expect(schedule).toContain("max={bounds.endMax}");
  expect(schedule).toContain("max={bounds.cutoffMax}");
  expect(field).toContain("<EventBoundedTimePicker");
  expect(bounded).toContain("allowedEventTimes(");
  expect(bounded).toContain("<FlatList");
  expect(source("events", "EventTable")).not.toContain('t("Back to event")');
});
it("centers the group tab strip itself below the header instead of relying on child alignment", () => {
  const text = source("groups", "GroupDetail");
  expect(text).toMatch(/alignSelf: "center", marginTop: 16, maxWidth: "100%"/);
});
it("keeps owner-only irreversible deletion in the native header, resets it on access loss and requires explicit cascade consent", () => {
  const text = source("groups", "GroupDetail");
  expect(text).toContain("headerRight:");
  expect(text).toContain("group?.canEdit");
  expect(text).toContain('t("Delete group") : t("Leave group")');
  expect(text).toContain("<LogOut");
  expect(text).toContain("<GroupInvitationCard");
  expect(text).toContain("<Trash2");
  expect(text).toContain("deleteEvents: true");
  expect(text).toContain('t("Delete group and events")');
  expect(text.indexOf("headerRight:")).toBeLessThan(text.indexOf("if (!group)"));
  expect(text).toContain('router.replace("/(tabs)/groups")');
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
