import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { groupRecordMemberRoles } from "@board-game-organizer/schemas";
import ts from "typescript";
import { expect, it } from "vitest";

// Execute native selection expressions; this is not rendered/device acceptance.
const file = ts.createSourceFile(
  "Groups.tsx",
  readFileSync(new URL("../../components/groups/Groups.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function prop(name: string, tag = "MemoizedGroupList") {
  let expression = "";
  function visit(node: ts.Node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(file) === tag
    ) {
      const value = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((item) => item.name.getText(file) === name)?.initializer;
      if (value && ts.isJsxExpression(value)) expression = value.expression?.getText(file) ?? "";
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(expression).not.toBe("");
  return expression;
}
it.each([
  ["private", "PRIVATE"],
  ["public", "PUBLIC"],
])("native %s uses the corresponding owned group type", (section, type) => {
  expect(runInNewContext(prop("type"), { section })).toBe(type);
  const options = { apiUrl: "https://owned-preview.test", userId: "owner" };
  expect(runInNewContext(prop("key", "RetainedTabPanel"), { section, options })).toBe(
    JSON.stringify([options.apiUrl, options.userId, section]),
  );
});
it("uses separate administered, moderator, member and pending categories for owned tabs", () => {
  expect(groupRecordMemberRoles).toEqual(["administrator", "moderator", "member", "pending"]);
  const list = readFileSync(
    new URL("../../components/groups/GroupList.tsx", import.meta.url),
    "utf8",
  );
  expect(list).toContain("useListSearch(groupRecordMemberRoles, 0)");
  expect(list).toContain(
    'useGroupRecords(options, "mine", filters.search, filters.selected, type, order)',
  );
  expect(list).toContain('key: "pending"');
  expect(list).not.toContain('key: "requested"');
  expect(list).toContain("<InputFlatList");
});
