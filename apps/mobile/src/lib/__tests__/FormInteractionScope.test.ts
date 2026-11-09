import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../components/common/ui/FormInteractionScope.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "scope.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node));
if (!fn) throw Error("Missing form interaction scope");
const code = ts.transpileModule(fn.getText(ast).replace(/^export /, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
// Exercise the scope's actual registered callbacks and measurement ordering, not native focus timing.
function harness() {
  const frames: (() => void)[] = [],
    cleanups: (() => void)[] = [];
  let cursor = 0,
    effectMounted = false;
  const refs: { current: unknown }[] = [];
  const component = runInNewContext(`${code};FormInteractionScope;`, {
    React: { createElement: (_: unknown, props: { value: unknown }) => props.value },
    Context: { Provider: null },
    useRef: (value: unknown) => {
      const index = cursor++;
      refs[index] ??= { current: value };
      return refs[index];
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => () => void) => {
      if (!effectMounted) {
        cleanups.push(effect());
        effectMounted = true;
      }
    },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
  });
  const render = (sourceRevision: number) => {
    cursor = 0;
    return component({ children: null, sourceRevision });
  };
  const form = render(1);
  const flush = async () => {
    while (frames.length) frames.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  };
  function field(top: number, width = 100) {
    let invalid = true;
    const reveal = vi.fn();
    const target = {
      measureInWindow: (callback: (...values: number[]) => void) => callback(0, top, width, 44),
    };
    const unregister = form.register({ target: () => target, invalid: () => invalid, reveal });
    return {
      reveal,
      unregister,
      valid: () => {
        invalid = false;
      },
    };
  }
  return {
    form,
    render,
    flush,
    field,
    unmount: () => {
      for (const cleanup of cleanups) cleanup();
    },
  };
}
it("uses visual top rather than registration order, skips invisible and corrected fields", async () => {
  const h = harness(),
    lower = h.field(400),
    first = h.field(100),
    hidden = h.field(20, 0);
  h.form.requestFirstError();
  await h.flush();
  expect(first.reveal).toHaveBeenCalledOnce();
  expect(lower.reveal).not.toHaveBeenCalled();
  expect(hidden.reveal).not.toHaveBeenCalled();
  first.valid();
  h.form.requestFirstError();
  await h.flush();
  expect(lower.reveal).toHaveBeenCalledOnce();
});
it.each(["cancel", "unregister", "correct", "unmount"])(
  "rejects measured stale error after %s",
  async (change) => {
    const h = harness();
    let measured: ((...values: number[]) => void) | undefined;
    let invalid = true;
    const reveal = vi.fn();
    const target = {
      measureInWindow: (callback: (...values: number[]) => void) => {
        measured = callback;
      },
    };
    const unregister = h.form.register({ target: () => target, invalid: () => invalid, reveal });
    h.form.requestFirstError();
    await h.flush();
    if (change === "cancel") h.form.cancelErrorFocus();
    if (change === "unregister") unregister();
    if (change === "correct") invalid = false;
    if (change === "unmount") h.unmount();
    measured?.(0, 100, 100, 44);
    await h.flush();
    expect(reveal).not.toHaveBeenCalled();
  },
);
it.each([false, true])(
  "cancels revision-only updates before queued or measured reveal (measured: %s)",
  async (measured) => {
    const h = harness();
    let callback: ((...values: number[]) => void) | undefined;
    const reveal = vi.fn();
    const target = {
      measureInWindow: (next: (...values: number[]) => void) => {
        callback = next;
      },
    };
    h.form.register({ target: () => target, invalid: () => true, reveal });
    const ticket = h.form.deferFirstError();
    ticket.reveal();
    if (measured) await h.flush();
    h.render(2);
    callback?.(0, 100, 100, 44);
    await h.flush();
    expect(ticket.isCurrent()).toBe(false);
    expect(reveal).not.toHaveBeenCalled();
    h.form.requestFirstError();
    await h.flush();
    callback?.(0, 100, 100, 44);
    await h.flush();
    expect(reveal).toHaveBeenCalledOnce();
  },
);
it("rejects obsolete tickets and calls after unmount", async () => {
  const h = harness(),
    field = h.field(20),
    old = h.form.deferFirstError();
  h.form.cancelErrorFocus();
  old.reveal();
  await h.flush();
  expect(old.isCurrent()).toBe(false);
  expect(field.reveal).not.toHaveBeenCalled();
  const ticket = h.form.deferFirstError();
  h.unmount();
  ticket.reveal();
  h.form.requestFirstError();
  await h.flush();
  expect(ticket.isCurrent()).toBe(false);
  expect(field.reveal).not.toHaveBeenCalled();
});
