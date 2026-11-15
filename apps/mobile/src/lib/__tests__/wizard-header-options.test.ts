import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const icons = {
  UsersRound: Symbol("group"),
  CalendarDays: Symbol("event"),
  MapPin: Symbol("location"),
};
const HeaderBackButton = Symbol("small back control");
const backSource = ts.createSourceFile(
  "back.tsx",
  readFileSync(
    new URL("../../components/common/layout/HeaderBackButton.tsx", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const backFactory = backSource.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "headerBackOptions",
);
if (!backFactory) throw new Error("Missing real header Back options");
const backExports: { create?: (onBack: () => void) => unknown } = {};
runInNewContext(
  ts.transpileModule(
    `exports.create = ${backFactory.getText(backSource).replace(/^export /, "")}`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText,
  {
    exports: backExports,
    require: () => ({ jsx: (type: unknown, props: unknown) => ({ type, props }) }),
    HeaderBackButton,
  },
);
function options(path: string, edit: boolean, wizard = false, inline = true, back = vi.fn()) {
  const text = readFileSync(new URL(`../../components/${path}.tsx`, import.meta.url), "utf8");
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "Stack.Screen") {
      const attribute = node.attributes.properties.find(
        (value) => ts.isJsxAttribute(value) && value.name.getText(file) === "options",
      );
      if (
        attribute &&
        ts.isJsxAttribute(attribute) &&
        attribute.initializer &&
        ts.isJsxExpression(attribute.initializer)
      ) {
        const value = attribute.initializer.expression;
        if (value && (!wizard || value.getText(file).includes("headerBackOptions")))
          expression = value;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error("Missing actual screen options");
  const source = ts.transpileModule(`exports.options = (${expression.getText(file)});`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const result: {
    options?: {
      title: string;
      headerTitle?: (props: { children: string }) => { props: { icon: symbol; title: string } };
      headerLeft?: (props: {
        canGoBack: boolean;
      }) => { type: unknown; props: { onPress: () => void } } | null;
      headerBackVisible?: boolean;
    };
  } = {};
  runInNewContext(source, {
    exports: result,
    require: () => ({ jsx: (type: unknown, props: unknown) => ({ type, props }) }),
    ...icons,
    HeaderTitle: () => {},
    headerBackOptions: backExports.create,
    router: { back },
    t: (value: string) => value,
    group: edit ? {} : undefined,
    event: edit ? {} : undefined,
    onClose: inline ? () => {} : undefined,
  });
  if (!result.options) throw new Error("Missing evaluated screen options");
  return result.options;
}
it.each([false, true])(
  "keeps one small Back control dispatching native navigation in the location picker, inline=%s",
  (inline) => {
    const back = vi.fn();
    const picker = options("locations/LocationPicker", false, false, inline, back);
    const merged = {
      headerLeft: () => "old wizard custom back",
      headerBackVisible: false,
      ...picker,
    };
    expect(merged.headerLeft).toBe(picker.headerLeft);
    expect(merged.headerBackVisible).toBe(false);
    expect(picker.headerLeft?.({ canGoBack: false })).toBeNull();
    const control = picker.headerLeft?.({ canGoBack: true });
    expect(control?.type).toBe(HeaderBackButton);
    control?.props.onPress();
    expect(back).toHaveBeenCalledOnce();
    expect(picker.headerTitle?.({ children: picker.title }).props.icon).toBe(icons.MapPin);
  },
);
it("closes an inline picker on native Back while standalone routes retain normal navigation", () => {
  const text = readFileSync(
    new URL("../../components/locations/LocationPicker.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "picker.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let hook: ts.CallExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "usePreventRemove")
      hook = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!hook) throw new Error("Missing native-back route guard");
  const code = ts.transpileModule(hook.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const inline of [false, true]) {
    const close = vi.fn();
    let enabled: boolean | undefined, back: (() => void) | undefined;
    runInNewContext(code, {
      Boolean,
      onClose: inline ? close : undefined,
      usePreventRemove: (value: boolean, callback: () => void) => {
        enabled = value;
        back = callback;
      },
    });
    expect(enabled).toBe(inline);
    if (!back) throw new Error("Missing native Back callback");
    back();
    expect(close).toHaveBeenCalledTimes(inline ? 1 : 0);
  }
});
it.each([
  ["groups/GroupWizard", "UsersRound", "New group", "Edit group"],
  ["events/EventWizard", "CalendarDays", "Create event", "Edit event"],
] as const)(
  "restores complete %s header after inline location confirm/cancel",
  (path, icon, createTitle, editTitle) => {
    for (const edit of [false, true]) {
      for (const exit of ["confirm", "cancel"]) {
        const wizard = options(path, edit, true),
          picker = options("locations/LocationPicker", false);
        const during = { ...wizard, ...picker };
        expect(during.headerTitle?.({ children: during.title }).props.icon).toBe(icons.MapPin);
        // React Navigation merges setOptions; leaving out headerTitle preserves the picker renderer.
        const after = { ...during, ...wizard };
        const header = after.headerTitle?.({ children: after.title });
        expect(header?.props.icon, exit).toBe(icons[icon]);
        expect(header?.props.title).toBe(edit ? editTitle : createTitle);
        expect(after.headerLeft).toBe(wizard.headerLeft);
        expect(after.headerBackVisible).toBe(false);
        expect(after.headerLeft?.({ canGoBack: true })?.type).toBe(HeaderBackButton);
      }
    }
  },
);
