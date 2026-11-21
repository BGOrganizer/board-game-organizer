import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

// Source contract for SDK props. Rendering and device tests cover interaction separately.
it("sizes the score sheet to its content and delegates keyboard movement and restoration to the SDK", () => {
  const source = readFileSync(
    new URL("../../components/events/TableScoreEditor.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain('keyboardBehavior="interactive"');
  expect(source).toContain('keyboardBlurBehavior="restore"');
  expect(source).toContain("topInset={insets.top}");
  expect(source).toMatch(/<InputScrollView\s+sizing="content"/);
  expect(source).not.toMatch(
    /snapPoints=|snapToPosition|enableDynamicSizing|onFocus=|KeyboardAvoidingView|Keyboard\.addListener/,
  );
});

it("sets sheet keyboard state before forwarding input focus and blur", () => {
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
