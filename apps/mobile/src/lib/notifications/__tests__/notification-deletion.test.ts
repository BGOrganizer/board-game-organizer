import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute real native callback/prop expressions, not a rendered-device acceptance substitute.
const file = ts.createSourceFile(
  "notifications.tsx",
  readFileSync(new URL("../../../app/notifications.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function evaluate(tag: string, attribute: string, scope: Record<string, unknown>) {
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const props = node.attributes.properties.filter(ts.isJsxAttribute);
      const bulk = props.some(
        (prop) =>
          prop.name.getText(file) === "testID" &&
          prop.initializer &&
          ts.isStringLiteral(prop.initializer) &&
          prop.initializer.text === "delete-all-notifications",
      );
      if (node.tagName.getText(file) === tag && (tag !== "Button" || bulk)) {
        const value = props.find((prop) => prop.name.getText(file) === attribute)?.initializer;
        if (value && ts.isJsxExpression(value)) expression = value.expression?.getText(file) ?? "";
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(expression).not.toBe("");
  return runInNewContext(
    ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText,
    scope,
  );
}

it("opens bulk confirmation from the header without dispatching a write", () => {
  const setDeletion = vi.fn();
  evaluate("Button", "onPress", { owner: "current-session", setDeletion })();
  expect(setDeletion).toHaveBeenCalledExactlyOnceWith({ owner: "current-session" });
  expect(evaluate("Button", "style", {})).toEqual({ width: 44, height: 44 });
});

it.each([
  [0, false, 0, false, true],
  [0, true, 0, false, false],
  [1, false, 0, false, false],
  [1, false, 1, true, true],
])(
  "gates native header deletion on availability/conflicts (%j)",
  (length, hasMore, unreadCount, busy, disabled) => {
    expect(
      evaluate("Button", "isDisabled", {
        isLoaded: true,
        isSignedIn: true,
        notifications: { notifications: { length }, hasMore, unreadCount, busy },
      }),
    ).toBe(disabled);
  },
);

it.each([undefined, "notification-id"])(
  "confirms %s deletion and closes without waiting for HTTP",
  (id) => {
    const calls: unknown[] = [];
    const actions = evaluate("ConfirmDialog", "actions", {
      deleting: { id },
      t: (text: string) => text,
      notifications: {
        deleteNotification: {
          mutate: (value: string) => {
            calls.push(value);
            return new Promise(() => {});
          },
        },
        deleteAllNotifications: {
          mutate: () => {
            calls.push("all");
            return new Promise(() => {});
          },
        },
      },
      setDeletion: (value: null) => calls.push(value),
    });
    expect(actions[0].variant).toBe("danger");
    expect(actions[0].label).toBe(id ? "Delete notification" : "Delete all notifications");
    actions[0].onPress();
    expect(calls).toEqual([id ?? "all", null]);
  },
);

it("cancels without a write and stops scroll pagination while a deletion owns the inbox", () => {
  const setDeletion = vi.fn();
  evaluate("ConfirmDialog", "onCancel", { setDeletion })();
  expect(setDeletion).toHaveBeenCalledExactlyOnceWith(null);
  const fetchNextPage = vi.fn();
  for (const busy of [true, false]) {
    evaluate("FlatList", "onEndReached", {
      notifications: { busy, hasMore: true, list: { fetchNextPage } },
    })();
    expect(fetchNextPage).toHaveBeenCalledTimes(busy ? 0 : 1);
  }
});

it("does not carry destructive consent into another actor or session", () => {
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "deleting")
      expression = node.initializer?.getText(file) ?? "";
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(expression).toContain("deletion?.owner === owner");
  for (const owner of ["old-session", "current-session"]) {
    const deletion = { owner: "current-session" };
    expect(runInNewContext(expression, { isLoaded: true, isSignedIn: true, deletion, owner })).toBe(
      owner === deletion.owner ? deletion : null,
    );
  }
});
