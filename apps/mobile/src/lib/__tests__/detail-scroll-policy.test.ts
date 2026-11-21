import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

// Static ownership/validation policies; actual component lifecycle has RNTL coverage.
const source = (path: string) =>
  readFileSync(new URL(`../../components/${path}.tsx`, import.meta.url), "utf8");

it.each([
  ["groups/GroupDetail", "GroupIdentityCard", "<GroupMembers", "<Leaderboard"],
  ["events/EventDetail", "EventDetailsCard", "<EventParticipants", "ListHeaderComponent="],
  ["events/EventTable", "EventTableInfo", "<EventTableResults", "<EventTableOverview"],
])("places the %s identity and tab bar in the active scroll header", (path, card, ...consumers) => {
  const text = source(path);
  const ast = ts.createSourceFile(
    "detail.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let header = "";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "detailHeader")
      header = node.initializer?.getText(ast) ?? "";
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(header).toContain(`<${card}`);
  expect(header).toContain("<TabBar");
  for (const consumer of consumers) expect(text).toContain(consumer);
  expect(text).toContain("header={detailHeader}");
  expect(text).not.toMatch(/stickyHeaderIndices|nestedScrollEnabled|scrollEnabled=\{false\}/);
});

// The wizard must still reveal invalid virtualized rows after decorative observers are removed.
it("keeps wizard validation viewability and recovery on the same scoped native list", () => {
  const text = source("events/EventWizard");
  const ast = ts.createSourceFile(
    "wizard.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let list: ts.JsxSelfClosingElement | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "InputFlatList")
      list = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!list) throw new Error("Missing wizard list");
  const attributes = list.attributes.properties;
  expect(
    attributes.some(
      (attribute) =>
        ts.isJsxSpreadAttribute(attribute) && attribute.expression.getText(ast) === "validation",
    ),
  ).toBe(true);
  const viewability = attributes.find(
    (attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "onViewableItemsChanged",
  );
  expect(viewability?.getText(ast)).toBe(
    "onViewableItemsChanged={validation.onViewableItemsChanged}",
  );
  expect(attributes.some((attribute) => attribute.getText(ast) === "key={validationScope}")).toBe(
    true,
  );
});

function groupPanelSource() {
  const ast = ts.createSourceFile(
    "group.tsx",
    source("groups/GroupDetail"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const panels: ts.JsxElement[] = [];
  const declarations = new Map<string, ts.VariableDeclaration>();
  let changesHooks = 0;
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "RetainedTabPanel")
      panels.push(node);
    if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(ast), node);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useNotificationChanges")
      changesHooks++;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const attribute = (element: ts.JsxOpeningElement, name: string) => {
    const property = element.attributes.properties.find(
      (node) => ts.isJsxAttribute(node) && node.name.getText(ast) === name,
    );
    if (
      !property ||
      !ts.isJsxAttribute(property) ||
      !property.initializer ||
      !ts.isJsxExpression(property.initializer) ||
      !property.initializer.expression
    )
      throw new Error(`Missing ${name} expression`);
    return property.initializer.expression.getText(ast);
  };
  return { ast, panels, declarations, changesHooks, attribute };
}

it("isolates each retained Group panel's tab measurements and scopes its identity to the current owner", () => {
  const h = groupPanelSource();
  expect(h.panels).toHaveLength(4);
  const destinations = new Map([
    ["info", "ScreenScrollView"],
    ["members", "GroupMembers"],
    ["events", "Events"],
    ["rankings", "Leaderboard"],
  ]);
  const seen = new Set<string>();
  for (const panel of h.panels) {
    const opening = panel.openingElement;
    const key = h.attribute(opening, "key");
    const keyFor = (apiUrl: string, userId: string, id: string): string =>
      runInNewContext(key, { o: { apiUrl, userId }, group: { id } });
    const ownerKey = JSON.parse(keyFor("preview", "actor", "group")) as string[];
    const destination = ownerKey[3];
    expect(ownerKey).toEqual(["preview", "actor", "group", destination]);
    expect(destinations.has(destination)).toBe(true);
    expect(seen.has(destination)).toBe(false);
    seen.add(destination);
    expect(keyFor("other-preview", "actor", "group")).not.toBe(JSON.stringify(ownerKey));
    expect(keyFor("preview", "other-actor", "group")).not.toBe(JSON.stringify(ownerKey));
    expect(keyFor("preview", "actor", "other-group")).not.toBe(JSON.stringify(ownerKey));
    const active = h.attribute(opening, "active");
    for (const selectedTab of destinations.keys())
      expect(runInNewContext(active, { panelTab: selectedTab })).toBe(selectedTab === destination);
    const roots = panel.children.filter((node): node is ts.JsxElement => ts.isJsxElement(node));
    expect(roots).toHaveLength(1);
    const tabs = roots[0];
    expect(tabs.openingElement.tagName.getText(h.ast)).toBe("Tabs");
    expect(h.attribute(tabs.openingElement, "value")).toBe("selectedTab");
    expect(h.attribute(tabs.openingElement, "onValueChange")).toBe("changeTab");
    const content = h.declarations.get(`${destination}Content`)?.initializer?.getText(h.ast);
    expect(content ?? tabs.getText(h.ast)).toContain(`<${destinations.get(destination)}`);
    if (destination !== "info") {
      let guard: ts.Node | undefined = panel.parent;
      while (guard && !ts.isConditionalExpression(guard)) guard = guard.parent;
      if (!guard || !ts.isConditionalExpression(guard)) throw new Error("Missing permission guard");
      expect(guard.condition.getText(h.ast)).toBe(
        `group.${destination === "members" ? "canViewMembers" : destination === "events" ? "canViewEvents" : "canViewRankings"}`,
      );
      expect(guard.whenFalse.getText(h.ast)).toBe("null");
    }
  }
  expect([...seen]).toEqual([...destinations.keys()]);
  expect(h.changesHooks).toBe(1);
});

it("falls back to Group Details whenever a selected destination is no longer authorized", () => {
  const h = groupPanelSource();
  const expression = h.declarations.get("selectedTab")?.initializer?.getText(h.ast);
  if (!expression) throw new Error("Missing authorized Group selection");
  for (let mask = 0; mask < 8; mask++) {
    const group = {
      canViewMembers: Boolean(mask & 1),
      canViewEvents: Boolean(mask & 2),
      canViewRankings: Boolean(mask & 4),
    };
    for (const tab of ["info", "members", "events", "rankings", "unknown"]) {
      const allowed =
        tab === "members"
          ? group.canViewMembers
          : tab === "events"
            ? group.canViewEvents
            : tab === "rankings"
              ? group.canViewRankings
              : false;
      expect(runInNewContext(expression, { group, tab })).toBe(allowed ? tab : "info");
    }
  }
  expect(runInNewContext(expression, { group: undefined, tab: "members" })).toBe("info");
});

it("never keeps a deferred Group panel visible after its permission is revoked", () => {
  const h = groupPanelSource();
  const expression = h.declarations.get("panelTab")?.initializer?.getText(h.ast);
  if (!expression) throw new Error("Missing authorized deferred Group selection");
  for (let mask = 0; mask < 8; mask++) {
    const group = {
      canViewMembers: Boolean(mask & 1),
      canViewEvents: Boolean(mask & 2),
      canViewRankings: Boolean(mask & 4),
    };
    for (const deferredTab of ["info", "members", "events", "rankings", "unknown"]) {
      const allowed =
        deferredTab === "members"
          ? group.canViewMembers
          : deferredTab === "events"
            ? group.canViewEvents
            : deferredTab === "rankings"
              ? group.canViewRankings
              : false;
      expect(runInNewContext(expression, { group, deferredTab })).toBe(
        allowed ? deferredTab : "info",
      );
    }
  }
});
