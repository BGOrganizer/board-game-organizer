// Source contracts only: Maestro owns actual native dialogs, keyboard and picker acceptance.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

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
  expect(members).toContain('label: t("Remove")');
  expect(members).toContain('variant: "danger-soft"');
  expect(members).toContain("Block user globally");
  expect(members).not.toContain("setRemoving");
  expect(members).not.toContain("socialRun");
  expect(members).not.toContain("friendLabel");
  expect(source("common/ui/UserActionsSheet.tsx")).toContain("BottomSheet.Content");
  expect(source("common/ui/UserActionsSheet.tsx")).not.toContain("StyleSheet");
  const recipient = source("organizations/OrganizationInvitationResponse.tsx");
  expect(recipient).toContain("ConfirmDialog");
  expect(recipient).toContain('onAction("accept")');
  expect(recipient).toContain('onAction("decline")');
});
it("uses one compact row of confirmation actions and delegates cancellation only to HeroUI Close", () => {
  const confirm = source("common/ui/ConfirmDialog.tsx");
  expect(confirm).toContain('flexDirection: "row"');
  expect(confirm).not.toContain("flexWrap");
  expect(confirm).toContain('size="sm"');
  expect(confirm).toContain("minWidth: 44");
  expect(confirm).toContain("minHeight: 44");
  expect(confirm).toContain("flexShrink: 1");
  expect(confirm).toContain('accessibilityLabel={t("Cancel")}');
  expect(confirm).toContain("if (!open && !busy) onCancel()");
  expect(confirm).toContain("if (!busy) action.onPress()");
  expect(confirm).toContain("isCloseOnPress={!busy}");
  expect(confirm).toContain("isSwipeable={!busy}");
  expect(confirm).not.toContain("actionsInRow");
  const ast = ts.createSourceFile(
    "ConfirmDialog.tsx",
    confirm,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let closeCount = 0;
  const handlers = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(ast);
      const name = tag === "Dialog" ? "onOpenChange" : tag === "Button" ? "onPress" : null;
      for (const property of node.attributes.properties) {
        if (
          ts.isJsxAttribute(property) &&
          property.name.getText(ast) === name &&
          property.initializer &&
          ts.isJsxExpression(property.initializer) &&
          property.initializer.expression
        )
          handlers.set(tag, property.initializer.expression.getText(ast));
      }
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "Dialog.Close") {
      closeCount++;
      expect(
        node.attributes.properties.some(
          (p) => ts.isJsxAttribute(p) && p.name.getText(ast) === "onPress",
        ),
      ).toBe(false);
      expect(
        node.attributes.properties.some(
          (p) => ts.isJsxAttribute(p) && p.name.getText(ast) === "isDisabled",
        ),
      ).toBe(true);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(closeCount).toBe(1);
  expect(handlers.size).toBe(2);
  // Execute only the real pure event handlers, not native components or mocked UI.
  for (const busy of [false, true]) {
    const onCancel = vi.fn();
    const dismiss = runInNewContext(`(${handlers.get("Dialog")})`, { busy, onCancel });
    dismiss(true);
    expect(onCancel).not.toHaveBeenCalled();
    dismiss(false);
    expect(onCancel).toHaveBeenCalledTimes(busy ? 0 : 1);
    const action = { onPress: vi.fn() };
    runInNewContext(`(${handlers.get("Button")})`, { busy, action })();
    expect(action.onPress).toHaveBeenCalledTimes(busy ? 0 : 1);
  }
});
it("routes every native confirmation through the common dialog without replacing date pickers or system permissions", () => {
  for (const path of [
    "common/ui/UserActionsSheet.tsx",
    "matches/MatchDetail.tsx",
    "profile/Profile.tsx",
    "events/EventDetail.tsx",
    "events/EventTableEdit.tsx",
    "events/EventTablePlayers.tsx",
    "events/EventWizard.tsx",
    "organizations/OrganizationDetail.tsx",
    "organizations/OrganizationMembers.tsx",
    "organizations/OrganizationInvitationResponse.tsx",
  ]) {
    const text = source(path);
    expect(text, path).toContain("<ConfirmDialog");
    expect(text, path).not.toContain("Alert.alert");
    expect(text, path).not.toContain("CommunityConfirm");
  }
  for (const path of [
    "(tabs)/contacts.tsx",
    "group/[groupId].tsx",
    "match/results.tsx",
    "notifications.tsx",
  ]) {
    const text = readFileSync(new URL(`../../app/${path}`, import.meta.url), "utf8");
    expect(text, path).toContain("<ConfirmDialog");
    expect(text, path).not.toContain("Alert.alert");
  }
  const contacts = readFileSync(new URL("../../app/(tabs)/contacts.tsx", import.meta.url), "utf8");
  expect(contacts).toContain("Contacts.requestPermissionsAsync()");
  expect(contacts).toContain("setContactsConsentOpen(false)");
  const field = source("events/EventDateTimeField.tsx");
  expect(field).toContain("DateTimePickerAndroid.open(");
  expect(field).toContain("<DateTimePicker");
  expect(field).not.toContain("ConfirmDialog");
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
  const picker = source("organizations/OrganizationMemberPicker.tsx");
  expect(source("events/EventDemonstratorPicker.tsx")).toContain("<OrganizationMemberPicker");
  expect(picker).toContain("headerLeft:");
  const editor = source("events/EventTableEditor.tsx");
  expect(editor).toContain("headerLeft:");
  expect(editor).not.toContain("FloatingActions");
  expect(editor).toContain('mode="time"');
  expect(editor).toContain("beforeEnd");
  const card = source("events/EventDraftTableCard.tsx") + source("events/EventTableCardBody.tsx");
  for (const field of ["imageUrl", "Clock3", "Trophy", "Dices", "UsersRound", "Presentation"])
    expect(card).toContain(field);
});
it("mounts the social sheet closed even with no selected user, allowing the first open transition", () => {
  const sheet = source("common/ui/UserActionsSheet.tsx");
  expect(sheet).not.toContain("if (!user) return null");
  expect(sheet).toContain("isOpen={visible && Boolean(user) && !confirmation}");
  expect(sheet).not.toContain("menuReady");
  expect(sheet).toContain('cancelTestID="cancel-confirmation-btn"');
  expect(sheet).toContain("onCancel={() => setConfirmAction(null)}");
  expect(sheet).toContain("user ? userActionKeys");
  expect(sheet).toContain("BottomSheet.Title>{user?.name}");
});
it("removes the social portal without a visible selected user while keeping the root ready for first open", () => {
  const text = source("common/ui/UserActionsSheet.tsx");
  const ast = ts.createSourceFile(
    "UserActionsSheet.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let condition = "";
  function visit(node: ts.Node) {
    if (
      ts.isConditionalExpression(node) &&
      node.whenTrue.getText(ast).includes("<BottomSheet.Portal>")
    )
      condition = node.condition.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(condition).not.toBe("");
  for (const visible of [false, true]) {
    for (const user of [null, { id: "selected" }]) {
      expect(Boolean(runInNewContext(condition, { visible, user }))).toBe(visible && user !== null);
    }
  }
  let open = "";
  function findLifecycle(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
      const expression = node.initializer.expression;
      if (expression && node.name.getText(ast) === "isOpen") open = expression.getText(ast);
      expect(node.name.getText(ast)).not.toBe("onLayout");
    }
    ts.forEachChild(node, findLifecycle);
  }
  findLifecycle(ast);
  expect(open).not.toBe("");
  // The controlled open intent cannot depend on layout of content kept closed by that intent.
  for (const visible of [false, true]) {
    for (const user of [null, { id: "selected" }]) {
      for (const confirmation of [null, { title: "Confirm" }]) {
        expect(Boolean(runInNewContext(open, { visible, user, confirmation }))).toBe(
          visible && user !== null && confirmation === null,
        );
      }
    }
  }
});

it("opens controlled native sheets on first mount and reports only an actual completed pan as swipe closure", () => {
  const entry = createRequire(import.meta.url).resolve("heroui-native/bottom-sheet");
  const modules = dirname(dirname(dirname(entry)));
  const content = readFileSync(
    join(modules, "helpers/internal/components/bottom-sheet-content.js"),
    "utf8",
  );
  const container = readFileSync(
    join(modules, "helpers/internal/components/bottom-sheet-content-container.js"),
    "utf8",
  );
  let index = "";
  const ast = ts.createSourceFile("content.js", content, ts.ScriptTarget.Latest, true);
  function findIndex(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "index")
      index = node.initializer.getText(ast);
    ts.forEachChild(node, findIndex);
  }
  findIndex(ast);
  expect(index).not.toBe("");
  for (const isOpen of [false, true]) {
    for (const initialIndex of [undefined, 0, 1]) {
      expect(runInNewContext(index, { isOpen, initialIndex })).toBe(
        isOpen ? (initialIndex ?? 0) : -1,
      );
    }
  }
  let reaction = "";
  const callbackAst = ts.createSourceFile("container.js", container, ts.ScriptTarget.Latest, true);
  function findReaction(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(callbackAst) === "useAnimatedReaction")
      reaction = node.arguments[1].getText(callbackAst);
    ts.forEachChild(node, findReaction);
  }
  findReaction(callbackAst);
  expect(reaction).not.toBe("");
  for (const value of [1, 1.5, 1.8, 2]) {
    for (const pan of [false, true]) {
      for (const dragging of [false, true]) {
        for (const closing of [false, true]) {
          const closeBottomSheet = vi.fn();
          const shared = (value: boolean) => ({ get: () => value, set: vi.fn() });
          runInNewContext(`(${reaction})`, {
            isPanActivated: shared(pan),
            isDragging: shared(dragging),
            isClosingOnSwipe: shared(closing),
            scheduleOnRN: (callback: () => void) => callback(),
            closeBottomSheet,
          })(value);
          expect(closeBottomSheet).toHaveBeenCalledTimes(
            pan && value > 1.5 && !dragging && !closing ? 1 : 0,
          );
        }
      }
    }
  }
});

