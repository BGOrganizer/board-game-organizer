import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { formatUsername } from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it } from "vitest";

// Pure prop/guard policies; actual native owners have separate RNTL tests.
it.each([
  ["player", "@player"],
  [" @player ", "@player"],
  ["", ""],
  [null, ""],
  [undefined, ""],
])(
  "native registered contact rows show the actual handle below the name (%s)",
  (username, expected) => {
    const code = expression("../app/(tabs)/contacts", "UserListRow", "secondary");
    expect(runInNewContext(code, { user: { username }, formatUsername })).toBe(expected);
  },
);

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
function callArgument(name: string, callee: string, index: number) {
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
    if (ts.isCallExpression(node) && node.expression.getText(file) === callee)
      value = node.arguments[index]?.getText(file) ?? "";
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(value).not.toBe("");
  return ts.transpileModule(`(${value})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
    .outputText;
}
it.each(["mine", "available", "terminated", "foreign"])(
  "native Events guards its canonical section input: %s",
  (value) => {
    const code = expression("events/Events", "Tabs", "onValueChange");
    const ast = ts.createSourceFile("guard.ts", code, ts.ScriptTarget.Latest, true);
    let guard = "";
    function visit(node: ts.Node) {
      if (ts.isIfStatement(node)) guard = node.expression.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    expect(guard).not.toBe("");
    expect(runInNewContext(guard, { value })).toBe(value !== "foreign");
  },
);
it.each([
  ["mine", ["CONFIRMED", "PLANNING"]],
  ["available", ["PLANNING"]],
  ["terminated", ["TERMINATED"]],
] as const)(
  "native %s sends fixed source states and keeps Group context on the existing status filters",
  (section, statuses) => {
    const code = callArgument("events/EventList", "useEventRecords", 1);
    const filters = { selected: ["PLANNING", "TERMINATED"], search: "z" };
    const order = { sort: "date", direction: "asc" };
    const eventListStatuses = ["CONFIRMED", "PLANNING", "TERMINATED"];
    const context = { section, filters, order, roles: [], eventListStatuses };
    expect(runInNewContext(code, { ...context, groupId: undefined })).toEqual({
      groupId: undefined,
      section,
      statuses: [...statuses],
      query: "z",
      roles: [],
      order,
    });
    expect(runInNewContext(code, { ...context, groupId: "club" })).toEqual({
      groupId: "club",
      section: undefined,
      statuses: filters.selected,
      query: "z",
      roles: undefined,
      order: undefined,
    });
    const options = expression("events/EventList", "ListSearch", "options");
    const labels = {
      groupId: "club",
      t: (s: string) => s,
      CalendarCheck2: "confirmed",
      CalendarClock: "planning",
      Flag: "terminated",
    };
    expect(runInNewContext(options, labels).map((row: { key: string }) => row.key)).toEqual([
      "CONFIRMED",
      "PLANNING",
      "TERMINATED",
    ]);
  },
);
it.each(["mine", "available", "terminated", "foreign", undefined])(
  "native Event entry validates initial section %s",
  (section) => {
    const code = expression("../app/(tabs)/events", "Events", "initialSection");
    expect(runInNewContext(code, { section })).toBe(
      section === "available" || section === "terminated" ? section : "mine",
    );
  },
);
it("native owned Groups keep source filters independent from discovery", () => {
  const owned = readFileSync(
    new URL("../../components/groups/GroupList.tsx", import.meta.url),
    "utf8",
  );
  const discovery = readFileSync(
    new URL("../../components/groups/GroupSearch.tsx", import.meta.url),
    "utf8",
  );
  expect(owned).toContain('mode="filter"');
  expect(owned).toContain("useListSearch(groupRecordMemberRoles, 0)");
  expect(discovery).toContain("usePublicGroupSearch");
  expect(discovery).not.toContain("groupRecordMemberRoles");
});
it("native History has one terminated source list, no section tabs or chips", () => {
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
  expect(
    runInNewContext(callArgument("events/TableList", "useRecordTables", 2), { f: { search: "z" } }),
  ).toEqual({ query: "z", statuses: ["TERMINATED"] });
  expect(runInNewContext(expression("events/TableList", "ListSearch", "options"))).toEqual([]);
  expect(list).not.toContain("TableListHeading");
  expect(list).not.toContain("TableListSection");
});
it("main native strips share Groups geometry while detail tabs retain independent spacing", () => {
  const shared = readFileSync(
    new URL("../../components/common/ui/MainTabBar.tsx", import.meta.url),
    "utf8",
  );
  for (const geometry of ['alignSelf: "stretch"', "marginTop: 8", 'maxWidth: "100%"'])
    expect(shared).toContain(geometry);
  expect(shared).not.toContain("scrollable");
  const bar = readFileSync(
    new URL("../../components/common/ui/TabBar.tsx", import.meta.url),
    "utf8",
  );
  expect(bar).toContain("Math.min(available, content + 6)");
  expect(bar).toContain("flexGrow: 0");
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
  const code = expression("events/EventList", "InputFlatList", "contentContainerStyle");
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

it("native lists retain one virtualized owner, text filtering, paging and the renamed History navigation", () => {
  for (const name of ["EventList", "TableList"]) {
    const text = readFileSync(
      new URL(`../../components/events/${name}.tsx`, import.meta.url),
      "utf8",
    );
    expect(text).toContain("<InputFlatList");
    expect(text).not.toContain("<ScrollView");
    expect(text).toContain('mode="filter"');
    expect(text).not.toContain('key: "past"');
    expect(text).not.toContain('key: "future"');
    expect(text).toContain("fetchNextPage");
  }
  const layout = readFileSync(new URL("../../app/(tabs)/_layout.tsx", import.meta.url), "utf8");
  expect(layout).toContain('title: t("History")');
  expect(layout).toContain('title={t("History")}');
  const events = readFileSync(
    new URL("../../components/events/Events.tsx", import.meta.url),
    "utf8",
  );
  expect(events).toContain('t("Scheduled")');
  expect(events).toContain('target={{ kind: "event-list", id: "terminated" }}');
});
