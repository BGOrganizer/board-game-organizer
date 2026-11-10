import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === "object" && "props" in value
    ? [value, ...nodes(value.props.children)]
    : [];
}
// Execute the installed patched primitive; this checks host/callback composition, not device hit regions.
function primitive(isDisabled: boolean) {
  const source = readFileSync(
    new URL(
      "../../../../../node_modules/heroui-native/src/components/pressable-feedback/pressable-feedback.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const onPress = vi.fn(),
    onPressIn = vi.fn(),
    onPressOut = vi.fn(),
    animateIn = vi.fn(),
    animateOut = vi.fn();
  const exports: Record<string, (props: unknown) => Element> = {};
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      forwardRef: (render: (props: unknown, ref: null) => Element) => (props: unknown) =>
        render(props, null),
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
    },
    "react-native": { Pressable: "ShadowTreePressable", View: "View" },
    "react-native-gesture-handler": { Pressable: "NativeGesturePressable" },
    "react-native-reanimated": {
      __esModule: true,
      default: { createAnimatedComponent: (value: unknown) => value, View: "AnimatedView" },
    },
    "../../helpers/internal/contexts": { AnimationSettingsProvider: "Settings" },
    "../../primitives/slot": { Pressable: "Slot" },
    "./pressable-feedback.animation": {
      PressableFeedbackRootAnimationProvider: "Animation",
      usePressableFeedbackRootAnimation: () => ({
        isPressed: {},
        containerWidth: { set: vi.fn() },
        containerHeight: { set: vi.fn() },
        isAllAnimationsDisabled: false,
        animationOnPressIn: animateIn,
        animationOnPressOut: animateOut,
        rScaleStyle: { transform: [{ scale: 1 }] },
      }),
    },
    "./pressable-feedback.constants": { DISPLAY_NAME: {} },
    "./pressable-feedback.styles": {
      pressableFeedbackClassNames: { root: () => "heroui-root" },
      pressableFeedbackStyleSheet: { root: {} },
    },
  };
  runInNewContext(
    ts.transpileModule(source, {
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
        if (!(id in modules)) throw new Error(`Unexpected press primitive dependency: ${id}`);
        return modules[id];
      },
    },
  );
  const tree = exports.default({
    isDisabled,
    onPress,
    onPressIn,
    onPressOut,
    accessibilityRole: "button",
    accessibilityLabel: "Games",
    children: "Games",
  });
  return {
    host: nodes(tree).find((node) => node.type === "NativeGesturePressable"),
    tree,
    onPress,
    onPressIn,
    onPressOut,
    animateIn,
    animateOut,
  };
}
it("keeps HeroUI feedback, accessibility and completed-tap semantics on the native gesture host", () => {
  const result = primitive(false),
    host = result.host;
  expect(host).toBeTruthy();
  expect(nodes(result.tree).some((node) => node.type === "ShadowTreePressable")).toBe(false);
  expect(host?.props).toMatchObject({
    disabled: false,
    accessibilityRole: "button",
    accessibilityLabel: "Games",
  });
  host?.props.onPressIn({ nativeEvent: {} });
  expect(result.animateIn).toHaveBeenCalledOnce();
  expect(result.onPressIn).toHaveBeenCalledOnce();
  expect(result.onPress).not.toHaveBeenCalled();
  host?.props.onPressOut({ nativeEvent: {} });
  expect(result.animateOut).toHaveBeenCalledOnce();
  expect(result.onPressOut).toHaveBeenCalledOnce();
  expect(result.onPress).not.toHaveBeenCalled();
  host?.props.onPress({ nativeEvent: {} });
  expect(result.onPress).toHaveBeenCalledOnce();
});
it("keeps disabled controls disabled and source/runtime patch imports in parity", () => {
  expect(primitive(true).host?.props.disabled).toBe(true);
  const runtime = readFileSync(
    new URL(
      "../../../../../node_modules/heroui-native/lib/module/components/pressable-feedback/pressable-feedback.js",
      import.meta.url,
    ),
    "utf8",
  );
  expect(runtime).toContain("import { Pressable } from 'react-native-gesture-handler'");
  expect(runtime).not.toContain("import { Pressable, View } from 'react-native'");
});
it("retains the actual sticky header and controlled HeroUI filters instead of press-in/clipping workarounds", () => {
  const collection = readFileSync(
      new URL("../../components/profile/ProfileCollection.tsx", import.meta.url),
      "utf8",
    ),
    chips = readFileSync(
      new URL("../../components/common/ui/FilterChips.tsx", import.meta.url),
      "utf8",
    );
  expect(collection).toContain("stickySectionHeadersEnabled");
  expect(collection).toContain("onToggle={filter.toggle}");
  expect(chips).toContain("onPress={() => onToggle(key)}");
  expect(chips).not.toContain("onPressIn=");
  expect(chips).toContain("isDisabled={disabled}");
  expect(chips).toContain('variant={active ? "primary" : "secondary"}');
});
