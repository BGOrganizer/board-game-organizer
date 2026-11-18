import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

// Exercise the installed SDK worklet, rather than only checking our prop strings.
// This explains the former Android failure; it is still not a rendered-device test.
function sdkPosition(
  behavior: "interactive" | "fillParent" | "extend",
  os: "android" | "ios",
  detents = [520],
  currentIndex = 0,
) {
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
      animatedCurrentIndex: { value: currentIndex },
      animatedPosition: { value: 520 },
      animatedDetentsState: {
        get: () => ({
          detents,
          highestDetentPosition: Math.min(...detents),
          closedDetentPosition: 800,
        }),
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
it.each(["android", "ios"] as const)(
  "installed SDK keeps the focused 80% detent on %s when the keyboard opens",
  (os) => {
    const sheet = sdkPosition("extend", os, [520, 160], 1);
    expect(sheet.evaluate()).toBe(160);
    sheet.keyboard.status = "hidden";
    expect(sheet.evaluate()).toBe(160);
  },
);
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
