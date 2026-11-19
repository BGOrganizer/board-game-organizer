import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

// Source contract only; actual native picker behavior is covered by LocationPicker.native.test.tsx.
it("keeps on-map credits and shows a footer only as a no-map attribution fallback", () => {
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
  let maps = 0,
    fallbacks = 0;
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "MapLibreMap") {
      const props = new Set(
        node.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText(ast)),
      );
      expect(props.has("attribution")).toBe(true);
      expect(props.has("logo")).toBe(true);
      maps++;
    }
    if (ts.isConditionalExpression(node) && node.condition.getText(ast) === "!mapStyle") {
      expect(node.whenTrue.getText(ast)).toContain("https://www.openstreetmap.org/copyright");
      expect(node.whenTrue.getText(ast)).toContain("maptiler-logo.png");
      expect(node.whenFalse.getText(ast)).toBe("null");
      fallbacks++;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(maps).toBe(1);
  expect(fallbacks).toBe(1);
  expect(text).toMatch(/accessibilityLabel=\{t\("Map by MapTiler"\)\}\s+hitSlop=\{6\}/);
});
