import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Executes real effect callbacks without pretending to render React Native under Vite.
const source = ts.createSourceFile(
  "Startup.tsx",
  readFileSync(new URL("../../components/common/startup/Startup.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function effect(name: string, bindings: Record<string, unknown>) {
  let callback = "";
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "useEffect" &&
      node.arguments[0].getText(source).includes(name)
    )
      callback = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(callback).not.toBe("");
  const javascript = ts.transpileModule(`const effect = ${callback}; effect;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return runInNewContext(javascript, bindings) as () => (() => void) | undefined;
}
function bindings() {
  return {
    apiUrl: "https://api.example.test",
    userId: "user-1",
    sessionId: "session-1",
    locale: "it",
    getToken: vi.fn(async () => "fresh"),
    queryClient: {},
    canWarm: true,
    ready: true,
    eligible: true,
    warmedSession: { current: null },
    backgroundSession: { current: null },
    warmStartupPriority: vi.fn(
      (_client: unknown, _options: unknown, _current: () => boolean) => new Promise<void>(() => {}),
    ),
    warmStartupBackground: vi.fn(
      (_client: unknown, _options: unknown, _current: () => boolean) => new Promise<void>(() => {}),
    ),
    Contacts: { getPermissionsAsync: vi.fn(async () => ({ granted: false })) },
    Sentry: { captureException: vi.fn() },
  };
}
it("starts only priority reads before splash release and preserves fresh-token ownership", () => {
  const b = bindings();
  const cleanup = effect("warmStartupPriority", b)();
  expect(b.warmStartupPriority).toHaveBeenCalledWith(
    b.queryClient,
    { apiUrl: b.apiUrl, getToken: b.getToken, userId: b.userId },
    expect.any(Function),
  );
  const current = b.warmStartupPriority.mock.calls[0][2] as () => boolean;
  expect(current()).toBe(true);
  cleanup?.();
  expect(current()).toBe(false);
  expect(b.warmedSession.current).toBeNull();
  expect(b.warmStartupBackground).not.toHaveBeenCalled();
});
it("defers background/cache and native contacts work until ready, then keeps it scoped and cancellable", () => {
  const b = bindings();
  effect("warmStartupBackground", { ...b, ready: false })();
  expect(b.warmStartupBackground).not.toHaveBeenCalled();
  expect(b.Contacts.getPermissionsAsync).not.toHaveBeenCalled();
  const cleanup = effect("warmStartupBackground", b)();
  expect(b.warmStartupBackground).toHaveBeenCalledWith(
    b.queryClient,
    { apiUrl: b.apiUrl, getToken: b.getToken, userId: b.userId, locale: "it" },
    expect.any(Function),
  );
  expect(b.Contacts.getPermissionsAsync).toHaveBeenCalledTimes(1);
  const current = b.warmStartupBackground.mock.calls[0][2] as () => boolean;
  expect(current()).toBe(true);
  cleanup?.();
  expect(current()).toBe(false);
  expect(b.backgroundSession.current).toBeNull();
});
it("does not run background reads or permission checks before authenticated profile completion", () => {
  const b = bindings();
  effect("warmStartupBackground", { ...b, eligible: false })();
  effect("warmStartupPriority", { ...b, canWarm: false })();
  expect(b.warmStartupPriority).not.toHaveBeenCalled();
  expect(b.warmStartupBackground).not.toHaveBeenCalled();
  expect(b.Contacts.getPermissionsAsync).not.toHaveBeenCalled();
});
