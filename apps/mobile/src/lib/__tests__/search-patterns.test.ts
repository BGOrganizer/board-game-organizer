import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// Source-contract checks only, not native UI acceptance. Maestro exercises actual controls.
it.each([
  "app/(tabs)/contacts.tsx",
  "app/match/search-user.tsx",
  "app/mobile-number.tsx",
  "components/games/GamePicker.tsx",
  "components/groups/GroupLeaderboard.tsx",
  "components/locations/LocationPicker.tsx",
  "components/common/ui/ListSearch.tsx",
])("composes the shared search input without another SDK search-field tree: %s", (path) => {
  const text = source(path);
  expect(text).toContain("<SearchInput");
  expect(text).not.toContain("<SearchField");
});

it.each([
  "components/common/ui/SearchHelpLabel.tsx",
  "components/contacts/ContactLegend.tsx",
  "components/matches/VoteLegend.tsx",
])("shares the help container while retaining feature content: %s", (path) => {
  expect(source(path)).toContain("<HelpPopover");
  expect(source(path)).not.toContain("<Popover.");
});

it.each(["components/common/ui/ListSearch.tsx", "components/games/GamePicker.tsx"])(
  "shares theme-aware selected filters without a hardcoded inactive background: %s",
  (path) => {
    expect(source(path)).toContain("<FilterChips");
    expect(source(path)).not.toContain("#52525b");
  },
);

it("keeps IDs, optional input limits, touch targets and selected accessibility state", () => {
  const input = source("components/common/ui/SearchInput.tsx");
  expect(input).toContain("testID={testID}");
  expect(input).toContain("maxLength={maxLength}");
  expect(input).toContain('t("Clear search")');
  expect(input).not.toMatch(/setTimeout|fetch\(|useEffect|length\s*[<>]/);
  const chips = source("components/common/ui/FilterChips.tsx");
  expect(chips).toContain('variant={active ? "primary" : "secondary"}');
  expect(chips).toContain("accessibilityState={{ selected: active }}");
  expect(chips).toContain("minWidth: 44");
  expect(chips).toContain("minHeight: 44");
  expect(source("components/common/ui/HelpPopover.tsx")).toContain("minHeight: 44");
  expect(source("app/(tabs)/contacts.tsx")).toContain('testID="contact-search-input"');
  expect(source("components/games/GamePicker.tsx")).toContain('testID="game-search-input"');
  expect(source("components/locations/LocationPicker.tsx")).toContain(
    'testID="location-address-input"',
  );
  expect(source("components/common/ui/ListSearch.tsx")).toContain('testID="list-search-input"');
  expect(source("app/mobile-number.tsx")).not.toContain(
    't("Type at least 4 characters to search")',
  );
});

it("keeps clear-button padding registered from the first keystroke and disables search autocorrection", () => {
  const file = ts.createSourceFile(
    "SearchInput.tsx",
    source("components/common/ui/SearchInput.tsx"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let clearButtons = 0;
  let inputAttributes = "";
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(file) === "SearchField.ClearButton") {
        clearButtons++;
        let parent = node.parent;
        while (parent) {
          expect(ts.isConditionalExpression(parent)).toBe(false);
          parent = parent.parent;
        }
      }
      if (node.tagName.getText(file) === "SearchField.Input")
        inputAttributes = node.attributes.getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(clearButtons).toBe(1);
  expect(inputAttributes).toContain("autoCorrect={false}");
  expect(inputAttributes).toContain('autoCapitalize="none"');
});

it("exposes native help titles and children separately instead of grouping the whole dialog", () => {
  const text = source("components/common/ui/HelpPopover.tsx");
  const file = ts.createSourceFile(
    "HelpPopover.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const parts = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node)) {
      parts.set(node.tagName.getText(file), node.attributes.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(parts.get("Popover.Content")).toContain("accessible={false}");
  expect(parts.get("Popover.Title")).toContain('accessibilityRole="header"');
  expect(parts.get("Popover.Title")).toContain('importantForAccessibility="yes"');
  expect(text).not.toContain('importantForAccessibility="no-hide-descendants"');
  expect(text).toContain("{children}");
});

it("preserves cancellation and invalidation of the verified address in the search change handler", () => {
  const text = source("components/locations/LocationPicker.tsx");
  const file = ts.createSourceFile(
    "picker.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let handler = "";
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "SearchInput") {
      const change = node.attributes.properties.find(
        (prop) => ts.isJsxAttribute(prop) && prop.name.getText(file) === "onChange",
      );
      if (change) handler = change.getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const call of [
    "cancelLocate()",
    "setQuery(text)",
    "setSelected(null)",
    "setFavoriteKey(null)",
    "setResults([])",
  ])
    expect(handler).toContain(call);
  expect(text).toContain("clearButtonStyle={{ end: 48 }}");
  expect(text).toContain("inputStyle={{ paddingEnd: 100 }}");
  expect(text).not.toContain("clearButtonStyle={{ right:");
});
