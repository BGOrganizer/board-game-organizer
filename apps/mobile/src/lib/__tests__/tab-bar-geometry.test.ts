import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute application layout/callback logic; native pixel rendering remains device acceptance.
const text = readFileSync(
  new URL("../../components/common/ui/TabBar.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "TabBar.tsx",
  text,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const fn = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "TabBar",
);
if (!fn) throw new Error("TabBar function missing");
const code = ts.transpileModule(
  `${fn.getText(file).replace(/^export /, "")}; TabBar({children: "tabs"});`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
).outputText;
it.each([
  [320, 160, 166],
  [320, 400, 320],
  [1024, 400, 406],
  [390, 1100, 390],
])("clamps real tab content %s/%s to %s without trailing fill", (available, content, expected) => {
  const setAvailable = vi.fn(),
    setContent = vi.fn();
  let hook = 0;
  const tree = runInNewContext(code, {
    React: {
      createElement: (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({
        type,
        props,
        children,
      }),
    },
    View: "View",
    Tabs: { List: "List", ScrollView: "ScrollView", Indicator: "Indicator" },
    useState: () => (hook++ === 0 ? [available, setAvailable] : [content, setContent]),
  });
  const list = tree.children[0],
    scroll = list.children[0];
  expect(list.props.style.at(-1)).toMatchObject({
    width: expected,
    alignSelf: "center",
    maxWidth: "100%",
  });
  expect(scroll.props.contentContainerStyle).toEqual({ flexGrow: 0 });
  expect(scroll.props.style).toEqual({ flexGrow: 0, flexShrink: 1 });
  tree.props.onLayout({ nativeEvent: { layout: { width: 500 } } });
  scroll.props.onContentSizeChange(220);
  expect(setAvailable).toHaveBeenCalledWith(500);
  expect(setContent).toHaveBeenCalledWith(220);
});
it("retains minimum native targets without forcing a smaller font or flex-growing each tab", () => {
  const trigger = readFileSync(
    new URL("../../components/common/ui/TabTrigger.tsx", import.meta.url),
    "utf8",
  );
  expect(trigger).toContain("minHeight: 44");
  expect(trigger).toContain("flexShrink: 0");
  expect(trigger).not.toContain("fontSize");
  expect(trigger).not.toContain("flexGrow: 1");
});
