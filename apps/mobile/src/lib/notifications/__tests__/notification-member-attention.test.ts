import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { notificationItemId } from "@board-game-organizer/schemas";
import ts from "typescript";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../components/groups/GroupMembers.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "members.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function nodes(predicate: (node: ts.Node) => boolean) {
  const result: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}
function evaluate(expression: string, bindings: Record<string, unknown>) {
  return runInNewContext(
    ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText,
    bindings,
  );
}
// Execute actual row identity/guard expressions; not rendered/device acceptance.
it("retains the real accepted member's passive canonical marker with no timed/read handler", () => {
  const marker = nodes(
    (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "NotificationItem",
  )[0] as ts.JsxSelfClosingElement;
  const id = marker.attributes.properties
    .filter(ts.isJsxAttribute)
    .find((attribute) => attribute.name.getText(file) === "itemId");
  if (!id?.initializer || !ts.isJsxExpression(id.initializer) || !id.initializer.expression)
    throw new Error("Missing canonical member point");
  const group = { id: "11111111-1111-4111-8111-111111111111" },
    person = { userId: "user_member" };
  expect(
    evaluate(id.initializer.expression.getText(file), { group, person, notificationItemId }),
  ).toBe(notificationItemId(group.id, "member", person.userId));
  expect(
    marker.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => attribute.name.getText(file)),
  ).toEqual(["itemId"]);
  const title = nodes(
    (node) => ts.isJsxAttribute(node) && node.name.getText(file) === "titleAccessory",
  )[0] as ts.JsxAttribute;
  const expression = (title.initializer as ts.JsxExpression).expression as ts.ConditionalExpression;
  for (const status of ["ACCEPTED", "PENDING", "DECLINED"])
    expect(
      evaluate(expression.condition.getText(file), { person: { membership: { status } } }),
    ).toBe(status === "ACCEPTED");
});
it("does not acknowledge on elapsed visibility, app state, focus or scrolling and preserves bounded rendering", () => {
  expect(source).not.toMatch(
    /GroupMemberAttention|useNotificationItemDwell|useFocusEffect|AppState\.addEventListener|setTimeout|visibleIds|itemVisiblePercentThreshold/,
  );
  expect(source).toContain("<UserList");
  expect(source).toContain("data={denied ? [] : list.items}");
  const scope = readFileSync(
      new URL("../../../components/notifications/NotificationAttentionScope.tsx", import.meta.url),
      "utf8",
    ),
    marker = readFileSync(
      new URL("../../../components/notifications/NotificationItem.tsx", import.meta.url),
      "utf8",
    );
  expect(scope).not.toMatch(/useFocusEffect|useEffect|attention\.read\(/);
  expect(marker).not.toMatch(/Mark as read|attention\?\.read\(/);
  expect(marker).toContain("<NotificationUnreadDot");
});
