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
  const hooks: {
    value?: unknown;
    current?: unknown;
    effect?: boolean;
    deps?: readonly unknown[];
    cleanup?: () => void;
  }[] = [];
  let active = true;
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
      useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
        const i = cursor++;
        if (hooks[i]?.deps?.every((value, index) => Object.is(value, deps[index]))) return;
        hooks[i]?.cleanup?.();
        hooks[i] = { effect: true, deps, cleanup: callback() };
      },
    },
    "@board-game-organizer/shared": { useGroupLeaderboard: () => ({ games, players }) },
    "@lingui/react": { useLingui: () => ({ i18n: { locale: "en" } }) },
    "expo-constants": { default: { expoConfig: { extra: { apiUrl: "https://api.test" } } } },
    "@/lib/useSessionAuth": { useSessionAuth: () => ({ userId: "owned", getToken: vi.fn() }) },
    "@/lib/i18n": { useT: () => (text: string) => text },
    "@/lib/listActivity": { useListActivity: () => () => active },
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
    hide: () => {
      active = false;
      for (const hook of hooks) {
        hook?.cleanup?.();
        if (hook?.effect) {
          hook.deps = undefined;
          hook.cleanup = undefined;
        }
      }
    },
    show: () => {
      active = true;
      return render();
    },
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

it("resets ranking presentation on hide, requires a new drag and rejects the old activation", () => {
  const h = ranking();
  h.select(h.render(), 10);
  let tree = h.render();
  tree.props.onScrollBeginDrag();
  tree.props.onEndReached();
  tree = h.render();
  expect(tree.props.data).toHaveLength(50);
  const late = tree.props.onEndReached;
  h.hide();
  late();
  tree = h.show();
  expect(tree.props.data).toHaveLength(25);
  late();
  tree.props.onEndReached();
  expect(h.render().props.data).toHaveLength(25);
  tree.props.onScrollBeginDrag();
  tree.props.onEndReached();
  expect(h.render().props.data).toHaveLength(50);
  expect(h.players.fetchNextPage).not.toHaveBeenCalled();
  h.cleanup();
});

