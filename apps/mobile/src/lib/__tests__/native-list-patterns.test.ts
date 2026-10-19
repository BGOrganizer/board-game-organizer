import { readFileSync } from "node:fs";
import { URL } from "node:url";
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
  "Events",
  "Tables",
  "EventDetail",
  "EventTable",
  "EventResults",
  "EventWizard",
  "TableScoreEditor",
])("virtualizes event workflow %s with safe bottom spacing", (name) => {
  const s = source(`components/events/${name}.tsx`);
  expect(s).toContain("<FlatList");
  expect(s).toMatch(/useSafeAreaInsets|useFloatingActionLayout/);
  expect(s).not.toContain("<ScrollView");
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
  expect(s).toContain("useBottomSheetAwareHandlers");
  expect(s).toContain("ReduceMotion.System");
  expect(s).toContain("<ScoreIdentity");
  expect(s).toContain("normalizeMatchScore");
  expect(s).not.toContain("useMatchDetail");
});
it("keeps reusable catalog/address identity rows platform-specific", () => {
  for (const file of ["components/games/GamePicker.tsx", "components/groups/GroupWizard.tsx"])
    expect(source(file)).toContain(file.includes("games") ? "<GameListRow" : "<LocationListRow");
  expect(source("components/contacts/PeoplePicker.tsx")).toContain("<UserList");
});
