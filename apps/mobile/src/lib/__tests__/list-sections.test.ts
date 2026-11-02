import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Actual native handler/prop expressions; not rendered/device acceptance.
function expression(name: string, tag: string, attribute: string) {
  const text = readFileSync(new URL(`../../components/${name}.tsx`, import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "native.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let value = "";
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === tag
    ) {
      const prop = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((p) => p.name.getText(file) === attribute)?.initializer;
      if (prop && ts.isJsxExpression(prop)) value = prop.expression?.getText(file) ?? "";
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(value).not.toBe("");
  return ts.transpileModule(`(${value})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
    .outputText;
}
it.each([
  ["events/Events", "available"],
  ["events/Tables", "waiting"],
])("native %s switches only valid canonical sections", (name, other) => {
  const setSection = vi.fn();
  const change = runInNewContext(expression(name, "Tabs", "onValueChange"), { setSection });
  change("mine");
  change(other);
  change("foreign");
  expect(setSection.mock.calls).toEqual([["mine"], [other]]);
});
it.each(["mine", "available"])(
  "native EventList keeps Group context unsplit and sends %s only for main Events",
  (section) => {
    const code = expression("events/Events", "EventList", "section");
    expect(runInNewContext(code, { section })).toBe(section);
    const text = readFileSync(
      new URL("../../components/events/EventList.tsx", import.meta.url),
      "utf8",
    );
    expect(text).toContain('useListSearch(["past", "future"] as const, 0)');
    expect(text).toContain("section: groupId ? undefined : section");
    expect(text).toContain('mode="filter"');
  },
);
it.each(["mine", "public"])(
  "native Group %s keeps its appropriate filtering/discovery help and minimum",
  (scope) => {
    const mode = runInNewContext(expression("groups/GroupList", "ListSearch", "mode"), { scope });
    expect(mode).toBe(scope === "mine" ? "filter" : "search");
    const text = readFileSync(
      new URL("../../components/groups/GroupList.tsx", import.meta.url),
      "utf8",
    );
    expect(text).toContain('useListSearch(groupRecordMemberRoles, scope === "mine" ? 0 : 4)');
  },
);
it("native list bodies retain a single virtualized list, filters, chips, legend and explicit structural sizing", () => {
  for (const name of ["EventList", "TableList"]) {
    const text = readFileSync(
      new URL(`../../components/events/${name}.tsx`, import.meta.url),
      "utf8",
    );
    expect(text).toContain("<FlatList");
    expect(text).not.toContain("<ScrollView");
    expect(text).toContain('mode="filter"');
    expect(text).toContain('key: "past"');
    expect(text).toContain('key: "future"');
    expect(text).toContain("fetchNextPage");
  }
  expect(
    readFileSync(new URL("../../components/events/TableList.tsx", import.meta.url), "utf8"),
  ).toContain("<TableListHeading");
});