it("does not let a hidden ranking request release a newer activation's in-flight guard", async () => {
  const h = ranking();
  h.players.data.pages = [h.players.data.pages[0]];
  const pending: Array<(value: { isError: boolean }) => void> = [];
  h.players.fetchNextPage.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  h.select(h.render(), 10);
  let tree = h.render();
  tree.props.onScrollBeginDrag();
  tree.props.onEndReached();
  h.hide();
  tree = h.show();
  tree.props.onScrollBeginDrag();
  tree.props.onEndReached();
  expect(pending).toHaveLength(2);
  pending[0]({ isError: false });
  await Promise.resolve();
  tree.props.onEndReached();
  expect(pending).toHaveLength(2);
  pending[1]({ isError: false });
  await Promise.resolve();
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

// The wizard must still reveal invalid virtualized rows after decorative observers are removed.
it("keeps wizard validation viewability and recovery on the same scoped native list", () => {
  const text = source("events/EventWizard");
  const ast = ts.createSourceFile(
    "wizard.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let list: ts.JsxSelfClosingElement | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "InputFlatList")
      list = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!list) throw new Error("Missing wizard list");
  const attributes = list.attributes.properties;
  expect(
    attributes.some(
      (attribute) =>
        ts.isJsxSpreadAttribute(attribute) && attribute.expression.getText(ast) === "validation",
    ),
  ).toBe(true);
  const viewability = attributes.find(
    (attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "onViewableItemsChanged",
  );
  expect(viewability?.getText(ast)).toBe(
    "onViewableItemsChanged={validation.onViewableItemsChanged}",
  );
  expect(attributes.some((attribute) => attribute.getText(ast) === "key={validationScope}")).toBe(
    true,
  );
});

function groupPanelSource() {
  const ast = ts.createSourceFile(
    "group.tsx",
    source("groups/GroupDetail"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const panels: ts.JsxElement[] = [];
  const declarations = new Map<string, ts.VariableDeclaration>();
  let changesHooks = 0;
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "RetainedTabPanel")
      panels.push(node);
    if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(ast), node);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useNotificationChanges")
      changesHooks++;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const attribute = (element: ts.JsxOpeningElement, name: string) => {
    const property = element.attributes.properties.find(
      (node) => ts.isJsxAttribute(node) && node.name.getText(ast) === name,
    );
    if (
      !property ||
      !ts.isJsxAttribute(property) ||
      !property.initializer ||
      !ts.isJsxExpression(property.initializer) ||
      !property.initializer.expression
    )
      throw new Error(`Missing ${name} expression`);
    return property.initializer.expression.getText(ast);
  };
  return { ast, panels, declarations, changesHooks, attribute };
}

it("isolates each retained Group panel's tab measurements and scopes its identity to the current owner", () => {
  const h = groupPanelSource();
  expect(h.panels).toHaveLength(4);
  const destinations = new Map([
    ["info", "ScreenScrollView"],
    ["members", "GroupMembers"],
    ["events", "Events"],
    ["rankings", "GroupLeaderboard"],
  ]);
  const seen = new Set<string>();
  for (const panel of h.panels) {
    const opening = panel.openingElement;
    const key = h.attribute(opening, "key");
    const keyFor = (apiUrl: string, userId: string, id: string): string =>
      runInNewContext(key, { o: { apiUrl, userId }, group: { id } });
    const ownerKey = JSON.parse(keyFor("preview", "actor", "group")) as string[];
    const destination = ownerKey[3];
    expect(ownerKey).toEqual(["preview", "actor", "group", destination]);
    expect(destinations.has(destination)).toBe(true);
    expect(seen.has(destination)).toBe(false);
    seen.add(destination);
    expect(keyFor("other-preview", "actor", "group")).not.toBe(JSON.stringify(ownerKey));
    expect(keyFor("preview", "other-actor", "group")).not.toBe(JSON.stringify(ownerKey));
    expect(keyFor("preview", "actor", "other-group")).not.toBe(JSON.stringify(ownerKey));
    const active = h.attribute(opening, "active");
    for (const selectedTab of destinations.keys())
      expect(runInNewContext(active, { selectedTab })).toBe(selectedTab === destination);
    const roots = panel.children.filter((node): node is ts.JsxElement => ts.isJsxElement(node));
    expect(roots).toHaveLength(1);
    const tabs = roots[0];
    expect(tabs.openingElement.tagName.getText(h.ast)).toBe("Tabs");
    expect(h.attribute(tabs.openingElement, "value")).toBe("selectedTab");
    expect(h.attribute(tabs.openingElement, "onValueChange")).toBe("changeTab");
    expect(tabs.getText(h.ast)).toContain(`<${destinations.get(destination)}`);
    if (destination !== "info") {
      let guard: ts.Node | undefined = panel.parent;
      while (guard && !ts.isConditionalExpression(guard)) guard = guard.parent;
      if (!guard || !ts.isConditionalExpression(guard)) throw new Error("Missing permission guard");
      expect(guard.condition.getText(h.ast)).toBe(
        `group.${destination === "members" ? "canViewMembers" : destination === "events" ? "canViewEvents" : "canViewRankings"}`,
      );
      expect(guard.whenFalse.getText(h.ast)).toBe("null");
    }
  }
  expect([...seen]).toEqual([...destinations.keys()]);
  expect(h.changesHooks).toBe(1);
});

it("falls back to Group Details whenever a selected destination is no longer authorized", () => {
  const h = groupPanelSource();
  const expression = h.declarations.get("selectedTab")?.initializer?.getText(h.ast);
  if (!expression) throw new Error("Missing authorized Group selection");
  for (let mask = 0; mask < 8; mask++) {
    const group = {
      canViewMembers: Boolean(mask & 1),
      canViewEvents: Boolean(mask & 2),
      canViewRankings: Boolean(mask & 4),
    };
    for (const tab of ["info", "members", "events", "rankings", "unknown"]) {
      const allowed =
        tab === "members"
          ? group.canViewMembers
          : tab === "events"
            ? group.canViewEvents
            : tab === "rankings"
              ? group.canViewRankings
              : false;
      expect(runInNewContext(expression, { group, tab })).toBe(allowed ? tab : "info");
    }
  }
  expect(runInNewContext(expression, { group: undefined, tab: "members" })).toBe("info");
});

it("dismisses the keyboard only when changing the selected Group destination", () => {
  const h = groupPanelSource();
  const declaration = h.declarations.get("changeTab")?.initializer;
  if (!declaration || !ts.isCallExpression(declaration))
    throw new Error("Missing Group tab action");
  const dismiss = vi.fn(),
    setTab = vi.fn();
  const callback = ts.transpileModule(`(${declaration.arguments[0].getText(h.ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const change = runInNewContext(callback, {
    selectedTab: "members",
    Keyboard: { dismiss },
    setTab,
  }) as (value: string) => void;
  change("members");
  expect(dismiss).not.toHaveBeenCalled();
  expect(setTab).not.toHaveBeenCalled();
  change("events");
  expect(dismiss).toHaveBeenCalledOnce();
  expect(setTab).toHaveBeenCalledExactlyOnceWith("events");
});