it("keeps social confirmations outside every bottom sheet and preserves the selected user while the menu closes", () => {
  const paths = ["common/ui/UserActionsSheet.tsx", "matches/MatchDetail.tsx"];
  let confirms = 0;
  for (const path of paths) {
    const text = source(path);
    const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node, inSheet = false) {
      const tag = ts.isJsxElement(node)
        ? node.openingElement.tagName.getText(ast)
        : ts.isJsxSelfClosingElement(node)
          ? node.tagName.getText(ast)
          : "";
      if (tag === "ConfirmDialog") {
        confirms++;
        expect(inSheet, path).toBe(false);
      }
      ts.forEachChild(node, (child) => visit(child, inSheet || tag === "BottomSheet"));
    }
    visit(ast);
  }
  expect(confirms).toBe(2);
  const sheet = source("common/ui/UserActionsSheet.tsx");
  expect(sheet).not.toContain("BottomSheet.Description");
  expect(sheet).not.toContain("<Dialog");
  const ast = ts.createSourceFile(
    "UserActionsSheet.tsx",
    sheet,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let handler = "";
  function findHandler(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "BottomSheet") {
      for (const attr of node.attributes.properties)
        if (
          ts.isJsxAttribute(attr) &&
          attr.name.getText(ast) === "onOpenChange" &&
          attr.initializer &&
          ts.isJsxExpression(attr.initializer) &&
          attr.initializer.expression
        )
          handler = attr.initializer.expression.getText(ast);
    }
    ts.forEachChild(node, findHandler);
  }
  findHandler(ast);
  expect(handler).not.toBe("");
  for (const busy of [false, true]) {
    for (const confirmation of [null, { title: "Confirm" }]) {
      const onClose = vi.fn();
      const change = runInNewContext(`(${handler})`, { busy, confirmation, onClose });
      change(true);
      expect(onClose).not.toHaveBeenCalled();
      change(false);
      expect(onClose).toHaveBeenCalledTimes(!busy && !confirmation ? 1 : 0);
    }
  }
});
it("reuses the same social action sheet for contacts, groups, matches and organizations", () => {
  for (const path of [
    "app/(tabs)/contacts.tsx",
    "app/group/[groupId].tsx",
    "components/matches/MatchDetail.tsx",
    "components/organizations/OrganizationMembers.tsx",
  ]) {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    expect(text, path).toContain('from "@/components/common/ui/UserActionsSheet"');
    expect(text.match(/<UserActionsSheet\b/g), path).toHaveLength(1);
    expect(text, path).not.toContain("function UserActionsSheet");
  }
});
it("gives the native match name input a translated accessible label in creation and editing", () => {
  const wizard = source("matches/MatchWizard.tsx");
  expect(wizard).toMatch(
    /<Input\s+testID="match-name-input"\s+accessibilityLabel=\{t\("Match name"\)\}\s+value=\{name\}\s+onChangeText=\{setName\}/,
  );
});

it("keeps one day, two native time fields, counted table limit, and time-only fixed-size cards", () => {
  const wizard = source("events/EventWizard.tsx");
  expect(wizard.match(/mode="date"/g)).toHaveLength(1);
  expect(wizard.match(/mode="time"/g)).toHaveLength(2);
  expect(wizard).toContain("eventOnDay");
  expect(wizard).toContain("eventDraftTableCount");
  expect(wizard).toContain("tableCount >= MAX_EVENT_TABLES");
  expect(wizard).toContain("EventWizardSummary");
  const card = source("events/EventTableCardBody.tsx");
  expect(source("events/EventDraftTableCard.tsx")).toContain("<EventTableCardBody");
  expect(source("events/EventTableCard.tsx")).toContain("<EventTableCardBody");
  expect(card).not.toContain("dateStyle");
  expect(card).toContain("width: 80, height: 80, flexShrink: 0");
  expect(card).toContain("table.openSkill");
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
