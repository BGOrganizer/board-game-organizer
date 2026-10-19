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

it("places the GPS action on the map above attribution and leaves the search clear control independent", () => {
  const text = readFileSync(
    new URL("../../components/locations/LocationPicker.tsx", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "location.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let gps = 0,
    search = 0;
  function visit(node: ts.Node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(ast) === "Button" &&
      node.openingElement.getText(ast).includes('testID="location-map-locate"')
    ) {
      gps++;
      expect(node.openingElement.getText(ast)).toContain("right: 12, bottom: 40");
      expect(node.openingElement.getText(ast)).toContain("onPress={() => void locate()}");
      expect(node.parent.getText(ast)).toContain("<MapLibreMap");
      expect(node.parent.getText(ast)).toContain("attribution");
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "SearchInput") {
      search++;
      expect(node.getText(ast)).not.toContain("clearButtonStyle");
      expect(node.getText(ast)).not.toContain("inputStyle");
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(gps).toBe(1);
  expect(search).toBe(1);
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
    ["../../components/events/Events.tsx", "FlatList"],
    ["../../components/groups/GroupWizard.tsx", "FlatList"],
    ["../../components/groups/GroupList.tsx", "FlatList"],
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
  const group = readFileSync(
    new URL("../../components/groups/GroupDetail.tsx", import.meta.url),
    "utf8",
  );
  expect(group).toContain("<TabBar>");
  expect(group).toContain("<GroupMembers");
  expect(group).toContain("<Events");
  const leaderboard = readFileSync(
    new URL("../../components/groups/GroupLeaderboard.tsx", import.meta.url),
    "utf8",
  );
  expect(leaderboard).toContain("<FlatList");
  expect(leaderboard).toMatch(/style=\{\{ flex: 1, marginTop: 16 \}\}/);
});

it("keeps text inside explicit labels when native location buttons contain icons", () => {
  for (const path of [
    "../../components/events/EventWizard.tsx",
    "../../components/locations/LocationPicker.tsx",
    "../../components/events/EventTable.tsx",
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
