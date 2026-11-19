import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

// Static keyboard composition policy, not a rendered sheet or IME measurement.
it("keeps score editing on the 80% SDK keyboard detent without a second keyboard controller", () => {
  const source = readFileSync(
    new URL("../../components/events/TableScoreEditor.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "TableScoreEditor.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const content: ts.JsxOpeningElement[] = [];
  const focus: ts.ArrowFunction[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "BottomSheet.Content")
      content.push(node);
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === "onFocus" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isArrowFunction(node.initializer.expression)
    )
      focus.push(node.initializer.expression);
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(content).toHaveLength(1);
  const attribute = (name: string) => {
    const value = content[0].attributes.properties.find(
      (node): node is ts.JsxAttribute =>
        ts.isJsxAttribute(node) && node.name.getText(file) === name,
    )?.initializer;
    if (!value) throw new Error(`Expected actual SDK keyboard attribute ${name}`);
    return value;
  };
  for (const [name, value] of [
    ["keyboardBehavior", "extend"],
    ["keyboardBlurBehavior", "restore"],
    ["android_keyboardInputMode", "adjustResize"],
  ]) {
    const node = attribute(name);
    expect(ts.isStringLiteral(node) ? node.text : undefined).toBe(value);
  }
  const detents = attribute("snapPoints");
  if (
    !ts.isJsxExpression(detents) ||
    !detents.expression ||
    !ts.isArrayLiteralExpression(detents.expression)
  )
    throw new Error("Expected literal SDK score detents");
  expect(
    detents.expression.elements.map((node) => (ts.isStringLiteral(node) ? node.text : undefined)),
  ).toEqual(["80%"]);
  const top = attribute("topInset");
  expect(ts.isJsxExpression(top) ? top.expression?.getText(file) : undefined).toBe("insets.top");
  expect(focus).toHaveLength(1);
  const expand = focus[0].body;
  if (
    !ts.isBlock(expand) ||
    expand.statements.length !== 1 ||
    !ts.isExpressionStatement(expand.statements[0]) ||
    !ts.isCallExpression(expand.statements[0].expression)
  )
    throw new Error("Expected the score input's explicit SDK focus expansion");
  const call = expand.statements[0].expression;
  expect(call.expression.getText(file)).toBe("snapToPosition");
  expect(call.arguments.map((node) => (ts.isStringLiteral(node) ? node.text : undefined))).toEqual([
    "80%",
  ]);
  expect(source).not.toContain("KeyboardAvoidingView");
  expect(source).not.toContain("Keyboard.addListener");
});

it("keeps sheet focus bookkeeping before the score expansion caller and preserves blur forwarding", () => {
  const source = readFileSync(new URL("../useInputFocus.ts", import.meta.url), "utf8");
  const file = ts.createSourceFile("useInputFocus.ts", source, ts.ScriptTarget.Latest, true);
  const handlers = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ["onFocus", "onBlur"].includes(node.name.getText(file)))
      handlers.set(node.name.getText(file), node.initializer.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const name of ["onFocus", "onBlur"]) {
    const callback = handlers.get(name);
    if (!callback) throw new Error(`Expected actual input ${name} composition`);
    const sheet = callback.indexOf(`sheet.${name}(event)`);
    const caller = callback.indexOf(`${name}?.(event)`);
    expect(sheet).toBeGreaterThanOrEqual(0);
    expect(caller).toBeGreaterThan(sheet);
  }
});
