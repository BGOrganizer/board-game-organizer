import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { clearSessionQueryCache } from "@board-game-organizer/shared";
import { hydrate, QueryClient } from "@tanstack/react-query";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { remainingSplashMs } from "../../startup";
import {
  createSessionPersister,
  ownsPersistedQuery,
  restoreSessionCache,
} from "../queryPersistence";

// Executes the actual account/restore effects. This is not RN rendering or MMKV native acceptance.
const source = ts.createSourceFile(
  "provider.tsx",
  readFileSync(
    new URL("../../../components/common/providers/MobileQueryProvider.tsx", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function callback(name: string, bindings: Record<string, unknown>) {
  let text = "";
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ["useEffect", "useCallback"].includes(node.expression.getText(source)) &&
      node.arguments[0]?.getText(source).includes(name)
    )
      text = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(text).not.toBe("");
  return runInNewContext(
    ts.transpileModule(`(${text})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText,
    bindings,
  );
}
const clients: QueryClient[] = [];
function bindings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const disk = new Map<string, string>();
  const storage = {
    getString: (key: string) => disk.get(key),
    set: (key: string, value: string) => {
      disk.set(key, value);
    },
    remove: (key: string) => disk.delete(key),
  };
  return {
    client,
    disk,
    storage,
    apiUrl: "api",
    userId: "user-a",
    identity: "account-a-session-1",
    blocked: false,
    startedAt: Date.now(),
    generation: { current: 0 },
    current: { current: undefined as { stop(): void; flush(): void } | undefined },
    previous: { current: undefined as string | undefined },
    setRestored: vi.fn(),
    report: vi.fn(),
    setBlocked: vi.fn(),
    setAttempt: vi.fn(),
    clearSessionQueryCache,
    remainingSplashMs,
    createSessionPersister,
    ownsPersistedQuery,
    restoreSessionCache,
    hydrate,
    setTimeout,
    clearTimeout,
    useAppStore: { getState: () => ({ clearPending: vi.fn() }) },
    openMobileQueryStorage: vi.fn(async () => storage),
    purgeMobileQueryStorage: vi.fn(async () => undefined),
  };
}
afterEach(() => {
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.useRealTimers();
});
it("quarantines pending/unverified Clerk sessions without treating them as definitive logout", () => {
  let expression = "";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "identity")
      expression = node.initializer?.getText(source) ?? "";
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(expression).not.toBe("");
  const code = ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const active = {
    apiUrl: "api",
    isLoaded: true,
    isSignedIn: true,
    isActiveSession: true,
    userId: "user-a",
    sessionId: "session-a",
  };
  expect(runInNewContext(code, active)).toBe(JSON.stringify(["api", "user-a", "session-a"]));
  for (const changed of [
    { isLoaded: false },
    { isSignedIn: undefined },
    { isActiveSession: false },
    { isActiveSession: undefined },
    { userId: null },
    { sessionId: null },
  ])
    expect(runInNewContext(code, { ...active, ...changed })).toBeUndefined();
  expect(runInNewContext(code, { ...active, isSignedIn: false, isActiveSession: false })).toBe(
    "signed-out",
  );
});
it("restores before releasing Query observers and saves every subsequent authoritative result", async () => {
  const b = bindings(),
    key = ["events", "api", "user-a", "tables"];
  b.client.setQueryData(key, { id: "old" });
  createSessionPersister(b.client, b, b.storage, b.report).flush();
  b.client.clear();
  b.setRestored.mockImplementation(() => expect(b.client.getQueryData(key)).toEqual({ id: "old" }));
  const cleanup = callback("openMobileQueryStorage", b)();
  await vi.waitFor(() => expect(b.setRestored).toHaveBeenCalledWith(b.identity));
  b.client.setQueryData(key, { id: "fresh-server" });
  await Promise.resolve();
  expect(b.disk.get("queries")).toContain("fresh-server");
  cleanup();
  b.client.setQueryData(key, { id: "late" });
  await Promise.resolve();
  expect(b.disk.get("queries")).not.toContain("late");
});
it("never hydrates an old account after switch; drops its RAM before initializing next account", async () => {
  const b = bindings();
  let resolve!: (storage: typeof b.storage) => void;
  b.openMobileQueryStorage.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const cleanup = callback("openMobileQueryStorage", b)();
  cleanup();
  b.identity = "account-b-session-2";
  b.userId = "user-b";
  b.client.setQueryData(["events", "api", "user-a"], { id: "private-a" });
  const nextCleanup = callback("openMobileQueryStorage", b)();
  expect(b.client.getQueryCache().getAll()).toHaveLength(0);
  resolve(b.storage);
  await vi.waitFor(() => expect(b.setRestored).toHaveBeenCalledOnce());
  expect(b.setRestored).toHaveBeenCalledWith("account-b-session-2");
  nextCleanup();
});
it("total splash deadline unblocks fetching; late restore cannot replace new network data", async () => {
  vi.useFakeTimers();
  const b = bindings(),
    key = ["events", "api", "user-a"];
  b.startedAt = Date.now() - 4900;
  b.client.setQueryData(key, { id: "old-disk" });
  createSessionPersister(b.client, b, b.storage, b.report).flush();
  b.client.clear();
  let resolve!: (storage: typeof b.storage) => void;
  b.openMobileQueryStorage.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const cleanup = callback("openMobileQueryStorage", b)();
  await vi.advanceTimersByTimeAsync(100);
  expect(b.setRestored).toHaveBeenCalledWith(b.identity);
  b.client.setQueryData(key, { id: "new-network" });
  resolve(b.storage);
  await Promise.resolve();
  await Promise.resolve();
  expect(b.client.getQueryData(key)).toEqual({ id: "new-network" });
  cleanup();
});
it("purges definitive logout, not pending authentication; storage failure falls back observably", async () => {
  const b = bindings();
  expect(callback("openMobileQueryStorage", { ...b, identity: undefined })()).toBeUndefined();
  expect(b.purgeMobileQueryStorage).not.toHaveBeenCalled();
  b.previous.current = b.identity;
  b.identity = "signed-out";
  b.client.setQueryData(["profile", "api", "user-a"], { id: "private" });
  const cleanup = callback("openMobileQueryStorage", b)();
  expect(b.client.getQueryCache().getAll()).toHaveLength(0);
  await vi.waitFor(() => expect(b.purgeMobileQueryStorage).toHaveBeenCalledOnce());
  cleanup();
  b.identity = "account-a-session-3";
  b.openMobileQueryStorage.mockRejectedValueOnce(new Error("key unavailable"));
  const failedCleanup = callback("openMobileQueryStorage", b)();
  await vi.waitFor(() => expect(b.report).toHaveBeenCalledOnce());
  expect(b.setRestored).toHaveBeenLastCalledWith(b.identity);
  failedCleanup();
});
it.each([false, true])(
  "logout cancels RAM and persistence before Clerk; failed signout reinitializes safely (%s)",
  async (fails) => {
    const b = bindings(),
      stop = vi.fn();
    b.current.current = { stop, flush: vi.fn() };
    b.client.setQueryData(["profile", "api", "user-a"], { id: "private" });
    const work = vi.fn(async () => {
      if (fails) throw new Error("clerk unavailable");
    });
    const signOut = callback("await work()", b);
    const promise = signOut(work);
    expect(stop).toHaveBeenCalledOnce();
    expect(b.client.getQueryCache().getAll()).toHaveLength(0);
    expect(b.setBlocked).toHaveBeenCalledWith(true);
    if (fails) await expect(promise).rejects.toThrow("clerk unavailable");
    else await promise;
    expect(b.purgeMobileQueryStorage).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledOnce();
    expect(b.setBlocked).toHaveBeenLastCalledWith(false);
    expect(b.setAttempt).toHaveBeenCalledOnce();
  },
);
it("a hung SecureStore purge does not hold Clerk logout or navigation forever", async () => {
  const b = bindings();
  b.purgeMobileQueryStorage.mockImplementationOnce(() => new Promise(() => {}));
  const work = vi.fn(async () => undefined);
  await callback("await work()", b)(work);
  expect(work).toHaveBeenCalledOnce();
  expect(b.setBlocked).toHaveBeenLastCalledWith(false);
});
it("storage purge error never prevents Clerk logout and is reported without payloads", async () => {
  const b = bindings();
  b.purgeMobileQueryStorage.mockRejectedValueOnce(new Error("locked"));
  const work = vi.fn(async () => undefined);
  await callback("await work()", b)(work);
  expect(work).toHaveBeenCalledOnce();
  expect(b.report).toHaveBeenCalledOnce();
});
it("background transition flushes synchronously, not after a long debounce", () => {
  const b = bindings(),
    flush = vi.fn();
  b.current.current = { stop: vi.fn(), flush };
  let onChange!: (state: string) => void;
  const remove = vi.fn();
  const cleanup = callback("AppState.addEventListener", {
    ...b,
    AppState: {
      addEventListener: (_event: string, fn: typeof onChange) => {
        onChange = fn;
        return { remove };
      },
    },
  })();
  onChange("active");
  expect(flush).not.toHaveBeenCalled();
  onChange("background");
  expect(flush).toHaveBeenCalledOnce();
  cleanup();
  expect(remove).toHaveBeenCalledOnce();
});
