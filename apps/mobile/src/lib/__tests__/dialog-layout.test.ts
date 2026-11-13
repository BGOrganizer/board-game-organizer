import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { inputScrollOffset } from "../inputScrollOffset";

type Element = { type: unknown; props: Record<string, unknown> };
// Real component JSX/props/callbacks with host primitives stubbed, not native layout acceptance.
function component(file: string, name: string, modules: Record<string, unknown>) {
  const source = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  const exports: Record<string, (props: Record<string, unknown>) => Element> = {};
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
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
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
        if (!(id in modules)) throw new Error(`Unexpected dialog dependency: ${id}`);
        return modules[id];
      },
    },
  );
  return exports[name];
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value && typeof value === "object" && "props" in value) {
    const element = value as Element;
    return [element, ...nodes(element.props.children)];
  }
  return [];
}

it.each([
  { busy: false, platform: "ios" },
  { busy: true, platform: "ios" },
  { busy: false, platform: "android" },
  { busy: true, platform: "android" },
])(
  "keeps all dialog content intrinsic and stationary without scrolling ($platform, busy=$busy)",
  ({ busy, platform }) => {
    const render = component("common/ui/ConfirmDialog", "ConfirmDialog", {
      "heroui-native/button": { Button: { Label: "Label" } },
      "heroui-native/dialog": {
        Dialog: Object.assign("Dialog", {
          Portal: "Portal",
          Overlay: "Overlay",
          Content: "Content",
          Close: "Close",
          Title: "Title",
          Description: "Description",
        }),
      },
      "react-native": {
        View: "View",
        KeyboardAvoidingView: "Avoiding",
        Platform: { OS: platform },
      },
      "@/lib/i18n": { useT: () => (text: string) => text },
      "@/lib/inputScrollContext": {
        InputScrollContext: { Provider: "ScrollOwner" },
        InputFieldContext: { Provider: "FieldOwner" },
      },
      "./FormInteractionScope": { FormInteractionScope: "Scope" },
      "./FormSubmitButton": { FormSubmitButton: "Submit" },
    });
    const onCancel = vi.fn(),
      action = vi.fn();
    const tree = render({
      title: "Title",
      description: "Description",
      busy,
      onCancel,
      cancelLabel: platform === "android" ? "Later" : undefined,
      blocksAppRestart: platform !== "android",
      children: "Full content",
      actions: [
        {
          label: "Confirm",
          variant: platform === "android" ? "ghost" : "primary",
          onPress: action,
        },
      ],
    });
    const all = nodes(tree);
    expect(all.find((n) => n.type === "Scope")?.props.blocksAppRestart).toBe(
      platform !== "android",
    );
    expect(all.find((n) => n.type === "Content")?.props).toMatchObject({
      isSwipeable: false,
      style: { flexShrink: 0 },
    });
    const content = all.find((n) => n.type === "Content");
    expect(content?.props.style).not.toHaveProperty("height");
    expect(content?.props.style).not.toHaveProperty("maxHeight");
    expect(all.map((n) => n.type)).not.toContain("InputScroll");
    expect(all.map((n) => n.type)).not.toContain("ScrollView");
    expect(all.map((n) => n.type)).not.toContain("Scroll");
    expect(all.find((n) => n.type === "Avoiding")?.props).toMatchObject({
      pointerEvents: "box-none",
      style: { flex: 1, justifyContent: "center" },
      behavior: platform === "ios" ? "padding" : undefined,
    });
    expect(all.find((n) => n.type === "ScrollOwner")?.props.value).toBeNull();
    expect(all.find((n) => n.type === "FieldOwner")?.props.value).toBeNull();
    expect(all.some((n) => n.type === "View" && n.props.children === "Full content")).toBe(true);
    expect(all.find((n) => n.type === "Overlay")?.props.isCloseOnPress).toBe(!busy);
    expect(all.find((n) => n.type === "Close")?.props).toMatchObject({
      isDisabled: busy,
      accessibilityLabel: platform === "android" ? "Later" : "Cancel",
      style: { minWidth: 44, minHeight: 44 },
    });
    (tree.props.onOpenChange as (open: boolean) => void)(true);
    expect(onCancel).not.toHaveBeenCalled();
    (tree.props.onOpenChange as (open: boolean) => void)(false);
    expect(onCancel).toHaveBeenCalledTimes(busy ? 0 : 1);
    const submit = all.find((n) => n.type === "Submit");
    if (!submit) throw new Error("Missing confirmation action");
    expect(submit.props.isDisabled).toBe(busy);
    expect(submit.props.variant).toBe(platform === "android" ? "ghost" : "primary");
    (submit.props.onPress as () => void)();
    expect(action).toHaveBeenCalledTimes(busy ? 0 : 1);
  },
);

