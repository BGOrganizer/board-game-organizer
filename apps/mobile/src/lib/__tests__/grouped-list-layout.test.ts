import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

// Executes pure layout expressions from the shared component, not native rendering acceptance.
const text = readFileSync(
  new URL("../../components/common/ui/GroupedList.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "GroupedList.tsx",
  text,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const expressions: Record<string, string> = {};
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ["first", "last"].includes(node.name.getText(file)))
    expressions[node.name.getText(file)] = node.initializer?.getText(file) ?? "";
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "ListGroup")
    for (const attr of node.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer))
        expressions[attr.name.getText(file)] = attr.initializer.expression?.getText(file) ?? "";
    }
  ts.forEachChild(node, visit);
}
visit(file);
function value(key: string, context: Record<string, unknown>) {
  return runInNewContext(
    ts.transpileModule(`(${expressions[key]})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
}
it.each([
  undefined,
  { index: 0, count: 1 },
  { index: 0, count: 3 },
  { index: 1, count: 3 },
  { index: 2, count: 3 },
])("keeps only group outer corners for virtual cell %j", (segment) => {
  const first = value("first", { segment }),
    last = value("last", { segment });
  const style = value("style", { first, last, style: { marginTop: 7 } });
  expect(style.marginTop).toBe(7);
  expect(first).toBe(!segment || segment.index === 0);
  expect(last).toBe(!segment || segment.index === segment.count - 1);
  expect(style.borderTopLeftRadius).toBe(first ? undefined : 0);
  expect(style.borderTopRightRadius).toBe(first ? undefined : 0);
  expect(style.borderBottomLeftRadius).toBe(last ? undefined : 0);
  expect(style.borderBottomRightRadius).toBe(last ? undefined : 0);
  expect(style.padding).toBe(0);
  expect(style.boxShadow).toBe("none");
  expect(text).toContain("<Separator");
  const row = readFileSync(
    new URL("../../components/common/ui/GroupedRow.tsx", import.meta.url),
    "utf8",
  );
  expect(row).not.toContain("border-b");
});
