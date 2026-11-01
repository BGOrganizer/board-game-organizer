import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { useAppStore } from "@board-game-organizer/store";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute actual effect callbacks only. This is not native rendering/animation acceptance.
function callbacks() {
  const source = readFileSync(
    new URL("../../../components/common/ui/NotificationAttentionBorder.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "border.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const effects: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "useEffect")
      effects.push(node.arguments[0].getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(effects).toHaveLength(2);
  const listeners: Record<string, (value: never) => void> = {};
  const remove = vi.fn();
  useAppStore.setState({ playedAttentionPulses: {} });
  const bindings = {
    owner: "api:user",
    itemId: "item",
    signal: "2027-01-01T00:00:00.000Z|000000000000000000000001",
    focused: true,
    foreground: true,
    reduced: false as boolean | undefined,
    claim: vi.fn(useAppStore.getState().claimAttentionPulse),
    opacity: { set: vi.fn() },
    cancelAnimation: vi.fn(),
    withRepeat: vi.fn(() => "repeat"),
    withSequence: vi.fn(() => "sequence"),
    withTiming: vi.fn(() => "timing"),
    ReduceMotion: { System: "system" },
    Easing: { bezier: vi.fn(() => "easing") },
    AccessibilityInfo: {
      isReduceMotionEnabled: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
      addEventListener: vi.fn((name: string, callback: (value: never) => void) => {
        listeners[name] = callback;
        return { remove };
      }),
    },
    AppState: {
      addEventListener: vi.fn((name: string, callback: (value: never) => void) => {
        listeners[name] = callback;
        return { remove };
      }),
    },
    setForeground: vi.fn(),
    setReduced: vi.fn(),
    effects: [] as Array<() => (() => void) | undefined>,
  };
  runInNewContext(
    ts.transpileModule(`effects = [${effects.join(",")}];`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    bindings,
  );
  return { bindings, listeners, remove };
}
it("gates playback by foreground, focus and known motion preference; plays three slow UI-thread cycles once per newer signal", () => {
  const { bindings: b } = callbacks(),
    effect = b.effects[1];
  b.foreground = false;
  effect();
  b.foreground = true;
  b.focused = false;
  effect();
  b.focused = true;
  b.reduced = undefined;
  effect();
  expect(b.claim).not.toHaveBeenCalled();
  b.reduced = false;
  const stop = effect();
  expect(b.withRepeat).toHaveBeenCalledWith("sequence", 3, false, undefined, "system");
  expect(b.withTiming).toHaveBeenNthCalledWith(1, 0.65, {
    duration: 800,
    easing: "easing",
    reduceMotion: "system",
  });
  expect(b.withTiming).toHaveBeenNthCalledWith(2, 0, {
    duration: 800,
    easing: "easing",
    reduceMotion: "system",
  });
  expect(typeof stop).toBe("function");
  stop?.();
  expect(b.opacity.set).toHaveBeenLastCalledWith(0);
  b.foreground = false;
  effect();
  b.foreground = true;
  effect();
  b.focused = false;
  effect();
  b.focused = true;
  effect();
  expect(b.withRepeat).toHaveBeenCalledOnce();
  b.signal = "2027-01-01T00:00:01.000Z|000000000000000000000002";
  effect();
  expect(b.withRepeat).toHaveBeenCalledTimes(2);
  b.reduced = true;
  effect();
  b.reduced = false;
  effect();
  expect(b.withRepeat).toHaveBeenCalledTimes(2);
  b.owner = "other-account";
  effect();
  expect(b.withRepeat).toHaveBeenCalledTimes(3);
});
it("consumes reduced-motion presentation without playback or later replay", () => {
  const { bindings: b } = callbacks();
  b.reduced = true;
  b.effects[1]();
  b.reduced = false;
  b.effects[1]();
  expect(b.withRepeat).not.toHaveBeenCalled();
});
it("refreshes accessibility on foreground, accepts live changes, ignores older requests and unsubscribes on unmount", async () => {
  const { bindings: b, listeners, remove } = callbacks();
  let resolve: (value: boolean) => void = () => {};
  b.AccessibilityInfo.isReduceMotionEnabled.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const stop = b.effects[0]();
  listeners.reduceMotionChanged(true as never);
  resolve(false);
  await Promise.resolve();
  expect(b.setReduced).toHaveBeenCalledExactlyOnceWith(true);
  listeners.change("active" as never);
  await vi.waitFor(() => expect(b.setReduced).toHaveBeenLastCalledWith(false));
  expect(b.setForeground).toHaveBeenLastCalledWith(true);
  b.AccessibilityInfo.isReduceMotionEnabled.mockRejectedValueOnce(new Error("unavailable"));
  listeners.change("active" as never);
  await vi.waitFor(() => expect(b.setReduced).toHaveBeenLastCalledWith(true));
  stop?.();
  expect(remove).toHaveBeenCalledTimes(2);
});
