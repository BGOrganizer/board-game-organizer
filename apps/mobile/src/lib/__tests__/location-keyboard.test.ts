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
const picker = load("locations/LocationPicker.tsx");
const input = load("common/ui/SearchInput.tsx");
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
function prop(file: ts.SourceFile, tag: string, name: string) {
  const attr = element(file, tag).attributes.properties.find(
    (node) => ts.isJsxAttribute(node) && node.name.getText(file) === name,
  ) as ts.JsxAttribute;
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression)
    throw Error(`Missing expression: ${tag}.${name}`);
  return attr.initializer.expression.getText(file);
}
function evaluate<T>(expression: string, bindings: Record<string, unknown> = {}): T {
  const js = ts.transpileModule(`(${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(js, bindings) as T;
}
it("reads initial keyboard visibility without detaching the native instance method", () => {
  const state = nodes(
    picker,
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(picker) === "useState" &&
      node.arguments[0]?.getText(picker).includes("Keyboard.isVisible"),
  )[0] as ts.CallExpression;
  const Keyboard = {
    visible: true,
    isVisible() {
      return this.visible;
    },
  };
  const initialize = evaluate<() => boolean>(state.arguments[0].getText(picker), { Keyboard });
  expect(initialize()).toBe(true);
  Keyboard.visible = false;
  expect(initialize()).toBe(false);
});
it("keeps the input pinned outside the only vertical list and avoids double keyboard compensation", () => {
  const search = element(picker, "SearchInput");
  let parent: ts.Node | undefined = search.parent;
  while (parent) {
    if (ts.isJsxElement(parent))
      expect(parent.openingElement.tagName.getText(picker)).not.toBe("FlatList");
    parent = parent.parent;
  }
  expect(
    nodes(
      picker,
      (node) =>
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(picker) === "ScrollView",
    ),
  ).toHaveLength(0);
  const list = element(picker, "FlatList").getText(picker);
  expect(list).toContain('keyboardShouldPersistTaps="handled"');
  expect(list).toContain('keyboardDismissMode="none"');
  expect(list).toContain('contentInsetAdjustmentBehavior="never"');
  expect(list).toContain("removeClippedSubviews={false}");
  expect(list).toContain("data={results}");
  expect(picker.text).not.toContain("automaticallyAdjustKeyboardInsets");
  expect(prop(picker, "KeyboardAvoidingView", "keyboardVerticalOffset")).toBe("headerHeight");
  expect(
    evaluate(prop(picker, "KeyboardAvoidingView", "behavior"), { Platform: { OS: "ios" } }),
  ).toBe("padding");
  expect(
    evaluate(prop(picker, "KeyboardAvoidingView", "behavior"), { Platform: { OS: "android" } }),
  ).toBeUndefined();
});
it("shrinks the existing map to 120 instead of remounting or altering its viewport", () => {
  const compact = nodes(
    picker,
    (node) => ts.isVariableDeclaration(node) && node.name.getText(picker) === "compact",
  )[0] as ts.VariableDeclaration;
  for (const searchFocused of [true, false])
    for (const keyboardVisible of [true, false])
      expect(
        evaluate(compact.initializer?.getText(picker) ?? "", { searchFocused, keyboardVisible }),
      ).toBe(searchFocused && keyboardVisible);
  const maps = nodes(
    picker,
    (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(picker) === "MapLibreMap",
  );
  expect(maps).toHaveLength(1);
  const map = maps[0] as ts.JsxOpeningElement;
  const frame = (map.parent.parent as ts.JsxElement).openingElement;
  const style = frame.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText(picker) === "style",
  ) as ts.JsxAttribute;
  const code = (style.initializer as ts.JsxExpression).expression?.getText(picker) ?? "";
  expect(evaluate(code, { compact: true })).toMatchObject({ height: 120 });
  expect(evaluate(code, { compact: false })).toMatchObject({ height: 240 });
  let parent: ts.Node | undefined = map.parent;
  while (parent) {
    if (ts.isConditionalExpression(parent))
      expect(parent.condition.getText(picker)).not.toContain("compact");
    parent = parent.parent;
  }
  expect(map.getText(picker)).toContain("attribution");
  expect(map.getText(picker)).toContain("logo");
  expect(prop(picker, "Camera", "initialViewState")).toBe("initialViewState");
});
it("focus scrolls only the results region to its start without modifying draft or selected coordinates", () => {
  const setSearchFocused = vi.fn(),
    scrollToOffset = vi.fn();
  const focus = evaluate<() => void>(prop(picker, "SearchInput", "onFocus"), {
    setSearchFocused,
    resultsList: { current: { scrollToOffset } },
  });
  focus();
  expect(setSearchFocused).toHaveBeenCalledWith(true);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
  evaluate<() => void>(prop(picker, "SearchInput", "onBlur"), { setSearchFocused })();
  expect(setSearchFocused).toHaveBeenLastCalledWith(false);
});
it.each(["ios", "android"])(
  "handles native keyboard show/hide and removes subscriptions: %s",
  (OS) => {
    const effect = nodes(
      picker,
      (node) =>
        ts.isCallExpression(node) &&
        node.expression.getText(picker) === "useEffect" &&
        node.arguments[0].getText(picker).includes("Keyboard.addListener"),
    )[0] as ts.CallExpression;
    const handlers = new Map<string, () => void>();
    const remove = vi.fn(),
      setKeyboardVisible = vi.fn(),
      scrollToOffset = vi.fn();
    const Keyboard = {
      addListener: (name: string, fn: () => void) => {
        handlers.set(name, fn);
        return { remove };
      },
    };
    const callback = evaluate<() => () => void>(effect.arguments[0].getText(picker), {
      Keyboard,
      Platform: { OS },
      setKeyboardVisible,
      resultsList: { current: { scrollToOffset } },
    });
    const cleanup = callback();
    handlers.get(OS === "ios" ? "keyboardWillShow" : "keyboardDidShow")?.();
    expect(setKeyboardVisible).toHaveBeenLastCalledWith(true);
    handlers.get("keyboardDidHide")?.();
    expect(setKeyboardVisible).toHaveBeenLastCalledWith(false);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
    cleanup();
    expect(remove).toHaveBeenCalledTimes(2);
  },
);
it("result selection dismisses keyboard and preserves the exact verified address/zone and camera target", () => {
  const createElement = (
    type: unknown,
    props: Record<string, unknown>,
    ...children: unknown[]
  ) => ({ type, props: { ...props, children } });
  const callbacks = Object.fromEntries(
    [
      "cancelLocate",
      "setSearchFocused",
      "setSelected",
      "setFavoriteKey",
      "setResults",
      "setQuery",
      "moveTo",
    ].map((key) => [key, vi.fn()]),
  );
  const dismiss = vi.fn(),
    scrollToOffset = vi.fn();
  const render = evaluate<(value: unknown) => { props: { onPress: () => void } }>(
    prop(picker, "FlatList", "renderItem"),
    {
      ...callbacks,
      React: { createElement },
      Pressable: "Pressable",
      Typography: "Typography",
      Keyboard: { dismiss },
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
  expect(callbacks.setSearchFocused).toHaveBeenCalledWith(false);
  expect(callbacks.cancelLocate).toHaveBeenCalledTimes(1);
  expect(callbacks.setSelected).toHaveBeenCalledWith(item);
  expect(callbacks.setFavoriteKey).toHaveBeenCalledWith(null);
  expect(callbacks.setResults).toHaveBeenCalledWith([]);
  expect(callbacks.setQuery).toHaveBeenCalledWith(item.address);
  expect(callbacks.moveTo).toHaveBeenCalledWith(12, 42);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
});
it("forwards optional focus handlers through the existing HeroUI input, leaving its clear control intact", () => {
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
  expect(picker.text).toContain('display: compact ? "none" : "flex"');
  expect(picker.text).toContain("accessibilityElementsHidden={compact}");
  expect(picker.text).toContain("<LocationFavoriteSelect");
});
