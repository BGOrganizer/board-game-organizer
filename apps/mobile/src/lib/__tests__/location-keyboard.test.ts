import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute actual callbacks/structure only; not native keyboard, map or touch acceptance.
const load = (path: string) =>
  ts.createSourceFile(
    path,
    readFileSync(new URL(`../../components/${path}`, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
const picker = load("locations/LocationPicker.tsx"),
  input = load("common/ui/SearchInput.tsx");
function nodes(file: ts.SourceFile, match: (node: ts.Node) => boolean) {
  const found: ts.Node[] = [];
  function visit(node: ts.Node) {
    if (match(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}
function element(file: ts.SourceFile, tag: string) {
  return nodes(
    file,
    (node) =>
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === tag,
  )[0] as ts.JsxOpeningElement | ts.JsxSelfClosingElement;
}
function expression(
  file: ts.SourceFile,
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string,
) {
  const attr = node.attributes.properties.find(
    (value) => ts.isJsxAttribute(value) && value.name.getText(file) === name,
  ) as ts.JsxAttribute;
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression)
    throw Error(`Missing expression: ${name}`);
  return attr.initializer.expression.getText(file);
}
const prop = (file: ts.SourceFile, tag: string, name: string) =>
  expression(file, element(file, tag), name);
function evaluate<T>(code: string, bindings: Record<string, unknown> = {}): T {
  return runInNewContext(
    ts.transpileModule(`(${code});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText,
    bindings,
  ) as T;
}
it("keeps map/name/favorites/search in one local keyboard-aware virtualized owner", () => {
  const map = element(picker, "MapLibreMap"),
    name = element(picker, "Input"),
    favorites = element(picker, "LocationFavoriteSelect"),
    search = element(picker, "SearchInput");
  expect(map.pos).toBeLessThan(name.pos);
  expect(name.pos).toBeLessThan(favorites.pos);
  expect(favorites.pos).toBeLessThan(search.pos);
  let parent: ts.Node | undefined = search.parent;
  while (
    parent &&
    !(ts.isJsxAttribute(parent) && parent.name.getText(picker) === "ListHeaderComponent")
  )
    parent = parent.parent;
  expect(parent).toBeDefined();
  const list = element(picker, "InputFlatList").getText(picker);
  for (const token of [
    'keyboardAvoidance="external"',
    'keyboardShouldPersistTaps="handled"',
    'keyboardDismissMode="none"',
    "removeClippedSubviews={false}",
    "data={results}",
  ])
    expect(list).toContain(token);
  expect(
    nodes(
      picker,
      (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(picker) === "ScrollView",
    ),
  ).toHaveLength(0);
  expect(picker.text).toContain("<FormInteractionScope");
  expect(prop(picker, "KeyboardAvoidingView", "keyboardVerticalOffset")).toBe("headerHeight");
  expect(
    evaluate(prop(picker, "KeyboardAvoidingView", "behavior"), { Platform: { OS: "ios" } }),
  ).toBe("padding");
  expect(
    evaluate(prop(picker, "KeyboardAvoidingView", "behavior"), { Platform: { OS: "android" } }),
  ).toBeUndefined();
});
it("never hides, dims or repositions the same mounted 240-point map on input focus", () => {
  const maps = nodes(
    picker,
    (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(picker) === "MapLibreMap",
  );
  expect(maps).toHaveLength(1);
  const map = maps[0] as ts.JsxOpeningElement,
    frame = (map.parent.parent as ts.JsxElement).openingElement;
  expect(evaluate(expression(picker, frame, "style"))).toMatchObject({
    height: 240,
    width: "100%",
    position: "relative",
  });
  expect(frame.getText(picker)).toContain("collapsable={false}");
  expect(frame.getText(picker)).not.toMatch(/opacity|pointerEvents|accessibilityElementsHidden/);
  expect(picker.text).not.toContain("searchMode");
  expect(map.getText(picker)).toContain("attribution");
  expect(map.getText(picker)).toContain("logo");
  expect(prop(picker, "Camera", "initialViewState")).toBe("initialViewState");
});
it("keeps controlled name/favorites and confirmation visible, with validation attempts instead of invalid-field disabling", () => {
  expect(element(picker, "FormSubmitButton")).toBeDefined();
  expect(prop(picker, "Input", "value")).toBe("name");
  expect(prop(picker, "LocationFavoriteSelect", "selectedKey")).toBe("favoriteKey");
  expect(picker.text).not.toContain('display: "none"');
  expect(picker.text).not.toContain("accessibilityElementsHidden");
  const disabled = prop(picker, "FormSubmitButton", "isDisabled");
  expect(evaluate(disabled, { locating: false, mapStyle: "verified-style" })).toBe(false);
  expect(evaluate(disabled, { locating: true, mapStyle: "verified-style" })).toBe(true);
  expect(evaluate(disabled, { locating: false, mapStyle: null })).toBe(true);
  for (const tag of ["Input", "SearchInput"]) {
    let parent: ts.Node | undefined = element(picker, tag).parent;
    while (
      parent &&
      !(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(picker) === "InputField")
    )
      parent = parent.parent;
    expect(parent).toBeDefined();
  }
});
it("manual address edits cancel stale GPS ownership and clear selection without hiding controls", () => {
  const callbacks = Object.fromEntries(
    ["cancelLocate", "setQuery", "setSelected", "setFavoriteKey", "setResults"].map((name) => [
      name,
      vi.fn(),
    ]),
  );
  evaluate<(value: string) => void>(
    prop(picker, "SearchInput", "onChange"),
    callbacks,
  )("New address");
  expect(callbacks.cancelLocate).toHaveBeenCalledOnce();
  expect(callbacks.setQuery).toHaveBeenCalledWith("New address");
  expect(callbacks.setSelected).toHaveBeenCalledWith(null);
  expect(callbacks.setFavoriteKey).toHaveBeenCalledWith(null);
  expect(callbacks.setResults).toHaveBeenCalledWith([]);
  expect(picker.text).not.toContain("Keyboard.addListener");
});
it.each(["ios", "android"])(
  "shares keyboard snapshots and removes native subscriptions after the final owner: %s",
  (OS) => {
    const text = readFileSync(new URL("../useKeyboardHeight.ts", import.meta.url), "utf8");
    const ast = ts.createSourceFile(
      "keyboard.ts",
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const code = ast.statements
      .filter((node) => !ts.isImportDeclaration(node))
      .map((node) => node.getText(ast).replace(/^export /, ""))
      .join("\n");
    const handlers = new Map<string, (event?: unknown) => void>(),
      remove = vi.fn(),
      first = vi.fn(),
      second = vi.fn();
    const Keyboard = {
      metrics: () => ({ height: 180 }),
      addListener: vi.fn((name: string, callback: (event?: unknown) => void) => {
        handlers.set(name, callback);
        return { remove };
      }),
    };
    const store = runInNewContext(
      ts.transpileModule(`${code};({subscribe,snapshot});`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText,
      { Keyboard, Platform: { OS } },
    );
    const stopFirst = store.subscribe(first),
      stopSecond = store.subscribe(second);
    expect(Keyboard.addListener).toHaveBeenCalledTimes(2);
    expect(store.snapshot()).toBe(180);
    handlers.get(OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow")?.({
      endCoordinates: { height: 300 },
    });
    expect(store.snapshot()).toBe(300);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    handlers.get("keyboardDidHide")?.();
    expect(store.snapshot()).toBe(0);
    stopFirst();
    expect(remove).not.toHaveBeenCalled();
    stopSecond();
    expect(remove).toHaveBeenCalledTimes(2);
  },
);
it("selection dismisses keyboard and preserves verified address/zone and camera target", () => {
  const callbacks = Object.fromEntries(
    ["cancelLocate", "setSelected", "setFavoriteKey", "setResults", "setQuery", "moveTo"].map(
      (name) => [name, vi.fn()],
    ),
  );
  const dismiss = vi.fn(),
    scrollToOffset = vi.fn();
  const render = evaluate<(value: unknown) => { props: { onPress: () => void } }>(
    prop(picker, "InputFlatList", "renderItem"),
    {
      ...callbacks,
      React: {
        createElement: (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => ({
          type,
          props: { ...props, children },
        }),
      },
      Pressable: "Pressable",
      Typography: "Typography",
      Keyboard: { dismiss },
      resultsList: { current: { scrollToOffset } },
      formatLocationAddress: (text: string) => text,
    },
  );
  const item = {
    id: "address-1",
    address: "Verified address",
    longitude: 12,
    latitude: 42,
    timeZone: "Europe/Rome",
  };
  render({ item, index: 0 }).props.onPress();
  expect(dismiss).toHaveBeenCalledOnce();
  expect(callbacks.cancelLocate).toHaveBeenCalledOnce();
  expect(callbacks.setSelected).toHaveBeenCalledWith(item);
  expect(callbacks.setFavoriteKey).toHaveBeenCalledWith(null);
  expect(callbacks.setResults).toHaveBeenCalledWith([]);
  expect(callbacks.setQuery).toHaveBeenCalledWith(item.address);
  expect(callbacks.moveTo).toHaveBeenCalledWith(12, 42);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
});
it("forwards native search focus through the shared owner and keeps licensed attribution reachable", () => {
  expect(input.text).toContain("useInputFocus");
  expect(element(input, "SearchField.Input").getText(input)).toContain("{...focus}");
  expect(
    nodes(
      input,
      (node) =>
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(input) === "SearchField.ClearButton",
    ),
  ).toHaveLength(1);
  expect(picker.text).toContain("https://www.openstreetmap.org/copyright");
  expect(picker.text).toContain('t("© OpenStreetMap contributors")');
  expect(picker.text).toContain('t("Map by MapTiler")');
  expect(picker.text).not.toContain("searchMode &&");
});
