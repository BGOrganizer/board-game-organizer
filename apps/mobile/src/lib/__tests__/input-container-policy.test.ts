import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Static composition/security policy retained separately from actual native
// useOptionalHeaderHeight, InputContainers and InputSheetContainers runtime tests.
const containers = ["InputFlatList", "InputScrollView", "InputSectionList"] as const;
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

it("keeps dialogs non-scrolling while sheets and lists retain their header-safe input containers", () => {
  expect(source("components/events/EventGroupSelect.tsx")).toContain("<Select.Portal>");
  expect(source("components/events/EventGroupSelect.tsx")).toContain("<InputFlatList");
  const dialog = source("components/common/ui/ConfirmDialog.tsx");
  expect(dialog).toContain("<Dialog.Portal");
  expect(dialog).toContain("<KeyboardAvoidingView");
  expect(dialog).not.toContain("InputScrollView");
  expect(dialog).not.toContain("useHeaderHeight");
  expect(source("components/events/TableScoreEditor.tsx")).toContain("<BottomSheet.Portal>");
  expect(source("components/events/TableScoreEditor.tsx")).toContain("<InputScrollView");
  expect(source("components/events/EventInvitationPicker.tsx")).toContain("<PeoplePicker");
  expect(source("components/contacts/PeoplePicker.tsx")).toContain("<UserList");
  expect(source("components/common/ui/UserList.tsx")).toContain("<InputFlatList");
});

it.each([
  ["EventVoteButtons", "EventTableOverview", "Game voting"],
  ["EventProposalReviewDialog", "EventProposalSection", "Other players' proposals"],
])("keeps %s on the portal-safe shared dialog for %s (%s)", (consumer, parent) => {
  expect(source(`components/events/${parent}.tsx`)).toContain(`<${consumer}`);
  expect(source(`components/events/${consumer}.tsx`)).toContain("<ConfirmDialog");
  const dialog = source("components/common/ui/ConfirmDialog.tsx");
  expect(dialog).toContain("<Dialog.Portal");
  expect(dialog).toContain("<KeyboardAvoidingView");
  expect(dialog).not.toContain("ScrollView");
  expect(dialog).not.toContain("useHeaderHeight");
});

it("uses the same optional height in LocationPicker without relaxing the inline Back guard", () => {
  const picker = source("components/locations/LocationPicker.tsx");
  expect(picker).toContain(
    'import { useOptionalHeaderHeight } from "@/lib/useOptionalHeaderHeight"',
  );
  expect(picker).toContain("const headerHeight = useOptionalHeaderHeight()");
  expect(picker).toContain("keyboardVerticalOffset={headerHeight}");
  expect(picker).toContain("usePreventRemove(Boolean(onClose), () => onClose?.())");
  for (const path of [
    "components/locations/LocationPicker.tsx",
    "components/common/ui/ConfirmDialog.tsx",
    ...containers.map((name) => `components/common/ui/${name}.tsx`),
  ])
    expect(source(path)).not.toMatch(/\buseHeaderHeight\b/);
});

// Static JSX wiring contract complements actual native custom-window tests.
it.each([
  ["initialNumToRender", 8],
  ["maxToRenderPerBatch", 6],
  ["windowSize", 7],
] as const)(
  "preserves caller-controlled %s in both native and sheet-backed virtual lists",
  (prop, fallback) => {
    for (const name of ["InputFlatList", "InputSectionList"] as const)
      expect(source(`components/common/ui/${name}.tsx`)).toContain(
        `${prop}={props.${prop} ?? ${fallback}}`,
      );
  },
);

it("keeps confirmation and standalone date/time picker dialogs stationary", () => {
  expect(source("components/common/ui/ConfirmDialog.tsx")).toContain("isSwipeable={false}");
  const field = source("components/events/EventDateTimeField.tsx");
  expect(field).toContain("<Dialog.Content isSwipeable={false}>");
  expect(field).toContain("<DateTimePicker");
});