it.each(["ios", "android"])(
  "preserves optional content-sized scroll owners on %s without changing screen/sheet defaults",
  (platform) => {
    for (const inSheet of [false, true])
      for (const sizing of [undefined, "fill", "content"])
        for (const extra of [0, 80]) {
          const render = component("common/ui/InputScrollView", "InputScrollView", {
            "@gorhom/bottom-sheet": { BottomSheetScrollView: "SheetScroll" },
            react: {
              useRef: (value: unknown) => ({ current: value }),
              useImperativeHandle: () => {},
            },
            "react-native": {
              KeyboardAvoidingView: "Avoiding",
              View: "Viewport",
              ScrollView: "Scroll",
              Platform: { OS: platform },
              StyleSheet: { flatten: (value: unknown) => value },
            },
            "@/lib/inputScrollContext": {
              InputScrollContext: { Provider: "Owner" },
              InputFieldContext: { Provider: "Field" },
            },
            "@/lib/useOptionalHeaderHeight": { useOptionalHeaderHeight: () => 0 },
            "@/lib/useInputScroll": {
              useInputScroll: () => ({
                viewport: { current: null },
                owner: { local: true },
                minHeight: 300 + extra,
                requiredOffset: extra,
                inSheet,
                onLayout: vi.fn(),
                touch: vi.fn(),
                onScroll: vi.fn(),
                contentChanged: vi.fn(),
                beginScroll: vi.fn(),
              }),
            },
          });
          const tree = render({ sizing, children: "All content" });
          const all = nodes(tree),
            viewport = all.find((n) => n.type === "Viewport"),
            scroll = all.find((n) => n.type === (inSheet ? "SheetScroll" : "Scroll"));
          const fit = sizing === "content";
          if (!scroll) throw new Error("Missing input scroll surface");
          expect(viewport?.props.style).toMatchObject({ flexGrow: fit ? 0 : 1, flexShrink: 1 });
          expect(scroll?.props.style).toMatchObject({ flexGrow: fit ? 0 : 1, flexShrink: 1 });
          expect((scroll.props.contentContainerStyle as object[])[1]).toMatchObject({
            minHeight: fit ? 0 : 300 + extra,
          });
          expect(scroll?.props.bounces).toBe(fit ? false : undefined);
          expect(scroll?.props.alwaysBounceVertical).toBe(fit ? false : undefined);
          expect(scroll?.props.overScrollMode).toBe(fit ? "never" : undefined);
          expect(scroll?.props.scrollEnabled).not.toBe(false);
          expect(tree.props.behavior).toBe(platform === "ios" && !inSheet ? "padding" : undefined);
          expect(tree.props.keyboardVerticalOffset).toBe(0);
          const explicit = render({
            sizing: "content",
            bounces: true,
            alwaysBounceVertical: true,
            overScrollMode: "auto",
            contentContainerStyle: { minHeight: 450 },
            style: { flexShrink: 1 },
          });
          const explicitScroll = nodes(explicit).find(
            (n) => n.type === (inSheet ? "SheetScroll" : "Scroll"),
          );
          if (!explicitScroll) throw new Error("Missing explicitly styled scroll surface");
          expect((explicitScroll.props.contentContainerStyle as object[])[1]).toMatchObject({
            minHeight: 450,
          });
          expect(explicitScroll?.props.bounces).toBe(true);
          expect(explicitScroll?.props.alwaysBounceVertical).toBe(true);
          expect(explicitScroll?.props.overScrollMode).toBe("auto");
        }
  },
);

it.each([
  [200, 500, 100],
  [700, 200, 650],
])(
  "keeps successive focus/layout measurements stable (content=%s, cap=%s, field=%s)",
  (naturalHeight, cap, fieldTop) => {
    let viewportHeight = Math.min(naturalHeight, cap),
      offset = 0,
      requiredOffset = 0;
    const render = component("common/ui/InputScrollView", "InputScrollView", {
      "@gorhom/bottom-sheet": { BottomSheetScrollView: "SheetScroll" },
      react: { useRef: (value: unknown) => ({ current: value }), useImperativeHandle: () => {} },
      "react-native": {
        KeyboardAvoidingView: "Avoiding",
        View: "Viewport",
        ScrollView: "Scroll",
        Platform: { OS: "ios" },
        StyleSheet: { flatten: (value: unknown) => value },
      },
      "@/lib/inputScrollContext": {
        InputScrollContext: { Provider: "Owner" },
        InputFieldContext: { Provider: "Field" },
      },
      "@/lib/useOptionalHeaderHeight": { useOptionalHeaderHeight: () => 0 },
      "@/lib/useInputScroll": {
        useInputScroll: () => ({
          viewport: { current: null },
          owner: {},
          minHeight: viewportHeight + requiredOffset,
          requiredOffset,
          inSheet: false,
          onLayout: vi.fn(),
          touch: vi.fn(),
          onScroll: vi.fn(),
          contentChanged: vi.fn(),
          beginScroll: vi.fn(),
        }),
      },
    });
    // Stateful source-level layout model, not native frame/touch acceptance. Use the real
    // reveal calculation and component styles on every successive measurement, not fixed props.
    for (let round = 0; round < 5; round++) {
      requiredOffset = inputScrollOffset({
        offset,
        fieldTop: fieldTop - offset,
        fieldHeight: 44,
        viewportTop: 0,
        viewportHeight,
        fontScale: 1,
      });
      const scroll = nodes(render({ sizing: "content" })).find((node) => node.type === "Scroll");
      if (!scroll) throw new Error("Missing content scroll surface");
      const minimum = (scroll.props.contentContainerStyle as { minHeight: number }[])[1].minHeight;
      const contentHeight = Math.max(naturalHeight, minimum);
      viewportHeight = Math.min(cap, contentHeight);
      offset = Math.min(requiredOffset, Math.max(0, contentHeight - viewportHeight));
      expect(minimum).toBe(0);
      expect(viewportHeight).toBe(Math.min(naturalHeight, cap));
      expect(contentHeight).toBe(naturalHeight);
      expect(fieldTop - offset).toBeGreaterThanOrEqual(0);
      expect(fieldTop - offset + 44).toBeLessThanOrEqual(viewportHeight);
    }
  },
);

it("also disables movement on the standalone native date/time dialog", () => {
  const source = readFileSync(
    new URL("../../components/events/EventDateTimeField.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("<Dialog.Content isSwipeable={false}>");
  expect(source).toContain("<DateTimePicker");
});
