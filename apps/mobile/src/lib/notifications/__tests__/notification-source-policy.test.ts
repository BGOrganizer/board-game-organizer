import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { notificationItemId } from "@board-game-organizer/schemas";
import ts from "typescript";
import { expect, it } from "vitest";
import { headerButtonProps } from "../../../components/common/layout/headerStyles";

// Static consent/composition policies only. No React or native renderer is replaced.

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
    ts.transpileModule(`(${expression})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
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
    evaluate(id.initializer.expression.getText(file), {
      group,
      person,
      notificationItemId,
    }),
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
      evaluate(expression.condition.getText(file), {
        person: { membership: { status } },
      }),
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

const componentSource = (file: string) =>
  readFileSync(new URL(`../../../components/${file}.tsx`, import.meta.url), "utf8");

it("keeps the unread presentation primitive free of timers, animation, domain state and write side effects", () => {
  expect(componentSource("common/ui/NotificationUnreadDot")).not.toMatch(
    /useEffect|useAppStore|withTiming|withRepeat|acknowledge|\.read\(/,
  );
});

it("keeps the card marker after its shrinkable title and precise markers outside voting actions", () => {
  const title = componentSource("common/ui/ListCardBody");
  expect(title.indexOf("{title}")).toBeLessThan(title.indexOf("<NotificationUnreadDot"));
  expect(title).toContain("flexShrink: 1");
  expect(title).not.toContain("numberOfLines={1}");
  for (const row of ["games/GameListRow", "locations/LocationListRow"]) {
    const code = componentSource(row);
    expect(code).toContain("{titleAccessory}");
    expect(code).toContain("flexShrink: 1");
    expect(code).toContain("minWidth: 0");
  }
  const marker = componentSource("notifications/NotificationItem");
  expect(marker).toContain("<NotificationUnreadDot");
  expect(marker).toContain("measureLayout");
  expect(marker).toContain("scrollTo");
  expect(marker).not.toMatch(/attention\?\.read\(|Mark as read|<Button/);
  expect(marker).not.toMatch(/Pulse|Border|useAppStore/);
});

it("keeps ordinary contact selection local and source-specific without opt-in reads on mount", () => {
  const contacts = readFileSync(
    new URL("../../../app/(tabs)/contacts.tsx", import.meta.url),
    "utf8",
  );
  expect(contacts).not.toContain("readOnOpen=");
  expect(contacts).toContain("readSection(next)");
  expect(contacts).toContain("setTab(next)");
});

it("retains the native header action's shared small size and minimum target", () => {
  const page = readFileSync(new URL("../../../app/notifications.tsx", import.meta.url), "utf8");
  expect(page).toContain("{...headerButtonProps}");
  expect(headerButtonProps.size).toBe("sm");
  expect(headerButtonProps.style).toEqual({ minWidth: 44, minHeight: 44 });
});

it("keeps the same read glyph and bounded stable change identities without introducing row-press acknowledgments", () => {
  const page = readFileSync(new URL("../../../app/notifications.tsx", import.meta.url), "utf8");
  const changes = componentSource("notifications/NotificationChangesPopover");
  expect(page).toContain("<CheckCheck");
  expect(changes).toContain("<CheckCheck size={20}");
  expect(changes).toMatch(/`\$\{row\.notificationId\}:\$\{row\.itemId \?\? "generic"\}`/);
  for (const literal of ["initialNumToRender={8}", "maxToRenderPerBatch={8}", "windowSize={5}"])
    expect(changes).toContain(literal);
  const ast = ts.createSourceFile(
    "changes.tsx",
    changes,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const row = ast.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => declaration.name.getText(ast) === "ChangeRow",
      ),
  );
  expect(row).toBeDefined();
  expect(row?.getText(ast)).not.toMatch(/onPress|markAllAsRead|markDisplayedAsRead/);
});
