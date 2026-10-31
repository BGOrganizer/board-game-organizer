import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute only the existing callbacks; RN UI/permission acceptance remains in Maestro.
function callbacks(nativePermission: Promise<unknown>, registration = Promise.resolve()) {
  const source = readFileSync(
    new URL("../../../components/notifications/NotificationBell.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "bell.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const functions = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = node.name.getText(file);
      if (name === "requestPermissionFromBell" && ts.isCallExpression(node.initializer))
        functions.set(name, node.initializer.arguments[0].getText(file));
      if (name === "handleOpenChange") functions.set(name, node.initializer.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(functions.size).toBe(2);
  const bindings = {
    requestMobilePushPermission: vi.fn(() => nativePermission),
    setIsOpen: vi.fn(),
    setPermission: vi.fn(),
    setPushError: vi.fn(),
    registeredRef: { current: null as string | null },
    registrationKey: "viewer:it",
    isSignedIn: true,
    registerPush: vi.fn(() => registration),
    queryClient: { invalidateQueries: vi.fn(async () => undefined) },
    Notifications: { PermissionStatus: { GRANTED: "granted", DENIED: "denied" } },
    result: undefined as undefined | ((open: boolean) => Promise<void> | undefined),
  };
  const code = ts.transpileModule(
    `const requestPermissionFromBell = ${functions.get("requestPermissionFromBell")};
     const handleOpenChange = ${functions.get("handleOpenChange")};
     result = handleOpenChange;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  runInNewContext(code, bindings);
  return { ...bindings, open: bindings.result as (open: boolean) => Promise<void> | undefined };
}

it("opens only after native permission settles, without waiting for push registration", async () => {
  let grant: (value: unknown) => void = () => {};
  let registered: () => void = () => {};
  const permission = new Promise((resolve) => {
    grant = resolve;
  });
  const registration = new Promise<void>((resolve) => {
    registered = resolve;
  });
  const bell = callbacks(permission, registration);
  const pending = bell.open(true);
  expect(bell.requestMobilePushPermission).toHaveBeenCalledOnce();
  expect(bell.setIsOpen).not.toHaveBeenCalled();
  grant({ status: "granted" });
  await vi.waitFor(() => expect(bell.registerPush).toHaveBeenCalledOnce());
  expect(bell.setIsOpen).toHaveBeenCalledWith(true);
  expect(bell.setPermission).toHaveBeenCalledWith({ status: "granted", canAskAgain: false });
  registered();
  await pending;
  expect(bell.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  bell.open(false);
  expect(bell.setIsOpen).toHaveBeenLastCalledWith(false);
  expect(bell.requestMobilePushPermission).toHaveBeenCalledOnce();
});

it("re-registers a granted installation when its locale changes, but reuses the current locale", async () => {
  const bell = callbacks(Promise.resolve({ status: "granted" }));
  bell.registeredRef.current = bell.registrationKey;
  await bell.open(true);
  expect(bell.registerPush).not.toHaveBeenCalled();
  bell.registeredRef.current = "viewer:en";
  await bell.open(true);
  expect(bell.registerPush).toHaveBeenCalledOnce();
});

it.each(["denied", "unsupported"])("keeps inbox available when push is %s", async (status) => {
  const bell = callbacks(Promise.resolve({ status, canAskAgain: false }));
  await bell.open(true);
  expect(bell.setIsOpen).toHaveBeenCalledWith(true);
  expect(bell.registerPush).not.toHaveBeenCalled();
  expect(bell.queryClient.invalidateQueries).not.toHaveBeenCalled();
});

it("keeps inbox available and preserves the error path if the native request fails", async () => {
  let reject: (reason: Error) => void = () => {};
  const permission = new Promise((_, fail) => {
    reject = fail;
  });
  const bell = callbacks(permission);
  const pending = bell.open(true);
  reject(new Error("Native permission unavailable"));
  await pending;
  expect(bell.setIsOpen).toHaveBeenCalledWith(true);
  expect(bell.setPushError).toHaveBeenLastCalledWith(true);
  expect(bell.registerPush).not.toHaveBeenCalled();
});
