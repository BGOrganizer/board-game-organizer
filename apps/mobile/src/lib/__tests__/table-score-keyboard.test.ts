import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { normalizeMatchScore, previewTableResults } from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Real callbacks/props without loading RN Flow. Keyboard geometry still needs device acceptance.
const source = readFileSync(
  new URL("../../components/events/TableScoreEditor.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "score.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
type Node = { type: unknown; props: Record<string, unknown> & { children: unknown[] } };
const Button = { Label: "label" },
  BottomSheet = { Portal: "portal", Overlay: "overlay", Content: "content", Title: "title" };
const base = {
  React: {
    Fragment: "fragment",
    createElement: (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({ type, props: { ...props, children } }),
  },
  useT: () => (text: string) => text,
  View: "view",
  Typography: "text",
  Input: "input",
  Button,
  BottomSheet,
  Switch: { Thumb: "thumb" },
  ScoreInput: "score-input",
  FlatList: "list",
  useSafeAreaInsets: () => ({ top: 24, bottom: 20 }),
  useThemeColor: () => "theme-color",
  normalizeMatchScore,
  previewTableResults,
};
function render(name: string, props: Record<string, unknown>, context: Record<string, unknown>) {
  const fn = file.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )!;
  return runInNewContext(
    ts.transpileModule(`${fn.getText(file).replace(/^export /, "")}; ${name}(props);`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText,
    { ...base, ...context, props },
  ) as Node;
}
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
it.each(["android", "ios"])(
  "score input retains placeholder, native focus handlers and exact signed decimals on %s",
  (os) => {
    const onFocus = vi.fn(),
      onBlur = vi.fn(),
      onChange = vi.fn(),
      snapToPosition = vi.fn();
    const row = { userId: "a", rawScore: "-12.50", notParticipated: false };
    const context = {
      Platform: { OS: os },
      useBottomSheetAwareHandlers: () => ({ onFocus, onBlur }),
      useBottomSheet: () => ({ snapToPosition }),
    };
    const tree = render("ScoreInput", { name: "Alice", row, onChange }, context);
    const input = nodes(tree).find((n) => n.type === "input")!;
    expect(input.props).toMatchObject({
      accessibilityLabel: "Score: Alice",
      placeholder: "Enter a score",
      value: "-12.50",
      editable: true,
      keyboardType: os === "android" ? "numeric" : "numbers-and-punctuation",
    });
    const focusEvent = { nativeEvent: { target: 17 } };
    (input.props.onFocus as (event: typeof focusEvent) => void)(focusEvent);
    expect(onFocus).toHaveBeenCalledWith(focusEvent);
    expect(snapToPosition).toHaveBeenCalledWith("100%");
    expect(onChange).not.toHaveBeenCalled();
    expect(onFocus.mock.invocationCallOrder[0]).toBeLessThan(
      snapToPosition.mock.invocationCallOrder[0],
    );
    expect(input.props.onBlur).toBe(onBlur);
    (input.props.onChangeText as (text: string) => void)("-0.25");
    expect(onChange).toHaveBeenCalledWith("-0.25");
    const nd = render(
      "ScoreInput",
      { name: "Alice", row: { ...row, notParticipated: true }, onChange },
      context,
    );
    expect(nodes(nd).find((n) => n.type === "input")?.props.editable).toBe(false);
  },
);
it("configures full-parent expansion within the safe area and preserves local score drafts on close/reopen", () => {
  const onSubmit = vi.fn(),
    states: unknown[] = [],
    props = {
      players: [{ id: "a", name: "Alice" }],
      initial: { lowerWins: false, entries: [{ userId: "a", score: "-1.50" }], tieBreaks: [] },
      busy: false,
      onSubmit,
    };
  let cursor = 0;
  const context = {
    Animated: { View: "animated-view" },
    ScoreIdentity: "identity",
    Pencil: "pencil",
    transition: {},
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [
        states[index],
        (next: unknown) => {
          states[index] = typeof next === "function" ? next(states[index]) : next;
        },
      ];
    },
  };
  const rerender = () => {
    cursor = 0;
    return render("TableScoreEditor", props, context);
  };
  const openScore = () => {
    const list = nodes(rerender()).find((n) => n.type === "list")!;
    const row = (list.props.renderItem as (args: { item: string; index: number }) => Node)({
      item: "a",
      index: 0,
    });
    (nodes(row).find((n) => n.type === Button)!.props.onPress as () => void)();
  };
  openScore();
  const tree = rerender(),
    content = nodes(tree).find((n) => n.type === "content")!;
  expect(content.props).toMatchObject({
    keyboardBehavior: "fillParent",
    keyboardBlurBehavior: "restore",
    android_keyboardInputMode: "adjustResize",
    topInset: 24,
  });
  expect(content.props.snapPoints).toBeUndefined();
  expect(source).not.toContain("KeyboardAvoidingView");
  expect(source).not.toContain("Keyboard.addListener");
  const input = nodes(content).find((n) => n.type === "score-input")!;
  (input.props.onChange as (score: string) => void)("-4.25");
  (nodes(tree).find((n) => n.type === BottomSheet)!.props.onOpenChange as (open: boolean) => void)(
    false,
  );
  expect(nodes(rerender()).find((n) => n.type === BottomSheet)?.props.isOpen).toBe(false);
  openScore();
  const reopened = rerender(),
    reopenedInput = nodes(reopened).find((n) => n.type === "score-input")!;
  expect(reopenedInput.props.row).toMatchObject({
    userId: "a",
    rawScore: "-4.25",
    notParticipated: false,
  });
  expect(onSubmit).not.toHaveBeenCalled();
});

// Exercise the installed SDK worklet, rather than only checking our prop strings.
// This explains the former Android failure; it is still not a rendered-device test.
function sdkPosition(behavior: "interactive" | "fillParent", os: "android" | "ios") {
  const sdkSource = readFileSync(
    new URL(
      "../../../../../node_modules/@gorhom/bottom-sheet/src/components/bottomSheet/BottomSheet.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const sdk = ts.createSourceFile(
    "BottomSheet.tsx",
    sdkSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionExpression(node) && node.name?.text === "getEvaluatedPosition")
      expression = node.getText(sdk);
    ts.forEachChild(node, visit);
  }
  visit(sdk);
  if (!expression) throw new Error("Installed SDK position evaluator missing");
  const keyboard = { status: "shown", heightWithinContainer: os === "android" ? 0 : 300 },
    temporary = { value: false };
  const evaluate = runInNewContext(
    ts.transpileModule(`() => (${expression})(ANIMATION_SOURCE.KEYBOARD)`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      Platform: { OS: os },
      State: { ACTIVE: "active" },
      ANIMATION_SOURCE: { KEYBOARD: "keyboard", SNAP_POINT_CHANGE: "snap" },
      ANIMATION_STATUS: { RUNNING: "running" },
      KEYBOARD_STATUS: { SHOWN: "shown", HIDDEN: "hidden" },
      KEYBOARD_BLUR_BEHAVIOR: { restore: "restore" },
      KEYBOARD_BEHAVIOR: { interactive: "interactive", fillParent: "fillParent", extend: "extend" },
      keyboardBehavior: behavior,
      keyboardBlurBehavior: "restore",
      android_keyboardInputMode: "adjustResize",
      animatedCurrentIndex: { value: 0 },
      animatedPosition: { value: 520 },
      animatedDetentsState: {
        get: () => ({ detents: [520], highestDetentPosition: 520, closedDetentPosition: 800 }),
      },
      animatedKeyboardState: { get: () => keyboard },
      animatedAnimationState: { get: () => ({ status: "stopped" }) },
      animatedContentGestureState: { value: "idle" },
      animatedHandleGestureState: { value: "idle" },
      isInTemporaryPosition: temporary,
      didAnimateOnMount: { value: true },
      _providedIndex: 0,
    },
  ) as () => number;
  return { evaluate, keyboard, temporary };
}
it("reproduces the installed SDK ignoring interactive keyboard offset on Android with adjustResize", () => {
  expect(sdkPosition("interactive", "android").evaluate()).toBe(520);
  expect(sdkPosition("interactive", "ios").evaluate()).toBe(220);
});
it.each(["android", "ios"] as const)(
  "installed SDK expands fillParent and restores compact position on %s",
  (os) => {
    const sheet = sdkPosition("fillParent", os);
    expect(sheet.evaluate()).toBe(0);
    expect(sheet.temporary.value).toBe(true);
    sheet.keyboard.status = "hidden";
    expect(sheet.evaluate()).toBe(520);
    expect(sheet.temporary.value).toBe(false);
  },
);
