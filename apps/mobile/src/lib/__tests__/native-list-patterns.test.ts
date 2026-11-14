import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
it.each([
  "components/groups/GroupMembers.tsx",
  "components/groups/GroupMemberPicker.tsx",
  "components/contacts/PeoplePicker.tsx",
])("keeps %s source-paged through the native user list", (file) => {
  const s = source(file);
  expect(s).toContain("<UserList");
  expect(s).toContain("<UserListRow");
  expect(s).not.toContain("<ScrollView");
  expect(s).toContain("useSafeAreaInsets");
});
it.each([
  "EventList",
  "TableList",
  "EventDetail",
  "EventTableResults",
  "EventWizard",
  "TableScoreEditor",
])("virtualizes event workflow %s with safe bottom spacing", (name) => {
  const s = source(`components/events/${name}.tsx`);
  expect(s).toMatch(/<(?:Input)?FlatList\b/);
  expect(source("components/common/ui/InputFlatList.tsx")).toContain("<FlatList");
  expect(s).toMatch(/useSafeAreaInsets|useFloatingActionLayout/);
  const file = ts.createSourceFile(
    "workflow.tsx",
    s,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const scrollViews: string[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === "ScrollView"
    )
      scrollViews.push(node.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(scrollViews).toEqual([]);
});
it("composes the single-Table result screen with its virtualized score editor, not a nested list", () => {
  const text = source("components/events/EventResults.tsx");
  expect(text).toContain("<TableScoreEditor");
  expect(text).not.toContain("<ScrollView");
  expect(text).not.toContain("<FlatList");
});
it.each([
  "components/events/EventCard.tsx",
  "components/events/EventTableCard.tsx",
  "components/groups/GroupCard.tsx",
])("reuses the platform card shell/body in %s", (file) => {
  const s = source(file);
  expect(s).toContain("<LinkedListCard");
  expect(s).toContain("<ListCardBody");
});
it("keeps tabs in group-owned layout and forbids wrapping members/events in a same-direction scroll view", () => {
  const s = source("components/groups/GroupDetail.tsx");
  expect(s).toContain("<TabBar>");
  expect(s).toContain("<GroupMembers");
  expect(s).toContain("<Events");
  expect(s).toContain("canViewMembers");
  expect(s).toContain("canViewEvents");
});
it("preserves genuine score-sheet input handlers, normal motion and immutable player identities", () => {
  const s = source("components/events/TableScoreEditor.tsx");
  expect(s).toContain("@/components/common/ui/Input");
  expect(source("lib/useInputFocus.ts")).toContain("useBottomSheetAwareHandlers");
  expect(s).toContain("ReduceMotion.System");
  expect(s).toContain("<ScoreIdentity");
  expect(s).toContain("normalizeMatchScore");
  expect(s).not.toContain("useMatchDetail");
});
it("keeps reusable catalog/address identity rows platform-specific", () => {
  for (const file of ["components/games/GamePicker.tsx", "components/groups/GroupWizard.tsx"])
    expect(source(file)).toContain(file.includes("games") ? "<GameListCard" : "<LocationListRow");
  expect(source("components/games/GameListCard.tsx")).toContain("<GameListRow");
  expect(source("components/profile/ProfileCollection.tsx")).toContain("<GameListCard");
  expect(source("components/contacts/PeoplePicker.tsx")).toContain("<UserList");
});
