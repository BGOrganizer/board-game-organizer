import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../../components/groups/GroupMembers.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "members.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function nodes(predicate: (node: ts.Node) => boolean) {
  const result: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}
function evaluate(expression: string, bindings: Record<string, unknown>) {
  return runInNewContext(
    ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText,
    bindings,
  );
}
// Execute real native callbacks/props without importing RN Flow. Not rendered/device acceptance.
it("tracks actual FlatList visible users and forwards native viewability rather than synthetic visibility", () => {
  const declaration = nodes(
    (node) =>
      ts.isVariableDeclaration(node) && node.name.getText(file) === "onViewableItemsChanged",
  )[0] as ts.VariableDeclaration;
  const callback = (declaration.initializer as ts.CallExpression).arguments[0];
  const setVisibleIds = vi.fn();
  evaluate(callback.getText(file), { setVisibleIds })({
    viewableItems: [
      { isViewable: true, item: { userId: "visible" } },
      { isViewable: false, item: { userId: "offscreen" } },
    ],
  });
  expect([...setVisibleIds.mock.calls[0][0]]).toEqual(["visible"]);
  const list = readFileSync(
    new URL("../../../components/common/ui/UserList.tsx", import.meta.url),
    "utf8",
  );
  expect(list).toContain("onViewableItemsChanged={onViewableItemsChanged}");
  expect(list).toContain("viewabilityConfig={viewabilityConfig}");
  expect(source).toContain("itemVisiblePercentThreshold: 100");
});
it("native app/screen changes stop viewing, and only a visible uncovered member can start dwell", () => {
  const app = nodes(
    (node) =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.getText(file) === "AppState.addEventListener",
  )[0] as ts.CallExpression;
  const setActive = vi.fn(),
    setFocused = vi.fn();
  const appCallback = evaluate(app.arguments[1].getText(file), { setActive });
  for (const state of ["active", "inactive", "background"]) appCallback(state);
  expect(setActive.mock.calls.map(([value]) => value)).toEqual([true, false, false]);
  const focus = nodes(
    (node) => ts.isCallExpression(node) && node.expression.getText(file) === "useFocusEffect",
  )[0] as ts.CallExpression;
  const focusCallback = (focus.arguments[0] as ts.CallExpression).arguments[0];
  const cleanup = evaluate(focusCallback.getText(file), { setFocused })();
  cleanup();
  expect(setFocused.mock.calls.map(([value]) => value)).toEqual([true, false]);
  const component = nodes(
    (node) =>
      ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "GroupMemberAttention",
  )[0] as ts.JsxSelfClosingElement;
  const attr = component.attributes.properties
    .filter(ts.isJsxAttribute)
    .find((attr) => attr.name.getText(file) === "visible");
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression)
    throw new Error("Missing member visibility expression");
  const expression = attr.initializer.expression.getText(file);
  const visibleIds = new Set(["member"]),
    person = { userId: "member" };
  const bindings = { focused: true, active: true, managed: null, menu: null, visibleIds, person };
  expect(evaluate(expression, bindings)).toBe(true);
  for (const patch of [
    { focused: false },
    { active: false },
    { managed: {} },
    { menu: "open" },
    { visibleIds: new Set() },
  ])
    expect(evaluate(expression, { ...bindings, ...patch })).toBe(false);
});
