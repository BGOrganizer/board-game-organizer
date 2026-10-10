import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("anchors favorite sheets above system bars with viewport sizing", () => {
  const source = ts.createSourceFile(
    "search-location.tsx",
    readFileSync(new URL("../../components/locations/LocationPicker.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "Select.Content") {
      const props = new Map(
        node.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attr) => [attr.name.getText(source), attr.initializer?.getText(source)]),
      );
      expect(props.get("snapPoints")).toContain('"60%"');
      expect(props.get("snapPoints")).toContain('"85%"');
      expect(props.get("enableDynamicSizing")).toBe("{false}");
      expect(props.get("bottomInset")).toBe("{insets.bottom}");
      expect(props.get("topInset")).toBe("{insets.top}");
      expect(props.get("contentContainerProps")).toMatch(/flex:\s*1/);
      found = true;
    }
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === "BottomSheetFlatList"
    ) {
      const style = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((attr) => attr.name.getText(source) === "style");
      expect(style?.initializer?.getText(source)).toMatch(/flex:\s*1/);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(found).toBe(true);
});

it("bounds match/group scroll regions and reserves the exact safe-area-aware FAB clearance", () => {
  const scroll = readFileSync(
    new URL("../../components/common/ui/ScreenScrollView.tsx", import.meta.url),
    "utf8",
  );
  expect(scroll).toContain("useFloatingActionLayout()");
  expect(scroll).toMatch(/style=\{\[\{ flex: 1 \}, style\]\}/);
  expect(scroll).toContain("paddingBottom: layout.paddingBottom");
  const fab = readFileSync(
    new URL("../../components/common/ui/FloatingActions.tsx", import.meta.url),
    "utf8",
  );
  expect(fab).toContain("useFloatingActionLayout()");
  expect(fab).toContain("bottom: layout.bottom");
  expect(fab).not.toContain("extraBottom");
  for (const [path, component] of [
    ["../../components/matches/MatchDetail.tsx", "DetailsContainer"],
    ["../../app/group/[groupId].tsx", "ScreenScrollView"],
    ["../../app/(tabs)/matches.tsx", "FlatList"],
    ["../../components/groups/GroupsScreen.tsx", "FlatList"],
    ["../../components/organizations/Organizations.tsx", "FlatList"],
    ["../../components/events/Events.tsx", "FlatList"],
    ["../../components/matches/MatchWizard.tsx", "ScreenScrollView"],
    ["../../components/groups/GroupWizard.tsx", "ScreenScrollView"],
    ["../../components/organizations/OrganizationDetail.tsx", "ScreenScrollView"],
  ] as const) {
    const source = ts.createSourceFile(
      path,
      readFileSync(new URL(path, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let found = false;
    function visit(node: ts.Node) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(source) === component
      ) {
        const props = new Map(
          node.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((attr) => [attr.name.getText(source), attr.initializer?.getText(source)]),
        );
        if (component === "FlatList") {
          expect(props.get("style"), path).toMatch(/flex:\s*1/);
          expect(props.get("contentContainerStyle"), path).toContain("layout.paddingBottom");
        }
        expect(source.text, path).not.toContain("extraBottom=");
        found = true;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(found, path).toBe(true);
  }
  const match = readFileSync(
    new URL("../../components/matches/MatchDetail.tsx", import.meta.url),
    "utf8",
  );
  for (const tab of ["overview", "players", "leaderboard", "results"])
    expect(match).toContain(`<Tabs.Content value="${tab}"`);
  const leaderboard = readFileSync(
    new URL("../../components/groups/GroupLeaderboard.tsx", import.meta.url),
    "utf8",
  );
  expect(leaderboard).toContain("<FlatList");
  expect(leaderboard).toMatch(/style=\{\{ flex: 1, marginTop: 16 \}\}/);
});

it("keeps text inside explicit labels when native location buttons contain icons", () => {
  for (const path of [
    "../../components/matches/MatchWizard.tsx",
    "../../components/locations/LocationPicker.tsx",
    "../../components/matches/MatchDetail.tsx",
    "../../components/contacts/ContactLegend.tsx",
  ]) {
    const source = ts.createSourceFile(
      path,
      readFileSync(new URL(path, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const raw: string[] = [];
    function visit(node: ts.Node) {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(source) === "Button" &&
        node.children.some((child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
      ) {
        for (const child of node.children) {
          if (ts.isJsxText(child) && child.text.trim()) raw.push(child.text);
          if (
            ts.isJsxExpression(child) &&
            child.expression &&
            (ts.isStringLiteral(child.expression) ||
              (ts.isCallExpression(child.expression) &&
                child.expression.expression.getText(source) === "t"))
          )
            raw.push(child.getText(source));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(raw, path).toEqual([]);
  }
});
