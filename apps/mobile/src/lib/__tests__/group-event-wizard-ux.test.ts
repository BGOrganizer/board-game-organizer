import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Structural contracts only. Maestro/manual native runs own actual rendering and gestures.
const source = (feature: string, file: string) =>
  readFileSync(new URL(`../../components/${feature}/${file}.tsx`, import.meta.url), "utf8");
it("anchors the Group save FAB outside keyboard avoidance while keeping the form scrollable and localized", () => {
  const wizard = source("groups", "GroupWizard");
  expect(wizard).toContain('placeholder={t("Group name")}');
  expect(wizard).toContain('accessibilityLabel={t("Group name")}');
  expect(wizard).toMatch(/<InputFlatList[\s\S]*\/>\s*<FloatingActions/);
  expect(wizard).toContain("<FormInteractionScope");
  expect(wizard).not.toContain("<KeyboardAvoidingView");
  expect(wizard).toContain('keyboardShouldPersistTaps="handled"');
  expect(wizard).toContain("paddingBottom: layout.paddingBottom");
});
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
  expect(field).toContain('mode: mode === "datetime" ? "date" : mode');
  expect(field).toContain("DateTimePickerAndroid.open");
  expect(field).not.toContain("EventBoundedTimePicker");
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
  const card = source("events", "EventTableCard");
  expect(card).toContain("<LinkedListCard");
  expect(card).toContain("onPress={() =>");
  expect(card).toContain("<AnimatedDicebearArtwork");
  expect(source("events", "EventTableCardIndicators")).toContain("<EventTableRatingInfo");
  expect(source("events", "EventTableRatingInfo")).toContain('t("Rating enabled")');
  const rating = source("events", "EventTableRatingInfo");
  expect(rating).toContain('label={enabled ? t("Rating enabled") : t("Rating disabled")}');
  expect(rating).toContain('tone={enabled ? "accent" : "muted"}');
  expect(rating).toContain("icon={enabled ? Trophy : CircleOff}");
  expect(rating).toContain('title={t("Rating")}');
  expect(rating).toContain('triggerClassName="bg-default"');
  const preview = source("events", "EventCard");
  expect(preview).toContain("titleAccessory=");
  expect(source("events", "EventCardIndicators")).toContain(
    '<EventSchedulePopover event={event} kind="dates" />',
  );
  expect(source("events", "EventSchedulePopover")).toContain('timeZone: "UTC"');
  expect(preview).not.toContain("eventRecordDisplayTimeZone");
  expect(preview).toContain('artworkLayout="cover"');
  expect(preview).toContain('presentation="cover"');
  expect(preview).toContain("<UsersRound");
  expect(preview).toContain("<Dices");
  expect(source("events", "EventCardIndicators")).toContain("<HelpPopover");
  expect(source("events", "EventCardIndicators")).toContain("CalendarClock");
  expect(source("events", "EventCardIndicators")).toContain('"warning"');
});
it("uses a centered spaced stage strip, arrow-only Next/Back, platform fields and virtualized table cards", () => {
  const text = source("events", "EventWizard");
  expect(text).toContain("paddingTop: 12");
  expect(text).toContain('justifyContent: "center"');
  expect(text).toContain("<ArrowLeft");
  expect(text).toContain("<ArrowRight");
  expect(text).not.toContain("!form.canNext");
  expect(text).toContain("<FormSubmitButton");
  expect(text).toContain("onPress={form.next}");
  expect(text).toContain("<EventScheduleFields");
  expect(text).toContain("<EventDraftTableCard");
  expect(text).toContain("<InputFlatList");
  expect(source("events", "EventScheduleFields")).toContain("form.groupLocked");
  expect(source("events", "EventScheduleFields")).not.toContain("onChangeText={(timeZone)");
});
it("owns removal actions inside grouped location/game rows and uses constrained primary player counters", () => {
  const schedule = source("events", "EventScheduleFields"),
    table = source("events", "EventDraftTableEditor");
  expect(schedule).toMatch(/<LocationListRow[\s\S]*?actions=\{/);
  expect(table).toMatch(/<GameListRow[\s\S]*?actions=\{/);
  expect(table).toContain("gamePlayerBounds(row.games)");
  expect(table).toContain("min={Math.max(2, playerBounds?.minPlayers ?? 2)}");
  expect(table).toContain(
    "max={Math.min(row.maxPlayers, playerBounds?.maxPlayers ?? row.maxPlayers)}",
  );
  expect(table).toContain("min={Math.max(row.minPlayers, playerBounds?.minPlayers ?? 2)}");
  expect(source("events", "EventDraftTableCard")).toMatch(
    /seed=\{row.id \?\? row.key\}\s+variant="planets"/,
  );
  expect(source("events", "EventDraftTableCard")).toContain("<EventTableRatingInfo");
  expect(table).toContain("value <= min");
  expect(table).toContain("value >= max");
  expect(table).toContain('alignItems: "flex-end"');
  expect(table).toContain('variant="danger"');
  expect(table).toContain("color={dangerForeground}");
  expect(source("events", "EventWizardSummary")).not.toContain("onPress=");
});
it("uses the same full-title identity and compact game metadata for local drafts without fabricated attendance/status", () => {
  const card = source("events", "EventDraftTableCard");
  expect(card).toMatch(/<RecordIdentityCard\s+title=\{row.name\}\s+icon=\{Dices\}/);
  expect(card).toContain("<EventTableGamesPopover");
  expect(card).toContain("durationMinutes: eventGameDuration(game)");
  expect(card).toContain("<EventTableRatingInfo");
  expect(card).not.toContain("acceptedCount");
  expect(card).not.toContain("eventStatus");
  expect(card).not.toContain("onPress=");
  expect(card).not.toContain('row.games.map((game) => game.name).join(", ")');
});
it("uses the same grouped datetime component for public Start, End and Cutoff in creation and editing", () => {
  const schedule = source("events", "EventScheduleFields");
  for (const label of [
    "Start Date and Time",
    "End Date and Time",
    "Registration Deadline Date and Time",
  ]) {
    expect(schedule).toMatch(
      new RegExp(`<EventWallDateTime\\s+required\\s+label=\\{t\\("${label}"\\)\\}`),
    );
  }
  const start = schedule.match(
    /<EventWallDateTime\s+required\s+label=\{t\("Start Date and Time"\)\}[\s\S]*?\/>/,
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
    field = source("events", "EventDateTimeField");
  expect(schedule).toContain("form.publicGroup");
  expect(schedule).toContain('t("Start Date and Time")');
  expect(schedule).toContain('t("End Date and Time")');
  expect(schedule).toContain("onChange={form.setStartDate}");
  expect(schedule.indexOf('label={t("End Date and Time")}')).toBeLessThan(
    schedule.indexOf('label={t("Registration Deadline Date and Time")}'),
  );
  expect(schedule.indexOf('label={t("Registration Deadline Date and Time")}')).toBeLessThan(
    schedule.indexOf('label={t("Location")}'),
  );
  expect(schedule).toContain("min={bounds.endMin}");
  expect(schedule).toContain("max={bounds.endMax}");
  expect(schedule).toContain("max={bounds.cutoffMax}");
  expect(field).not.toContain("EventBoundedTimePicker");
  expect(field).toContain("DateTimePickerAndroid.open");
  expect(field).toContain("<DateTimePicker");
  expect(field).toContain("next < min");
  expect(field).toContain("next > max");
  const summary = source("events", "EventWizardSummary");
  expect(summary).toMatch(
    /<GroupedRow>\s*<DateTimeInfo\s+startsAt=\{eventLocalToIso\(draft\.endsWall/,
  );
  expect(summary).toMatch(
    /<GroupedRow>\s*<DateTimeInfo\s+startsAt=\{eventLocalToIso\(draft\.cutoffWall/,
  );
  expect(source("events", "EventTable")).not.toContain('t("Back to event")');
});
it("centers the group tab strip itself below the header instead of relying on child alignment", () => {
  const text = source("groups", "GroupDetail");
  expect(text).toMatch(/alignSelf: "stretch", marginTop: 8, maxWidth: "100%"/);
});
it("keeps owner-only irreversible deletion in the native header, resets it on access loss and requires explicit cascade consent", () => {
  const text = source("groups", "GroupDetail");
  expect(text).toContain("headerRight:");
  expect(text).toContain('canDelete = group?.role === "admin"');
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
  expect(source("groups", "GroupMembers")).toContain("<GroupMemberActions");
  expect(source("groups", "GroupMemberActions")).toContain("Ban from group");
  expect(source("groups", "GroupPeoplePicker")).not.toContain("actions.ban");
  expect(source("groups", "GroupDetail")).toContain("<FloatingActions");
  expect(source("groups", "GroupDetailsCard")).toContain("<GroupedRow");
  expect(source("groups", "GroupWizard")).toMatch(/<LocationListRow[\s\S]*?actions=\{/);
  expect(source("common/ui", "GroupBanDialog")).toContain("<Ban");
});
