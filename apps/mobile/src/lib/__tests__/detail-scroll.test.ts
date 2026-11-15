import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
const source = (path: string) =>
  readFileSync(new URL(`../../components/${path}.tsx`, import.meta.url), "utf8");
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value && typeof value === "object" && "props" in value) {
    const node = value as Element;
    return [node, ...nodes(node.props.children)];
  }
  return [];
}

function ranking() {
  const page = (offset: number) => ({
    players: Array.from({ length: 25 }, (_, i) => ({ userId: String(offset + i) })),
  });
  const first = page(0);
  const players = {
    data: { pages: [first, page(25), page(50)] },
    isFetching: false,
    isPending: false,
    isError: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    fetchNextPage: vi.fn(async () => ({ isError: false })),
  };
  const games = {
    data: { games: [{ id: 10, name: "Owned game" }] },
    isPending: false,
    isError: false,
  };
  const hooks: { value?: unknown; current?: unknown; cleanup?: () => void }[] = [];
  let cursor = 0;
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const exports: Record<string, (props: Record<string, unknown>) => Element> = {};
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    react: {
      useState: (initial: unknown) => {
        const i = cursor++;
        hooks[i] ??= { value: initial };
        return [
          hooks[i].value,
          (value: unknown) => {
            hooks[i].value = typeof value === "function" ? value(hooks[i].value) : value;
          },
        ];
      },
      useRef: (initial: unknown) => {
        const i = cursor++;
        hooks[i] ??= { current: initial };
        return hooks[i];
      },
      useMemo: (callback: () => unknown) => {
        cursor++;
        return callback();
      },
      useEffect: (callback: () => (() => void) | undefined) => {
        const i = cursor++;
        if (!hooks[i]) hooks[i] = { cleanup: callback() };
      },
    },
    "@board-game-organizer/shared": { useGroupLeaderboard: () => ({ games, players }) },
    "@lingui/react": { useLingui: () => ({ i18n: { locale: "en" } }) },
    "expo-constants": { default: { expoConfig: { extra: { apiUrl: "https://api.test" } } } },
    "@/lib/useSessionAuth": { useSessionAuth: () => ({ userId: "owned", getToken: vi.fn() }) },
    "@/lib/i18n": { useT: () => (text: string) => text },
    "heroui-native/hooks": { useThemeColor: () => "muted" },
  };
  (modules["@board-game-organizer/shared"] as Record<string, unknown>).resolveApiUrl = (
    url: string,
  ) => url;
  runInNewContext(
    ts.transpileModule(source("groups/GroupLeaderboard"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Intl,
      setTimeout: () => 1,
      clearTimeout: () => {},
      require: (id: string) =>
        modules[id] ??
        new Proxy(
          {},
          { get: (_target, name) => (name === "Button" ? { Label: "Label" } : String(name)) },
        ),
    },
  );
  const header = { type: "DetailCardAndTabs", props: {} };
  const render = () => {
    cursor = 0;
    return exports.GroupLeaderboard({ groupId: "group", header });
  };
  const select = (tree: Element, id: number) => {
    const control = nodes(tree.props.ListHeaderComponent).find(
      (node) => node.type === "RatingGameSelect",
    );
    if (!control) throw Error("Game selector missing");
    control.props.onChange(id);
  };
  return {
    players,
    games,
    header,
    render,
    select,
    cleanup: () => {
      for (const hook of hooks) hook?.cleanup?.();
    },
  };
}

it("scrolls the ranking card, tabs and selector with its virtualized list, even in loading/error/empty states", () => {
  const h = ranking();
  for (const state of ["pending", "error", "empty", "ready"]) {
    h.games.isPending = state === "pending";
    h.games.isError = state === "error";
    h.games.data.games = state === "empty" ? [] : [{ id: 10, name: "Owned game" }];
    const tree = h.render();
    expect(tree.type).toBe("FlatList");
    expect(nodes(tree.props.ListHeaderComponent)).toContain(h.header);
    expect(tree.props.contentContainerStyle.padding).toBe(20);
    expect(tree.props.data).toEqual([]);
  }
  h.cleanup();
});

it("reveals bounded cached ranking pages progressively, coalesces end events and resets a new game", () => {
  const h = ranking();
  let tree = h.render();
  h.select(tree, 10);
  tree = h.render();
  expect(tree.props.data).toHaveLength(25);
  tree.props.onEndReached();
  expect(h.render().props.data).toHaveLength(25);
  tree.props.onScrollBeginDrag();
  tree.props.onEndReached();
  tree.props.onEndReached();
  tree = h.render();
  expect(tree.props.data).toHaveLength(50);
  expect(h.players.fetchNextPage).not.toHaveBeenCalled();
  tree.props.onEndReached();
  tree = h.render();
  expect(tree.props.data).toHaveLength(75);
  h.select(tree, 11);
  tree = h.render();
  expect(tree.props.data).toHaveLength(25);
  tree.props.onEndReached();
  expect(h.render().props.data).toHaveLength(25);
  h.cleanup();
});

it("rejects late ranking pages after changing game and does not duplicate a request", async () => {
  const h = ranking();
  h.players.data.pages = [h.players.data.pages[0]];
  let complete!: (value: { isError: boolean }) => void;
  h.players.fetchNextPage.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  let tree = h.render();
  h.select(tree, 10);
  tree = h.render();
  tree.props.onScrollBeginDrag();
  tree.props.onEndReached();
  tree.props.onEndReached();
  expect(h.players.fetchNextPage).toHaveBeenCalledOnce();
  h.select(tree, 11);
  h.render();
  complete({ isError: false });
  await Promise.resolve();
  expect(h.render().props.data).toHaveLength(25);
  h.cleanup();
});

it.each([
  ["groups/GroupDetail", "GroupIdentityCard", "<GroupMembers", "<GroupLeaderboard"],
  ["events/EventDetail", "EventDetailsCard", "<EventParticipants", "ListHeaderComponent="],
  ["events/EventTable", "EventTableInfo", "<EventTableResults", "<EventTableOverview"],
])("places the %s identity and tab bar in the active scroll header", (path, card, ...consumers) => {
  const text = source(path);
  const ast = ts.createSourceFile(
    "detail.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let header = "";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "detailHeader")
      header = node.initializer?.getText(ast) ?? "";
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(header).toContain(`<${card}`);
  expect(header).toContain("<TabBar");
  for (const consumer of consumers) expect(text).toContain(consumer);
  expect(text).toContain("header={detailHeader}");
  expect(text).not.toMatch(/stickyHeaderIndices|nestedScrollEnabled|scrollEnabled=\{false\}/);
});
