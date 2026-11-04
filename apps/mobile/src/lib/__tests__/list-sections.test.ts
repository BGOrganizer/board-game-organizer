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
it.each([["events/Events", "available"]])(
  "native %s switches only valid canonical sections",
  (name, other) => {
    const setSection = vi.fn();
    const change = runInNewContext(expression(name, "Tabs", "onValueChange"), { setSection });
    change("mine");
    change(other);
    change("foreign");
    expect(setSection.mock.calls).toEqual([["mine"], [other]]);
  },
);
it.each(["mine", "available"])(
  "native EventList keeps Group context unsplit and sends %s only for main Events",
  (section) => {
    const code = expression("events/Events", "EventList", "section");
    expect(runInNewContext(code, { section })).toBe(section);
    const text = readFileSync(
      new URL("../../components/events/EventList.tsx", import.meta.url),
      "utf8",
    );
    expect(text).toContain("useListSearch(eventListStatuses, 0)");
    expect(text).toContain("statuses: filters.selected");
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
it("native Tables has one combined list, no section tabs or source section filter", () => {
  const wrapper = readFileSync(
    new URL("../../components/events/Tables.tsx", import.meta.url),
    "utf8",
  );
  expect(wrapper).toContain("<TableList />");
  expect(wrapper).not.toContain("Tabs");
  const list = readFileSync(
    new URL("../../components/events/TableList.tsx", import.meta.url),
    "utf8",
  );
  expect(list).toContain("useRecordTables(o, null, { query: f.search, statuses: f.selected })");
  expect(list).not.toContain("TableListSection");
});
it("main native strips share Groups geometry while detail tabs retain independent spacing", () => {
  const shared = readFileSync(
    new URL("../../components/common/ui/MainTabBar.tsx", import.meta.url),
    "utf8",
  );
  for (const geometry of ['alignSelf: "center"', "marginTop: 8", 'maxWidth: "100%"'])
    expect(shared).toContain(geometry);
  expect(shared).toContain("scrollable = false");
  for (const name of ["events/Events", "groups/Groups"]) {
    const text = readFileSync(new URL(`../../components/${name}.tsx`, import.meta.url), "utf8");
    expect(text).toContain("<MainTabBar>");
    expect(text).toContain("NotificationTabBadge");
  }
  const contacts = readFileSync(new URL("../../app/(tabs)/contacts.tsx", import.meta.url), "utf8");
  expect(contacts).toContain("<MainTabBar>");
  expect(contacts).not.toContain('style={{ flex: 1, overflow: "visible" }}');
  expect(contacts).not.toMatch(/<NotificationCountBadge[^>]*\bcorner\b/s);
  expect(
    readFileSync(new URL("../../components/groups/GroupDetail.tsx", import.meta.url), "utf8"),
  ).toContain("marginTop: 8");
  const code = expression("events/EventList", "FlatList", "contentContainerStyle");
  expect(
    runInNewContext(code, { groupId: undefined, layout: { paddingBottom: 32 } }),
  ).toMatchObject({
    padding: 20,
    paddingTop: 8,
  });
  expect(runInNewContext(code, { groupId: "group", layout: { paddingBottom: 32 } })).toMatchObject({
    padding: 20,
    paddingTop: 0,
  });
  expect(
    readFileSync(new URL("../../components/groups/GroupDetail.tsx", import.meta.url), "utf8"),
  ).toContain("contentContainerStyle={{ paddingTop: 0 }}");
});
it("native top-tab count expression excludes unrelated members from Overview and treats unknown state as no dot", () => {
  const text = readFileSync(
    new URL("../../components/notifications/NotificationTabBadge.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "badge.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let source = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "count")
      source = node.initializer?.getText(file) ?? "";
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(source).not.toBe("");
  const code = ts.transpileModule(`(${source})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const empty = { row: undefined, overviewItems: undefined, attention: undefined };
  expect(runInNewContext(code, empty)).toBeUndefined();
  expect(runInNewContext(code, { ...empty, row: { count: 3 } })).toBe(3);
  expect(
    runInNewContext(code, { ...empty, row: { count: 3, direct: 0 }, overviewItems: ["overview"] }),
  ).toBe(0);
  expect(runInNewContext(code, { ...empty, row: { count: 3, direct: 1 }, overviewItems: [] })).toBe(
    1,
  );
  expect(
    runInNewContext(code, {
      ...empty,
      overviewItems: ["overview"],
      attention: { get: () => ({ count: 2 }) },
    }),
  ).toBe(2);
  expect(
    runInNewContext(code, {
      ...empty,
      overviewItems: ["overview"],
      attention: { get: () => undefined },
    }),
  ).toBe(0);
});

it("native Contact top tabs include unread displayed actors without changing subsection read targets", () => {
  const code = expression("../app/(tabs)/contacts", "NotificationCountBadge", "count");
  const empty = { attention: undefined, section: "search", userIds: [] };
  expect(runInNewContext(code, empty)).toBe(0);
  expect(runInNewContext(code, { ...empty, attention: { get: () => ({ count: 3 }) } })).toBe(3);
  const attention = {
    get: (target: { kind: string; id: string }) =>
      target.kind === "contact" && target.id === "visible" ? { count: 1 } : undefined,
  };
  expect(runInNewContext(code, { ...empty, attention, userIds: ["visible"] })).toBe(1);
  expect(runInNewContext(code, { ...empty, attention, userIds: ["foreign"] })).toBe(0);
  const text = readFileSync(new URL("../../app/(tabs)/contacts.tsx", import.meta.url), "utf8");
  expect(text).toContain('attentionRead.read({ kind: "contacts", id })');
});

it("native list bodies retain a single virtualized list, filters, chips, legend and explicit structural sizing", () => {
  for (const name of ["EventList", "TableList"]) {
    const text = readFileSync(
      new URL(`../../components/events/${name}.tsx`, import.meta.url),
      "utf8",
    );
    expect(text).toContain("<FlatList");
    expect(text).not.toContain("<ScrollView");
    expect(text).toContain('mode="filter"');
    expect(text).toContain('key: "CONFIRMED"');
    expect(text).toContain('key: "PLANNING"');
    expect(text).toContain('key: "TERMINATED"');
    expect(text).not.toContain('key: "past"');
    expect(text).not.toContain('key: "future"');
    expect(text).toContain("fetchNextPage");
  }
  expect(
    readFileSync(new URL("../../components/events/TableList.tsx", import.meta.url), "utf8"),
  ).toContain("<TableListHeading");
});
