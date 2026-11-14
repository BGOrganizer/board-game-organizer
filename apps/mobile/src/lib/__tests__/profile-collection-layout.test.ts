import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Actual component wiring; the shared scroll owner's geometry is checked independently.
// Neither check is rendered native keyboard/frame-timing acceptance.
const source = readFileSync(
  new URL("../../components/profile/ProfileCollection.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "ProfileCollection.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const decl = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "ProfileCollection",
);
if (!decl) throw Error("Missing Collection");
const code = ts.transpileModule(
  `${decl.getText(file).replace("export ", "")};ProfileCollection(props);`,
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;

it("keeps one keyboard-aware virtualized owner for empty/few results, sticky filters and bounded paging", () => {
  const window = {
    items: [] as unknown[],
    hasMore: false,
    beginScroll: vi.fn(),
    endReached: vi.fn(),
    loadMore: vi.fn(),
  };
  const filter = {
    query: "Chess",
    search: "Chess",
    types: "all",
    selected: ["games", "expansions"],
    setQuery: vi.fn(),
    toggle: vi.fn(),
  };
  const context: Record<string, unknown> = {
    props: { snapshot: "snapshot", subjectId: "owner", header: "Profile" },
    React: {
      createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
        type,
        props,
        children,
      }),
    },
    useT: () => (text: string) => text,
    useLingui: () => ({ i18n: { locale: "en" } }),
    useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "owner" }),
    useSafeAreaInsets: () => ({ bottom: 20 }),
    useBggCollectionFilters: () => filter,
    useBggCollection: () => ({
      data: {
        pages: [{ items: [], counts: { withoutExpansions: 1, withExpansions: 1, wishlist: 0 } }],
      },
      isPending: false,
      isError: false,
    }),
    bggCollectionQuery: () => ({ queryKey: ["collection"] }),
    hashKey: () => "scope",
    communityAccessDenied: () => false,
    useGameListWindow: () => window,
    noExclusions: new Set(),
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    GAME_PICKER_CHUNK_SIZE: 8,
    key: (item: { id: number }) => String(item.id),
  };
  for (const name of [
    "InputSectionList",
    "View",
    "Skeleton",
    "ProfileStats",
    "SearchInput",
    "FilterChips",
    "Typography",
    "Button",
    "CollectionRow",
    "GameGap",
    "Gamepad2",
    "Heart",
    "Puzzle",
    "UsersRound",
  ])
    context[name] = name;
  const render = () => runInNewContext(code, context);
  let list = render();
  expect(list.type).toBe("InputSectionList");
  expect(list.props).toMatchObject({
    stickySectionHeadersEnabled: true,
    initialNumToRender: 8,
    maxToRenderPerBatch: 6,
    windowSize: 7,
    keyboardShouldPersistTaps: "handled",
  });
  expect(list.props.sections[0].data).toBe(window.items);
  const controls = list.props.renderSectionHeader();
  expect(controls.children[0].props).toMatchObject({ value: "Chess", onChange: filter.setQuery });
  expect(controls.children[0].props.onFocus).toBeUndefined();
  expect(list.props.onLayout).toBeUndefined();
  expect(list.props.onContentSizeChange).toBeUndefined();
  expect(source).not.toContain("Keyboard.addListener");
  expect(source).not.toContain("useHeaderHeight");
  expect(source).not.toContain("ProfileBggAttribution");
  window.items = [{ id: 1 }];
  window.hasMore = true;
  list = render();
  expect(list.props.sections[0].data).toBe(window.items);
  list.props.onScrollBeginDrag();
  list.props.onEndReached();
  list.props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } });
  expect(window.beginScroll).toHaveBeenCalledOnce();
  expect(window.endReached).toHaveBeenCalledOnce();
  expect(window.loadMore).toHaveBeenCalledOnce();
  expect(list.props.accessibilityActions).toEqual([
    { name: "increment", label: "Load more games" },
  ]);
  expect(filter.query).toBe("Chess");
});
