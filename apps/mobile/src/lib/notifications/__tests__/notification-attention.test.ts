import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { contactTab } from "../../contacts/contacts";

// Evaluate shipped props/callbacks without loading React Native Flow. Not device UI acceptance.
const badgeSource = readFileSync(
  new URL("../../../components/common/ui/NotificationCountBadge.tsx", import.meta.url),
  "utf8",
);
const badgeFile = ts.createSourceFile(
  "badge.tsx",
  badgeSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declaration = badgeFile.statements.find(ts.isFunctionDeclaration);
if (!declaration) throw new Error("Missing badge component");
const script = ts.transpileModule(declaration.getText(badgeFile), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
  },
}).outputText;
function badge(count: number | undefined, corner = false, counted = false) {
  const exports: {
    NotificationCountBadge?: (props: {
      count?: number;
      corner: boolean;
      counted: boolean;
    }) => { props: Record<string, any> } | null;
  } = {};
  runInNewContext(script, {
    exports,
    View: "View",
    Typography: "Typography",
    useT: () => (message: string) => message,
    React: {
      createElement: (type: string, props: object, child: unknown) => ({
        type,
        props: { ...props, children: child },
      }),
    },
  });
  return exports.NotificationCountBadge?.({ count, corner, counted });
}
it.each([undefined, 0])("omits native badge entirely for %s", (count) =>
  expect(badge(count)).toBeNull(),
);
it.each([1, 99, 130])(
  "retains full accessible count and bell-sized theme-aware native styling for %s",
  (count) => {
    const element = badge(count, false, true);
    expect(element?.props.accessibilityLabel).toBe(`Notifications: ${count}`);
    expect(element?.props.children.props.children).toBe(count > 99 ? "99+" : String(count));
    expect(element?.props.className).toBe("bg-danger");
    expect(element?.props.children.props.className).toBe("text-danger-foreground");
    expect(element?.props.style).toMatchObject({ position: "relative", minWidth: 16, height: 16 });
    expect(badge(count, true, true)?.props.style).toMatchObject({
      position: "absolute",
      top: -8,
      right: -8,
    });
  },
);
it("uses a small numberless dot outside cards while leaving the bell's counter intact", () => {
  const element = badge(130, true);
  expect(element?.props.accessibilityLabel).toBe("Needs attention");
  expect(element?.props.children).toBeNull();
  expect(element?.props.style).toMatchObject({ minWidth: 8, height: 8, top: -4, right: -4 });
});
it.each(["connections", "requests", "search"])(
  "native inner selection reads only %s and retains route state",
  (section) => {
    const source = readFileSync(
      new URL("../../../app/(tabs)/contacts.tsx", import.meta.url),
      "utf8",
    );
    const file = ts.createSourceFile(
      "contacts.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let expression = "";
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "Tabs") {
        const attr = node.attributes.properties
          .filter(ts.isJsxAttribute)
          .find((value) => value.name.getText(file) === "onValueChange");
        if (attr?.initializer && ts.isJsxExpression(attr.initializer))
          expression = attr.initializer.expression?.getText(file) ?? "";
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    const readSection = vi.fn(),
      setParams = vi.fn();
    runInNewContext(
      ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
        .outputText,
      { contactTab, readSection, router: { setParams } },
    )(section);
    expect(readSection).toHaveBeenCalledExactlyOnceWith(section);
    expect(setParams).toHaveBeenCalledWith({ tab: section });
    expect(source).not.toContain("readOnOpen=");
  },
);
