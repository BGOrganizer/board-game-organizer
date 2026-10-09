// Source contracts only: Maestro owns actual native dialogs, keyboard and picker acceptance.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../../components/${path}`, import.meta.url), "utf8");
it("uses one date row with chained Android dialogs and a cancellable iOS datetime picker", () => {
  const field = source("events/EventDateTimeField.tsx");
  expect(field).toContain("GroupedRow");
  expect(field).toContain("accessibilityLabel={label}");
  expect(field).not.toContain("heroui-native/input");
  expect(field).not.toContain("Choose time");
  expect(field.match(/DateTimePickerAndroid.open\(/g)).toHaveLength(2);
  expect(field).toContain('timeZoneName="UTC"');
  expect(field).toContain('mode="datetime"');
  expect(field).toContain("setDraft(null)");
});
it("keeps event navigation outside scrolling, verified location rows and numeric elapsed-hour deadlines", () => {
  const wizard = source("events/EventWizard.tsx");
  expect(wizard).toContain("eventBookingHours(event)");
  expect(wizard).toContain("eventInformationForm");
  expect(wizard).toContain("eventDateLimit");
  expect(wizard).toContain("<WizardSteps current={step + 1} count={3}");
  expect(wizard).toContain("{step > 0 ? (");
  expect(wizard).toContain("useFavoriteLocations(o, location ? [location] : [])");
  expect(wizard).toContain("EventDraftTableCard");
  expect(wizard).toContain('testID="event-next-fab"');
  expect(wizard).toContain('testID="event-back-fab"');
  expect(wizard).toContain('keyboardType="decimal-pad"');
  expect(wizard).toContain("LocationListRow");
  expect(wizard).toContain("SearchHelpLabel");
  expect(wizard).not.toContain("setZone");
  expect(wizard).toContain('testID="event-navigation-bar"');
  expect(wizard).toContain("ArrowRight");
  expect(wizard.indexOf("{navigation}")).toBeGreaterThan(
    wizard.indexOf("</FlatList>") >= 0
      ? wizard.indexOf("</FlatList>")
      : wizard.indexOf("renderItem="),
  );
});
it("uses vertical social actions and one role-aware membership dialog, separate from global blocking", () => {
  const members = source("organizations/OrganizationMembers.tsx");
  expect(members).toContain("EllipsisVertical");
  expect(members).toContain("Respond to membership request");
  expect(members).toContain("Cancel organization invitation");
  expect(members).toContain("Ban from organization");
  expect(members).toContain("Block user globally");
  expect(members).not.toContain("setRemoving");
  expect(members).not.toContain("socialRun");
  expect(members).not.toContain("friendLabel");
  expect(members).toContain("cancelLast={request}");
  expect(source("common/ui/UserActionsSheet.tsx")).toContain("BottomSheet.Content");
  expect(source("common/ui/UserActionsSheet.tsx")).not.toContain("StyleSheet");
  const recipient = source("organizations/OrganizationInvitationResponse.tsx");
  expect(recipient).toContain("CommunityConfirm");
  expect(recipient).toContain('onAction("accept")');
  expect(recipient).toContain('onAction("decline")');
});
it("keeps demonstrator Back in the header and gives table cards image/date/game/player/demonstrator fields", () => {
  const picker = source("events/EventDemonstratorPicker.tsx");
  expect(picker).toContain("headerLeft:");
  const card = source("events/EventDraftTableCard.tsx");
  for (const field of [
    "imageUrl",
    "CalendarClock",
    "CalendarCheck",
    "Dices",
    "UsersRound",
    "Presentation",
  ])
    expect(card).toContain(field);
});
it("retains bottom clearance without a submit separator and arranges camera/library horizontally", () => {
  const wizard = source("organizations/OrganizationWizard.tsx");
  expect(wizard).toContain("paddingBottom: insets.bottom + 24");
  expect(wizard).not.toContain("border-t border-separator");
  const camera = wizard.indexOf('selectLogo("camera")'),
    library = wizard.indexOf('selectLogo("library")');
  expect(wizard.slice(camera - 250, library)).toContain("style={{ flex: 1 }}");
  expect(wizard.slice(camera - 450, camera)).toContain('flexDirection: "row"');
});
