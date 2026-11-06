import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Native callback execution, not React Native rendering/device acceptance.
function source(name: string) {
  return ts.createSourceFile(
    name,
    readFileSync(
      new URL(
        `../../components/${name === "RatingGameSelect" ? "ratings" : "profile"}/${name}.tsx`,
        import.meta.url,
      ),
      "utf8",
    ),
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
    const onChange = (gameId: number | null) =>
      evaluate(attribute("ProfilePlayer", "RatingGameSelect", "onChange"), {
        setView,
        viewKey: "scope",
      })(gameId);
    evaluate(attribute("RatingGameSelect", "Select", "onValueChange"), { onChange })(value);
    expect(setView).toHaveBeenCalledWith("scope", { gameId: value ? 7 : null });
  },
);
it("clears native selection through a separate accessible action and hides cached history at null", () => {
  const setView = vi.fn();
  const onChange = (gameId: number | null) =>
    evaluate(attribute("ProfilePlayer", "RatingGameSelect", "onChange"), {
      setView,
      viewKey: "scope",
    })(gameId);
  evaluate(attribute("RatingGameSelect", "Button", "onPress", "Clear board game selection"), {
    onChange,
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
it.each([
  { own: true, published: true, denied: false },
  { own: true, published: false, denied: false },
  { own: false, published: true, denied: false },
  { own: true, published: true, denied: true },
  { own: false, published: false, denied: false },
  { own: false, published: true, denied: true },
])(
  "allows Collection only for an authorized subject's published snapshot: %j",
  ({ own, published, denied }) => {
    const setView = vi.fn();
    const active = evaluate(initializer("Profile", "active"), {
      own,
      q: {
        error: denied ? new Error("404") : null,
        data: { collection: published ? { snapshot: "snapshot" } : null },
      },
      communityAccessDenied: () => denied,
      bgg: {
        account: {
          data: { active: published ? { snapshot: "snapshot" } : null },
          error: denied ? new Error("401") : null,
        },
      },
    });
    const allowed = published && !denied;
    const choose = evaluate(attribute("Profile", "Tabs", "onValueChange"), {
      active,
      setView,
      viewKey: "scope",
    });
    choose("collection");
    expect(setView).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) expect(setView).toHaveBeenCalledWith("scope", { tab: "collection" });
    expect(evaluate(initializer("Profile", "tab"), { active, storedTab: "collection" })).toBe(
      allowed ? "collection" : "activity",
    );
  },
);
