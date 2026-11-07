import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute provider wiring only; this does not claim native UI/push delivery acceptance.
it.each([true, false])(
  "syncs application locale independently of push permission (signed in=%s)",
  (isSignedIn) => {
    const source = readFileSync(
      new URL("../../../components/notifications/NotificationBadgeSync.tsx", import.meta.url),
      "utf8",
    );
    const file = ts.createSourceFile(
      "badge.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const component = file.statements.find(
      (statement) =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === "NotificationBadgeSync",
    );
    expect(component).toBeDefined();
    const sync = vi.fn();
    const notifications = vi.fn(() => ({ list: { data: undefined } }));
    const getToken = vi.fn();
    const bindings = {
      apiUrl: "https://api.test",
      useSessionAuth: () => ({
        getToken,
        isLoaded: true,
        isSignedIn,
        userId: isSignedIn ? "viewer" : null,
      }),
      useQueryClient: () => ({}),
      useLingui: () => ({ i18n: { locale: "it-IT" } }),
      usePreferredLanguageSync: sync,
      useNotifications: notifications,
      useEffect: vi.fn(),
    };
    const code = ts.transpileModule(
      `${component?.getText(file).replace("export function", "function")}\nNotificationBadgeSync();`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText;
    runInNewContext(code, bindings);
    expect(sync).toHaveBeenCalledWith(
      {
        apiUrl: "https://api.test",
        getToken,
        userId: isSignedIn ? "viewer" : null,
        enabled: isSignedIn,
      },
      "it",
    );
    expect(notifications).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "it", enabled: isSignedIn }),
      3,
    );
    expect(getToken).not.toHaveBeenCalled();
  },
);
