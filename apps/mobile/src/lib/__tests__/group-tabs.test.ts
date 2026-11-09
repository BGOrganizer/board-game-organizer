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
function prop(name: string) {
  let expression = "";
  function visit(node: ts.Node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(file) === "GroupList"
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
  ["private", "mine", "PRIVATE"],
  ["public", "mine", "PUBLIC"],
  ["search", "public", undefined],
])(
  "native %s selects its source scope/type instead of conflating public memberships with discovery",
  (section, scope, type) => {
    expect(runInNewContext(prop("scope"), { section })).toBe(scope);
    expect(runInNewContext(prop("type"), { section })).toBe(type);
    expect(runInNewContext(prop("key"), { section })).toBe(section);
  },
);
it("includes pending invitations in typed owned tabs, without treating requests as membership", () => {
  expect(groupRecordMemberRoles).toEqual(["admin", "invited", "accepted"]);
  const list = readFileSync(
    new URL("../../components/groups/GroupList.tsx", import.meta.url),
    "utf8",
  );
  expect(list).toContain('useListSearch(groupRecordMemberRoles, scope === "mine" ? 0 : 4)');
  expect(list).toContain("useGroupRecords(options, scope, filters.search, filters.selected, type)");
  expect(list).toContain('key: "invited"');
  expect(list).not.toContain('key: "requested"');
  expect(list).toContain("<InputFlatList");
});
