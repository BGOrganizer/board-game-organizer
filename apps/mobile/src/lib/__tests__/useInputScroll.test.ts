import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { inputScrollOffset } from "../inputScrollOffset";

// Execute the real owner callbacks, not native keyboard/scroll frame timing.
const source = readFileSync(new URL("../useInputScroll.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("owner.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const fn = ast.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "useInputScroll",
);
if (!fn) throw Error("Missing scroll owner");
const code = ts.transpileModule(
  `${fn.getText(ast).replace(/^export /, "")};useInputScroll(getScroller);`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function harness(state?: readonly [number, number]) {
  const frames: (() => void)[] = [],
    cleanups: (() => void)[] = [],
    setters: ReturnType<typeof vi.fn>[] = [];
  const scrollTo = vi.fn(),
    cancelErrorFocus = vi.fn();
  const owner = runInNewContext(code, {
    getScroller: () => ({ scrollTo }),
    inputScrollOffset,
    useRef: (value: unknown) => ({ current: value }),
    useState: (value: unknown) => {
      const setter = vi.fn();
      setters.push(setter);
      return [state?.[setters.length - 1] ?? value, setter];
    },
    useEffect: (effect: () => (() => void) | undefined) => {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    },
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useBottomSheetInternal: () => null,
    useKeyboardHeight: () => 0,
    useFormInteraction: () => ({ cancelErrorFocus }),
    PixelRatio: { getFontScale: () => 1 },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
  });
  owner.viewport.current = {
    measureInWindow: (callback: (...values: number[]) => void) => callback(0, 100, 320, 300),
  };
  const flush = () => {
    while (frames.length) frames.shift()?.();
  };
  return { owner, scrollTo, cancelErrorFocus, setters, flush, cleanups };
}
it.each([
  [0, 0],
  [300, 0],
  [300, 80],
] as const)(
  "preserves the viewport plus reveal range for bounded screen/list owners (%s + %s)",
  (height, extra) => {
    const h = harness([height, extra]);
    expect(h.owner.minHeight).toBe(height + extra);
  },
);
it("keeps touch/clear within the focused field pinned, stops repinning after an actual drag, and clears extra range on blur", () => {
  const h = harness(),
    field = {
      measureInWindow: (callback: (...values: number[]) => void) => callback(0, 500, 200, 44),
    };
  h.owner.owner.reveal(field);
  h.owner.touch();
  h.flush();
  expect(h.cancelErrorFocus).toHaveBeenCalledOnce();
  expect(h.scrollTo).toHaveBeenLastCalledWith({ y: 336, animated: false });
  expect(h.setters[1]).toHaveBeenLastCalledWith(336);
  h.scrollTo.mockClear();
  h.owner.contentChanged();
  h.flush();
  expect(h.scrollTo).toHaveBeenCalledOnce();
  h.scrollTo.mockClear();
  h.owner.beginScroll();
  h.owner.contentChanged();
  h.flush();
  expect(h.scrollTo).not.toHaveBeenCalled();
  h.owner.owner.blur(field);
  expect(h.setters[1]).toHaveBeenLastCalledWith(0);
});
it("rejects a previous field measurement after focus moves to a new field", () => {
  const h = harness();
  let measured: ((...values: number[]) => void) | undefined;
  const oldField = {
    measureInWindow: (callback: (...values: number[]) => void) => {
      measured = callback;
    },
  };
  const newField = {
    measureInWindow: (callback: (...values: number[]) => void) => callback(0, 400, 200, 44),
  };
  h.owner.owner.reveal(oldField);
  h.flush();
  h.owner.owner.reveal(newField);
  h.flush();
  measured?.(0, 900, 200, 44);
  h.flush();
  expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 236, animated: false });
});
it("rejects a delayed label measurement after blur and clears the added scroll range", () => {
  const h = harness();
  let measured: ((...values: number[]) => void) | undefined;
  const field = {
    measureInWindow: (callback: (...values: number[]) => void) => callback(0, 500, 200, 44),
  };
  const label = {
    measureInWindow: (callback: (...values: number[]) => void) => {
      measured = callback;
    },
  };
  h.owner.owner.reveal(field, label);
  h.flush();
  h.owner.owner.blur(field);
  measured?.(0, 460, 200, 84);
  h.flush();
  expect(h.scrollTo).not.toHaveBeenCalled();
  expect(h.setters[1]).toHaveBeenLastCalledWith(0);
});
it("ignores an unmeasured field rather than moving the list or creating range", () => {
  const h = harness();
  h.owner.owner.reveal({
    measureInWindow: (callback: (...values: number[]) => void) => callback(0, 500, 0, 0),
  });
  h.flush();
  expect(h.scrollTo).not.toHaveBeenCalled();
  expect(h.setters[1]).not.toHaveBeenCalled();
});
it("rejects delayed measurements after manual scrolling or owner unmount", () => {
  const h = harness();
  let measured: ((...values: number[]) => void) | undefined;
  const field = {
    measureInWindow: (callback: (...values: number[]) => void) => {
      measured = callback;
    },
  };
  h.owner.owner.reveal(field);
  h.flush();
  h.owner.beginScroll();
  measured?.(0, 500, 200, 44);
  h.flush();
  expect(h.scrollTo).not.toHaveBeenCalled();
  h.owner.owner.reveal(field);
  h.cleanups[0]();
  h.flush();
  expect(h.scrollTo).not.toHaveBeenCalled();
});
