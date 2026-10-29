import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Real callback/structure contracts only: not native keyboard or MapLibre rendering acceptance.
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
    (p) => ts.isJsxAttribute(p) && p.name.getText(file) === name,
  ) as ts.JsxAttribute;
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression)
    throw Error(`Missing expression: ${name}`);
  return attr.initializer.expression.getText(file);
}
function prop(file: ts.SourceFile, tag: string, name: string) {
  return expression(file, element(file, tag), name);
}
function evaluate<T>(code: string, bindings: Record<string, unknown> = {}): T {
  const js = ts.transpileModule(`(${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(js, bindings) as T;
}
function visibilityParent(node: ts.Node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isJsxElement(current) &&
      current.openingElement.tagName.getText(picker) === "View" &&
      current.openingElement.getText(picker).includes("display: searchMode")
    )
      return current.openingElement;
    current = current.parent;
  }
  throw Error("Missing search visibility container");
}
it("restores the original map/name/favorites/search order inside the one virtualized list", () => {
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
  expect(
    nodes(
      picker,
      (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(picker) === "ScrollView",
    ),
  ).toHaveLength(0);
  const list = element(picker, "FlatList").getText(picker);
  for (const p of [
    'keyboardShouldPersistTaps="handled"',
    'keyboardDismissMode="none"',
    "removeClippedSubviews={false}",
    "data={results}",
  ])
    expect(list).toContain(p);
  expect(picker.text).not.toContain("automaticallyAdjustKeyboardInsets");
  expect(prop(picker, "KeyboardAvoidingView", "keyboardVerticalOffset")).toBe("headerHeight");
  expect(
    evaluate(prop(picker, "KeyboardAvoidingView", "behavior"), { Platform: { OS: "ios" } }),
  ).toBe("padding");
  expect(
    evaluate(prop(picker, "KeyboardAvoidingView", "behavior"), { Platform: { OS: "android" } }),
  ).toBeUndefined();
});
it("hides the same mounted map without changing its 240-point bounds, style or frozen camera", () => {
  const maps = nodes(
    picker,
    (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(picker) === "MapLibreMap",
  );
  expect(maps).toHaveLength(1);
  const map = maps[0] as ts.JsxOpeningElement,
    frame = (map.parent.parent as ts.JsxElement).openingElement;
  const code = expression(picker, frame, "style");
  expect(evaluate(code, { searchMode: true })).toMatchObject({
    height: 240,
    width: "100%",
    position: "absolute",
    opacity: 0,
  });
  expect(evaluate(code, { searchMode: false })).toMatchObject({
    height: 240,
    width: "100%",
    position: "relative",
    opacity: 1,
  });
  expect(frame.getText(picker)).toContain("collapsable={false}");
  for (const searchMode of [true, false]) {
    expect(evaluate(expression(picker, frame, "pointerEvents"), { searchMode })).toBe(
      searchMode ? "none" : "auto",
    );
    expect(evaluate(expression(picker, frame, "accessibilityElementsHidden"), { searchMode })).toBe(
      searchMode,
    );
  }
  let parent: ts.Node | undefined = map.parent;
  while (parent) {
    if (ts.isConditionalExpression(parent))
      expect(parent.condition.getText(picker)).not.toContain("searchMode");
    parent = parent.parent;
  }
  expect(map.getText(picker)).toContain("attribution");
  expect(map.getText(picker)).toContain("logo");
  expect(prop(picker, "Camera", "initialViewState")).toBe("initialViewState");
});
it("hides name, favorites and confirm together, preserving controlled draft values and restoring visibility", () => {
  const confirm = nodes(
    picker,
    (node) =>
      ts.isJsxOpeningElement(node) &&
      node.tagName.getText(picker) === "Button" &&
      node.parent.getText(picker).includes('t("Confirm location")'),
  )[0];
  expect(confirm).toBeDefined();
  for (const node of [
    element(picker, "Input"),
    element(picker, "LocationFavoriteSelect"),
    confirm,
  ]) {
    const wrapper = visibilityParent(node);
    expect(evaluate(expression(picker, wrapper, "style"), { searchMode: true })).toMatchObject({
      display: "none",
    });
    expect(evaluate(expression(picker, wrapper, "style"), { searchMode: false })).toMatchObject({
      display: "flex",
    });
    expect(
      evaluate(expression(picker, wrapper, "accessibilityElementsHidden"), { searchMode: true }),
    ).toBe(true);
  }
  expect(prop(picker, "Input", "value")).toBe("name");
  expect(prop(picker, "LocationFavoriteSelect", "selectedKey")).toBe("favoriteKey");
});
it("focus activates search immediately; blur does not move a row before its selection press", () => {
  const setSearchMode = vi.fn(),
    addressFocused = { current: false };
  evaluate<() => void>(prop(picker, "SearchInput", "onFocus"), { setSearchMode, addressFocused })();
  expect(addressFocused.current).toBe(true);
  expect(setSearchMode).toHaveBeenCalledWith(true);
  setSearchMode.mockClear();
  evaluate<() => void>(prop(picker, "SearchInput", "onBlur"), { addressFocused })();
  expect(addressFocused.current).toBe(false);
  expect(setSearchMode).not.toHaveBeenCalled();
  const wrapper = (element(picker, "SearchInput").parent as ts.JsxElement).openingElement;
  const scrollToOffset = vi.fn();
  for (const searchMode of [true, false]) {
    scrollToOffset.mockClear();
    evaluate<() => void>(expression(picker, wrapper, "onLayout"), {
      searchMode,
      resultsList: { current: { scrollToOffset } },
    })();
    expect(scrollToOffset).toHaveBeenCalledTimes(searchMode ? 1 : 0);
  }
});
it.each(["ios", "android"])("handles keyboard reopen/hide and removes subscriptions: %s", (OS) => {
  const effect = nodes(
    picker,
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(picker) === "useEffect" &&
      node.arguments[0].getText(picker).includes("Keyboard.addListener"),
  )[0] as ts.CallExpression;
  const handlers = new Map<string, () => void>(),
    remove = vi.fn(),
    setSearchMode = vi.fn(),
    scrollToOffset = vi.fn(),
    addressFocused = { current: false };
  const Keyboard = {
    addListener: (name: string, fn: () => void) => {
      handlers.set(name, fn);
      return { remove };
    },
  };
  const cleanup = evaluate<() => () => void>(effect.arguments[0].getText(picker), {
    Keyboard,
    Platform: { OS },
    setSearchMode,
    addressFocused,
    resultsList: { current: { scrollToOffset } },
  })();
  const shown = handlers.get("keyboardDidShow");
  shown?.();
  expect(setSearchMode).not.toHaveBeenCalled();
  addressFocused.current = true;
  shown?.();
  expect(setSearchMode).toHaveBeenLastCalledWith(true);
  handlers.get("keyboardDidHide")?.();
  expect(setSearchMode).toHaveBeenLastCalledWith(false);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
  cleanup();
  expect(remove).toHaveBeenCalledTimes(2);
});
it("selection dismisses keyboard, exits focus mode and preserves verified address/zone and camera target", () => {
  const createElement = (
    type: unknown,
    props: Record<string, unknown>,
    ...children: unknown[]
  ) => ({ type, props: { ...props, children } });
  const callbacks = Object.fromEntries(
    [
      "cancelLocate",
      "setSearchMode",
      "setSelected",
      "setFavoriteKey",
      "setResults",
      "setQuery",
      "moveTo",
    ].map((key) => [key, vi.fn()]),
  );
  const dismiss = vi.fn(),
    scrollToOffset = vi.fn(),
    addressFocused = { current: true };
  const render = evaluate<(value: unknown) => { props: { onPress: () => void } }>(
    prop(picker, "FlatList", "renderItem"),
    {
      ...callbacks,
      React: { createElement },
      Pressable: "Pressable",
      Typography: "Typography",
      Keyboard: { dismiss },
      addressFocused,
      resultsList: { current: { scrollToOffset } },
      formatLocationAddress: (s: string) => s,
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
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(addressFocused.current).toBe(false);
  expect(callbacks.setSearchMode).toHaveBeenCalledWith(false);
  expect(callbacks.cancelLocate).toHaveBeenCalledTimes(1);
  expect(callbacks.setSelected).toHaveBeenCalledWith(item);
  expect(callbacks.setFavoriteKey).toHaveBeenCalledWith(null);
  expect(callbacks.setResults).toHaveBeenCalledWith([]);
  expect(callbacks.setQuery).toHaveBeenCalledWith(item.address);
  expect(callbacks.moveTo).toHaveBeenCalledWith(12, 42);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
});
it("keeps native focus forwarding, clear control and visible licensed attribution during search", () => {
  expect(prop(input, "SearchField.Input", "onFocus")).toBe("onFocus");
  expect(prop(input, "SearchField.Input", "onBlur")).toBe("onBlur");
  expect(
    nodes(
      input,
      (node) =>
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(input) === "SearchField.ClearButton",
    ),
  ).toHaveLength(1);
  const footer = nodes(
    picker,
    (node) => ts.isConditionalExpression(node) || ts.isBinaryExpression(node),
  ).find(
    (node) =>
      node.getText(picker).startsWith("searchMode &&") &&
      node.getText(picker).includes("openstreetmap.org/copyright"),
  );
  expect(footer?.getText(picker)).toContain('t("© OpenStreetMap contributors")');
  expect(footer?.getText(picker)).toContain('t("Map by MapTiler")');
});
