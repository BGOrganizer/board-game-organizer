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
  expect(wizard).toContain("eventBookingClosesAt(startsAt, bookingHours)");
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
  const recipient = source("organizations/OrganizationInvitationResponse.tsx");
  expect(recipient).toContain("CommunityConfirm");
  expect(recipient).toContain('onAction("accept")');
  expect(recipient).toContain('onAction("decline")');
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
