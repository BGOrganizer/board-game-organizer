// Source contracts only: Maestro owns actual native dialogs, keyboard and picker acceptance.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../../components/${path}`, import.meta.url), "utf8");
it("uses native date/time-only pickers and rejects invalid Android time selections without clamping", () => {
  const field = source("events/EventDateTimeField.tsx");
  expect(field).toContain("GroupedRow");
  expect(field).toContain("accessibilityLabel={label}");
  expect(field).not.toContain("heroui-native/input");
  expect(field).not.toContain("Choose time");
  expect(field.match(/DateTimePickerAndroid.open\(/g)).toHaveLength(1);
  expect(field).toContain('timeZoneName="UTC"');
  expect(field).toContain('mode: "date" | "time"');
  expect(field).toContain("setPickerError");
  expect(field).not.toContain("eventTimeChoices");
  expect(field).not.toContain('mode="datetime"');
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
  expect(members).toContain('label: t("Ban")');
  expect(members).toContain("actionsInRow={request}");
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
it("keeps request icons/text inline with Cancel below without changing other confirmation layouts", () => {
  const confirm = source("common/ui/CommunityConfirm.tsx");
  expect(confirm).toContain("actionsInRow = false");
  expect(confirm).toContain('flexDirection: cancelLast && !actionsInRow ? "column" : "row"');
  expect(confirm).toContain('flexWrap: actionsInRow ? "nowrap" : "wrap"');
  expect(confirm).toContain("minWidth: 44");
  expect(confirm).toContain("minHeight: 44");
  expect(confirm).toContain('flexDirection: "row" as const');
  expect(confirm).toContain("{cancelLast && actionsInRow ? cancel : null}");
});
it("wraps every review button's translated text in a native label, including icon-bearing actions", () => {
  const review = source("organizations/OrganizationReview.tsx");
  const ast = ts.createSourceFile(
    "OrganizationReview.tsx",
    review,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let buttons = 0;
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "Button") {
      buttons++;
      expect(
        node.children.some(
          (child) =>
            ts.isJsxElement(child) && child.openingElement.tagName.getText(ast) === "Button.Label",
        ),
      ).toBe(true);
      expect(
        node.children.some(
          (child) =>
            ts.isJsxExpression(child) && child.expression && ts.isCallExpression(child.expression),
        ),
      ).toBe(false);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(buttons).toBe(3);
  expect(review).toContain('label={t("Manage organization")}');
  expect(review).toContain('placeholder={t("Reject reason")}');
  expect(review).toContain('flexDirection: "row", gap: 12');
});
it("keeps demonstrator Back in the header and gives table cards image/date/game/player/demonstrator fields", () => {
  const picker = source("events/EventDemonstratorPicker.tsx");
  expect(picker).toContain("headerLeft:");
  const editor = source("events/EventTableEditor.tsx");
  expect(editor).toContain("headerLeft:");
  expect(editor).not.toContain("FloatingActions");
  expect(editor).toContain('mode="time"');
  expect(editor).toContain("beforeEnd");
  const card = source("events/EventDraftTableCard.tsx");
  for (const field of ["imageUrl", "Clock3", "Trophy", "Dices", "UsersRound", "Presentation"])
    expect(card).toContain(field);
});
it("mounts the social sheet closed even with no selected user, allowing the first open transition", () => {
  const sheet = source("common/ui/UserActionsSheet.tsx");
  expect(sheet).not.toContain("if (!user) return null");
  expect(sheet).toContain("isOpen={visible && Boolean(user)}");
  expect(sheet).toContain("user ? userActionKeys");
  expect(sheet).toContain("BottomSheet.Title>{user?.name}");
});
it("keeps one day, two native time fields, counted table limit, and time-only fixed-size cards", () => {
  const wizard = source("events/EventWizard.tsx");
  expect(wizard.match(/mode="date"/g)).toHaveLength(1);
  expect(wizard.match(/mode="time"/g)).toHaveLength(2);
  expect(wizard).toContain("eventOnDay");
  expect(wizard).toContain("eventDraftTableCount");
  expect(wizard).toContain("tableCount >= MAX_EVENT_TABLES");
  expect(wizard).toContain("EventWizardSummary");
  const card = source("events/EventDraftTableCard.tsx");
  expect(card).not.toContain("dateStyle");
  expect(card).toContain("width: 80, height: 80, flexShrink: 0");
  expect(card).toContain("table.input.openSkill");
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
