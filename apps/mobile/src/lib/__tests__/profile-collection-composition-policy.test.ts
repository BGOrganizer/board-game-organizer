import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { GAME_PICKER_CHUNK_SIZE } from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("../../components/profile/ProfileCollection.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "ProfileCollection.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function attributes(tag: string) {
  const matches: ts.JsxAttributes[] = [];
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === tag
    )
      matches.push(node.attributes);
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(matches).toHaveLength(1);
  const matched = matches[0];
  if (!matched) throw new Error(`Expected the real collection ${tag} declaration`);
  return new Map(
    matched.properties
      .filter(ts.isJsxAttribute)
      .map((attribute): [string, ts.JsxAttribute["initializer"]] => [
        attribute.name.getText(file),
        attribute.initializer,
      ]),
  );
}

// Static ownership/configuration rules retained from the mixed legacy file.
// Real ProfileCollection.native tests separately render its actual section owner.
it("delegates collection keyboard and measurement ownership to the shared native input section list", () => {
  const list = attributes("InputSectionList");
  expect(list.has("onLayout")).toBe(false);
  expect(list.has("onContentSizeChange")).toBe(false);
  expect(attributes("SearchInput").has("onFocus")).toBe(false);
  expect(source).not.toContain("Keyboard.addListener");
  expect(source).not.toContain("useHeaderHeight");
  expect(source).not.toContain("ProfileBggAttribution");
  expect(source).not.toContain("<ScrollView");
});

it("keeps the explicit bounded collection caller settings and sticky section header configuration", () => {
  const list = attributes("InputSectionList");
  const expression = (name: string) => {
    const value = list.get(name);
    if (!value || !ts.isJsxExpression(value) || !value.expression)
      throw new Error(`Expected the explicit collection ${name} expression`);
    return value.expression.getText(file);
  };
  expect(GAME_PICKER_CHUNK_SIZE).toBe(8);
  expect(expression("initialNumToRender")).toBe("GAME_PICKER_CHUNK_SIZE");
  expect(expression("maxToRenderPerBatch")).toBe("6");
  expect(expression("windowSize")).toBe("7");
  expect(list.has("stickySectionHeadersEnabled")).toBe(true);
  expect(list.get("stickySectionHeadersEnabled")).toBeUndefined();
});
