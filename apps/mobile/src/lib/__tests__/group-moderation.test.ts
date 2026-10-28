import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute real navigation/paging callbacks, not RN rendering; Maestro owns native UI acceptance.
function expression(fileName: string, tag: string, attribute: string) {
  const source = readFileSync(
    new URL(`../../components/groups/${fileName}.tsx`, import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let value = "";
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === tag
    ) {
      const prop = node.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.getText(file) === attribute,
      );
      if (
        prop &&
        ts.isJsxAttribute(prop) &&
        prop.initializer &&
        ts.isJsxExpression(prop.initializer)
      )
        value = prop.initializer.expression?.getText(file) ?? "";
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(value).not.toBe("");
  return ts.transpileModule(`(${value})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}

it("renders moderation items through the existing Group card and opens their review, not ordinary group detail", () => {
  const item = { id: "11111111-1111-4111-8111-111111111111", name: "Pending club" };
  const renderItem = runInNewContext(expression("GroupModeration", "FlatList", "renderItem"), {
    GroupCard: "GroupCard",
    React: { createElement: (type: string, props: Record<string, unknown>) => ({ type, props }) },
  });
  const row = renderItem({ item });
  expect(row.type).toBe("GroupCard");
  expect(row.props.group).toBe(item);
  expect(row.props.onRespond).toBeUndefined();
  expect(row.props.href).toEqual({
    pathname: "/moderation/[groupId]",
    params: { groupId: item.id },
  });
  const router = { push: vi.fn() };
  const press = runInNewContext(expression("GroupCard", "LinkedListCard", "onPress"), {
    router,
    group: item,
    href: row.props.href,
  });
  press();
  expect(router.push).toHaveBeenCalledWith(row.props.href);
  const ordinary = runInNewContext(expression("GroupCard", "LinkedListCard", "onPress"), {
    router,
    group: item,
    href: undefined,
  });
  ordinary();
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: "/group/[groupId]",
    params: { groupId: item.id },
  });
});

it.each([
  [true, false, false, true],
  [false, false, false, false],
  [true, true, false, false],
  [true, false, true, false],
])(
  "pages only with another page, no active request and no failed-page loop (%s/%s/%s)",
  (hasNextPage, isFetchingNextPage, isFetchNextPageError, fetches) => {
    const q = { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage: vi.fn() };
    runInNewContext(expression("GroupModeration", "FlatList", "onEndReached"), { q })();
    expect(q.fetchNextPage).toHaveBeenCalledTimes(fetches ? 1 : 0);
  },
);

it("omits membership actions when a review card has no response callback", () => {
  expect(
    runInNewContext(expression("GroupCard", "LinkedListCard", "actions"), {
      invited: true,
      onRespond: undefined,
    }),
  ).toBeUndefined();
});

it("keeps the queue virtualized, access-filtered and aligned with native list/search/loading/empty patterns", () => {
  const source = readFileSync(
    new URL("../../components/groups/GroupModeration.tsx", import.meta.url),
    "utf8",
  );
  for (const token of [
    "<ListPage>",
    "<FlatList",
    "<ListSearch",
    "<EmptyList",
    "listPageContentStyle",
    "useSafeAreaInsets",
    'useGroupRecords(o, "moderation", f.search)',
    "communityAccessDenied(q.error) ? [] : q.items",
    "q.isFetchingNextPage",
    't("Could not load moderation queue")',
  ])
    expect(source).toContain(token);
  expect(source).not.toContain("<ScrollView");
  expect(source).not.toContain("<Button.Label>{item.name}");
});
