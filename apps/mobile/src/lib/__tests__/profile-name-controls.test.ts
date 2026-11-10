import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
// Actual app JSX with host primitives replaced; not native hit-testing/layout evidence.
function load(file: string, name: string, modules: Record<string, unknown>) {
  const text = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8"),
    exports: Record<string, (props: any) => Element> = {};
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  runInNewContext(
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      require: (id: string) => {
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (!(id in modules)) throw new Error(`Unexpected component dependency: ${id}`);
        return modules[id];
      },
    },
  );
  return exports[name];
}
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === "object" && "props" in value
    ? [value, ...nodes(value.props.children)]
    : [];
}
it.each(["tavolo", "evento", "gruppo"])(
  "keeps %s generation explicit, larger and on the accent foreground pair",
  (category) => {
    for (const locale of ["en", "it"]) {
      const generateName = vi.fn(() => "Generated draft name"),
        onChangeText = vi.fn();
      const render = load("common/ui/NameInput", "NameInput", {
        "@board-game-organizer/shared": { generateName },
        "@lingui/react": { useLingui: () => ({ i18n: { locale } }) },
        "heroui-native/button": { Button: "Button" },
        "heroui-native/hooks": { useThemeColor: (token: string) => token },
        "heroui-native/input-group": {
          InputGroup: Object.assign("InputGroup", { Input: "Input", Suffix: "Suffix" }),
        },
        "lucide-react-native": { Dices: "Dices" },
        "@/lib/i18n": { useT: () => (message: string) => message },
        "@/lib/useInputFocus": { useInputFocus: () => ({}) },
      });
      const tree = nodes(render({ category, onChangeText, maxLength: 10 })),
        button = tree.find((node) => node.type === "Button");
      expect(button?.props).toMatchObject({
        size: "md",
        variant: "primary",
        style: { minWidth: 44, minHeight: 44 },
        isDisabled: false,
      });
      expect(tree.find((node) => node.type === "Dices")?.props).toMatchObject({
        size: 20,
        color: "accent-foreground",
        accessible: false,
      });
      expect(onChangeText).not.toHaveBeenCalled();
      button?.props.onPress();
      expect(generateName).toHaveBeenCalledWith(category, locale);
      expect(onChangeText).toHaveBeenCalledWith("Generated ");
      const disabled = nodes(render({ category, editable: false, onChangeText })).find(
        (node) => node.type === "Button",
      );
      expect(disabled?.props.isDisabled).toBe(true);
    }
  },
);
it.each([
  ["Friends", "Followers", "Following"],
  ["Games played", "Games won", "Win percentage"],
  ["Games without expansions", "Games including expansions", "Wishlist"],
])("keeps counter heights naturally equal only within the current %j row", (...labels) => {
  const render = load("profile/ProfileStats", "ProfileStats", {
    "heroui-native/text": { Typography: "Text" },
    react: { useState: (initial: unknown) => [initial, vi.fn()] },
    "react-native": { View: "View", useWindowDimensions: () => ({ fontScale: 1 }) },
    "@/components/common/ui/ListCard": { ListCard: "Card" },
  });
  const row = render({ items: labels.map((label) => ({ label, value: "12" })) });
  expect(row.props.style).toMatchObject({ flexDirection: "row", alignItems: "stretch" });
  const cards = nodes(row).filter((node) => node.type === "Card");
  expect(cards).toHaveLength(3);
  for (const card of cards) {
    expect(card.props.style).toEqual({ flex: 1 });
    expect(card.props.style.height).toBeUndefined();
  }
  for (const label of nodes(row).filter((node) => labels.includes(node.props.children))) {
    expect(label.props.numberOfLines).toBeUndefined();
  }
});
