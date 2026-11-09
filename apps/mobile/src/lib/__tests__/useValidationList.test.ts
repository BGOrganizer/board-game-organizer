import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = readFileSync(new URL("../useValidationList.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("list.ts", source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node));
if (!fn) throw Error("Missing validation list hook");
const code = ts.transpileModule(fn.getText(ast).replace(/^export /, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
// Execute real callbacks without importing RN Flow modules; not a mounted native list test.
function harness() {
  let cursor = 0;
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: () => void }[] = [];
  const effects: (() => void)[] = [],
    frames: (() => void)[] = [];
  let generation = 0;
  const reveal = vi.fn();
  const cancelErrorFocus = vi.fn(() => generation++);
  const interaction = {
    cancelErrorFocus,
    deferFirstError: () => {
      const version = ++generation;
      return {
        isCurrent: () => version === generation,
        reveal: () => {
          if (version === generation) reveal();
        },
      };
    },
  };
  const context = {
    useFormInteraction: () => interaction,
    useRef: (value: unknown) => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: value } };
      return slots[index].value as { current: unknown };
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const index = cursor++,
        old = slots[index];
      if (!old || deps.some((dep, i) => dep !== old.deps?.[i])) {
        effects.push(() => {
          old?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
  };
  const hook = runInNewContext(`${code};useValidationList;`, context);
  const list = { scrollToIndex: vi.fn(), scrollToOffset: vi.fn() };
  const render = (props: { scope: string; attempt: number; index?: number; active?: boolean }) => {
    cursor = 0;
    const result = hook(props);
    result.ref(list);
    while (effects.length) effects.shift()?.();
    return result;
  };
  return {
    render,
    list,
    reveal,
    cancelErrorFocus,
    flush: () => {
      while (frames.length) frames.shift()?.();
    },
    unmount: () => {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}
it("scrolls to an unmounted invalid row before revealing its field, without fetching data", () => {
  const h = harness(),
    handlers = h.render({ scope: "api/user/step", attempt: 1, index: 40 });
  expect(h.list.scrollToIndex).toHaveBeenCalledWith({
    index: 40,
    viewPosition: 0,
    animated: false,
  });
  expect(h.reveal).not.toHaveBeenCalled();
  handlers.onViewableItemsChanged({ viewableItems: [{ index: 39 }] });
  expect(h.reveal).not.toHaveBeenCalled();
  handlers.onViewableItemsChanged({ viewableItems: [{ index: 40 }, { index: null }] });
  expect(h.reveal).toHaveBeenCalledOnce();
});
it("reveals an already mounted row or a non-row selector on each new attempt", () => {
  const h = harness(),
    handlers = h.render({ scope: "a", attempt: 0 });
  handlers.onViewableItemsChanged({ viewableItems: [{ index: 8 }] });
  h.render({ scope: "a", attempt: 1, index: 8 });
  expect(h.reveal).toHaveBeenCalledOnce();
  h.render({ scope: "a", attempt: 1, index: 8 });
  expect(h.reveal).toHaveBeenCalledOnce();
  h.render({ scope: "a", attempt: 2 });
  expect(h.reveal).toHaveBeenCalledTimes(2);
});
it.each(["scope", "inactive", "unmount", "touch"])(
  "cancels stale viewability and retry callbacks after %s",
  (change) => {
    const h = harness(),
      old = h.render({ scope: "a", attempt: 1, index: 50 });
    old.onScrollToIndexFailed({ averageItemLength: 60, index: 50 });
    expect(h.list.scrollToOffset).toHaveBeenCalledWith({ offset: 3000, animated: false });
    h.list.scrollToIndex.mockClear();
    if (change === "scope") h.render({ scope: "b", attempt: 1, index: 50 });
    if (change === "inactive") h.render({ scope: "a", attempt: 1, index: 50, active: false });
    if (change === "unmount") h.unmount();
    if (change === "touch") h.cancelErrorFocus();
    old.onViewableItemsChanged({ viewableItems: [{ index: 50 }] });
    h.flush();
    expect(h.reveal).not.toHaveBeenCalled();
    expect(h.list.scrollToIndex).not.toHaveBeenCalled();
  },
);
it("bounds retries and rejects failures for other rows", () => {
  const h = harness(),
    handlers = h.render({ scope: "a", attempt: 1, index: 50 });
  handlers.onScrollToIndexFailed({ averageItemLength: 60, index: 49 });
  expect(h.list.scrollToOffset).not.toHaveBeenCalled();
  for (let i = 0; i < 8; i++) {
    handlers.onScrollToIndexFailed({ averageItemLength: 60, index: 50 });
    h.flush();
  }
  expect(h.list.scrollToIndex).toHaveBeenCalledTimes(6);
});
