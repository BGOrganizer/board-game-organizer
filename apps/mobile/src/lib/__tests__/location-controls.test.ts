import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("anchors favorite sheets above system bars with viewport sizing", () => {
  const source = ts.createSourceFile(
    "search-location.tsx",
    readFileSync(new URL("../../app/match/search-location.tsx", import.meta.url), "utf8"),
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

it("keeps text inside explicit labels when native location buttons contain icons", () => {
  for (const path of [
    "../../components/MatchWizard.tsx",
    "../../app/match/search-location.tsx",
    "../../app/match/[matchId].tsx",
    "../../components/ContactLegend.tsx",
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
