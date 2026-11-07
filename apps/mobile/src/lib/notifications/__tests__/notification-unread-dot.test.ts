import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../../components/${file}.tsx`, import.meta.url), "utf8");

// Execute the real marker function, not RN rendering. Native UI acceptance remains separate.
it("renders a fixed static semantic dot without pulse state, listeners, animation or domain writes", () => {
  const code = source("common/ui/NotificationUnreadDot");
  const file = ts.createSourceFile(
    "dot.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = file.statements.find(ts.isFunctionDeclaration);
  expect(fn).toBeDefined();
  const render = runInNewContext(
    ts
      .transpileModule(`${fn?.getText(file)}; NotificationUnreadDot;`, {
        compilerOptions: {
          jsx: ts.JsxEmit.React,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      })
      .outputText.replace("export ", ""),
    {
      exports: {},
      View: "View",
      useT: () => (id: string) => id,
      React: { createElement: (type: string, props: Record<string, unknown>) => ({ type, props }) },
    },
  );
  expect(render({ active: false })).toBeNull();
  const dot = render({ active: true });
  expect(dot.props.className).toBe("bg-danger");
  expect(dot.props.accessibilityLabel).toBe("Unread updates");
  expect(dot.props.pointerEvents).toBe("none");
  expect(dot.props.style).toEqual({ width: 8, height: 8, borderRadius: 4, flexShrink: 0 });
  expect(code).not.toMatch(/useEffect|useAppStore|withTiming|withRepeat|acknowledge|\.read\(/);
});

it("keeps the card marker after its shrinkable title and precise markers outside voting actions", () => {
  const title = source("common/ui/ListCardBody");
  expect(title.indexOf("{title}")).toBeLessThan(title.indexOf("<NotificationUnreadDot"));
  expect(title).toContain("flexShrink: 1");
  expect(title).not.toContain("numberOfLines={1}");
  for (const row of ["games/GameListRow", "locations/LocationListRow"]) {
    const code = source(row);
    expect(code).toContain("{titleAccessory}");
    expect(code).toContain("flexShrink: 1");
    expect(code).toContain("minWidth: 0");
  }
  const marker = source("notifications/NotificationItem");
  expect(marker).toContain("<NotificationUnreadDot");
  expect(marker).toContain("measureLayout");
  expect(marker).toContain("scrollTo");
  expect(marker).toContain("attention?.read(target)");
  expect(marker).not.toMatch(/Pulse|Border|useAppStore/);
});
