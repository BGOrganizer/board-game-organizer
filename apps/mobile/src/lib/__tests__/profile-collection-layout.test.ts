import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute layout/focus callbacks only; no native keyboard or frame-timing acceptance.
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
  (n) => ts.isFunctionDeclaration(n) && n.name?.text === "ProfileCollection",
);
if (!decl) throw Error("Missing Collection");
const code = ts.transpileModule(
  decl.getText(file).replace("export ", "") + ";ProfileCollection(props);",
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;
it("preserves scroll range for empty/few results and pins focused search across keyboard/content layout changes", () => {
  const states: number[] = [],
    refs: { current: any }[] = [];
  let si = 0,
    ri = 0;
  const scrollTo = vi.fn(),
    rows = { items: [] as unknown[], hasMore: false },
    filter = {
      query: "Chess",
      search: "Chess",
      types: "all",
      selected: ["games", "expansions"],
      setQuery: vi.fn(),
      toggle: vi.fn(),
    };
  const c: any = {
    props: { snapshot: "snapshot", subjectId: "owner", header: "Profile" },
    React: {
      createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
        type,
        props,
        children,
      }),
    },
    useT: () => (s: string) => s,
    useLingui: () => ({ i18n: { locale: "en" } }),
    useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "owner" }),
    useSafeAreaInsets: () => ({ bottom: 0 }),
    useHeaderHeight: () => 64,
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
    useGameListWindow: () => rows,
    noExclusions: new Set(),
    useMemo: (f: () => unknown) => f(),
    useCallback: (f: unknown) => f,
    useRef: (initial: unknown) => {
      const index = ri++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useState: (initial: number) => {
      const i = si++;
      states[i] ??= initial;
      return [states[i], (n: number) => (states[i] = n)];
    },
    Platform: { OS: "android" },
    GAME_PICKER_CHUNK_SIZE: 8,
    key: (i: { id: number }) => String(i.id),
  };
  for (const name of [
    "KeyboardAvoidingView",
    "SectionList",
    "View",
    "Skeleton",
    "ProfileStats",
    "SearchInput",
    "FilterChips",
    "Typography",
    "Button",
    "ProfileBggAttribution",
    "CollectionRow",
    "GameGap",
    "Gamepad2",
    "Heart",
    "Puzzle",
    "UsersRound",
  ])
    c[name] = name;
  const render = () => {
    si = ri = 0;
    return runInNewContext(code, c).children[0];
  };
  let list = render();
  list.props.ref.current = { getScrollResponder: () => ({ scrollTo }) };
  list.props.ListHeaderComponent.props.onLayout({ nativeEvent: { layout: { height: 300 } } });
  list.props.onLayout({ nativeEvent: { layout: { height: 600 } } });
  list = render();
  expect(list.props.contentContainerStyle.minHeight).toBe(920);
  const controls = list.props.renderSectionHeader();
  controls.children[0].props.onFocus();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 320, animated: false });
  rows.items = [{ id: 1 }];
  list.props.onLayout({ nativeEvent: { layout: { height: 300 } } });
  list = render();
  expect(list.props.contentContainerStyle.minHeight).toBe(620);
  scrollTo.mockClear();
  list.props.onContentSizeChange();
  expect(scrollTo).toHaveBeenCalledOnce();
  expect(list.props.stickySectionHeadersEnabled).toBe(true);
  expect(list.props.ItemSeparatorComponent).toBe("GameGap");
  controls.children[0].props.onBlur();
  scrollTo.mockClear();
  list.props.onContentSizeChange();
  expect(scrollTo).not.toHaveBeenCalled();
  expect(filter.query).toBe("Chess");
});
