import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Native callback execution, not React Native rendering/device acceptance.
function source(name: string) {
  return ts.createSourceFile(
    name,
    readFileSync(new URL(`../../components/profile/${name}.tsx`, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
function attribute(name: string, tag: string, prop: string, label?: string) {
  const file = source(name);
  let expression = "";
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === tag
    ) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      if (
        !label ||
        attrs.some(
          (attr) =>
            attr.name.getText(file) === "accessibilityLabel" &&
            attr.initializer?.getText(file).includes(label),
        )
      ) {
        const value = attrs.find((attr) => attr.name.getText(file) === prop)?.initializer;
        if (value && ts.isJsxExpression(value)) expression = value.expression?.getText(file) ?? "";
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error(`Missing ${name}/${tag}/${prop}`);
  return expression;
}
function initializer(name: string, variable: string) {
  const file = source(name);
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === variable)
      expression = node.initializer?.getText(file) ?? "";
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error(`Missing ${name}/${variable}`);
  return expression;
}
function evaluate(expression: string, context: Record<string, unknown>) {
  return runInNewContext(
    ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText,
    context,
  );
}
it.each([undefined, { value: "7", label: "Chess" }])(
  "supports empty/selected native game values: %j",
  (value) => {
    const setView = vi.fn();
    evaluate(attribute("ProfilePlayer", "Select", "onValueChange"), { setView, viewKey: "scope" })(
      value,
    );
    expect(setView).toHaveBeenCalledWith("scope", { gameId: value ? 7 : null });
  },
);
it("clears native selection through a separate accessible action and hides cached history at null", () => {
  const setView = vi.fn();
  evaluate(attribute("ProfilePlayer", "Button", "onPress", "Clear selected game"), {
    setView,
    viewKey: "scope",
  })();
  expect(setView).toHaveBeenCalledWith("scope", { gameId: null });
  const context = {
    games: {},
    history: { data: { pages: [{ rating: 42 }] } },
    communityAccessDenied: () => false,
  };
  expect(
    evaluate(initializer("ProfilePlayer", "data"), { ...context, gameId: null }),
  ).toBeUndefined();
  expect(evaluate(initializer("ProfilePlayer", "data"), { ...context, gameId: 7 })).toEqual({
    rating: 42,
  });
});
it.each([true, false])("allows Collection selection only for owner: %s", (own) => {
  const setView = vi.fn();
  const choose = evaluate(attribute("Profile", "Tabs", "onValueChange"), {
    own,
    setView,
    viewKey: "scope",
  });
  choose("collection");
  expect(setView).toHaveBeenCalledTimes(own ? 1 : 0);
  if (own) expect(setView).toHaveBeenCalledWith("scope", { tab: "collection" });
  expect(evaluate(initializer("Profile", "tab"), { own, storedTab: "collection" })).toBe(
    own ? "collection" : "activity",
  );
});
