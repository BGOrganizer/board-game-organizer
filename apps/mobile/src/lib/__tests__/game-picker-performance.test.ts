import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import type { BggPickerItem } from "@board-game-organizer/schemas";
import { bggPickerQuery } from "@board-game-organizer/shared";
import { hashKey } from "@tanstack/react-query";
import { memo } from "react";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { GAME_PICKER_CHUNK_SIZE, gamePickerWindow } from "../games/gamePickerWindow";

// Execute real application derivation/callbacks without loading RN Flow modules.
// These checks do not measure native frame time, image decoding or touch rendering.
const source = readFileSync(
  new URL("../../components/games/GamePicker.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "GamePicker.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declaration = file.statements.find(
  (n) => ts.isFunctionDeclaration(n) && n.name?.text === "GamePicker",
);
if (!declaration) throw new Error("GamePicker missing");
const code = ts.transpileModule(
  `${declaration.getText(file).replace(/^export default /, "")}; GamePicker(props);`,
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;
type Node = { type: unknown; props: Record<string, any>; children: unknown[] };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("type" in value)) return [];
  const node = value as Node;
  return [node, ...node.children.flatMap(nodes)];
}
const game = (id: number): BggPickerItem => ({
  id,
  name: `Game ${id}`,
  year: null,
  imageUrl: null,
  source: "collection",
});
const page = (index: number) => ({
  items: Array.from({ length: 25 }, (_, i) => game(index * 25 + i)),
  nextCursor: `cursor-${index}`,
});
type MemoSlot = { value: unknown; deps: unknown[] };
function harness(pageCount = 3) {
  const states: unknown[] = [],
    refs: { current: unknown }[] = [],
    memos: MemoSlot[] = [],
    callbacks: MemoSlot[] = [];
  let stateIndex = 0,
    refIndex = 0,
    memoIndex = 0,
    callbackIndex = 0,
    changed = false;
  let timer: (() => void) | undefined;
  const auth = {
    getToken: async () => "fixture",
    isLoaded: true,
    isSignedIn: true,
    userId: "owner",
  };
  const account = {
    account: { data: { active: { snapshot: "snapshot-one" } }, isError: false, refetch: vi.fn() },
  };
  const picker = {
    data: { pages: Array.from({ length: pageCount }, (_, i) => page(i)) },
    isFetching: false,
    isError: false,
    isPending: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(async () => undefined),
    refetch: vi.fn(),
  };
  const props: {
    excludeIds?: number[];
    onSelect?: (game: BggPickerItem) => void;
    onClose?: () => void;
  } = { onSelect: vi.fn() };
  const router = { back: vi.fn() },
    pending = vi.fn(),
    Button = { Label: "ButtonLabel" };
  const same = (a: unknown[], b: unknown[]) =>
    a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (values: MemoSlot[], index: number, factory: () => unknown, deps: unknown[]) => {
    if (!values[index] || !same(values[index].deps, deps))
      values[index] = { value: factory(), deps };
    return values[index].value;
  };
  const context = {
    props,
    React: {
      createElement: (
        type: unknown,
        attributes: Record<string, unknown>,
        ...children: unknown[]
      ) => ({ type, props: attributes ?? {}, children }),
    },
    useSessionAuth: () => auth,
    useT: () => (text: string) => text,
    useThemeColor: () => ["muted-token", "accent-foreground-token"],
    useRouter: () => router,
    useLocalSearchParams: () => ({ slotId: "slot" }),
    useAppStore: (select: (value: unknown) => unknown) => select({ setPendingGame: pending }),
    apiUrl: () => "https://api.test",
    useBggAccount: () => account,
    useBggPicker: () => picker,
    bggPickerQuery,
    hashKey,
    gamePickerWindow,
    GAME_PICKER_CHUNK_SIZE,
    useState: (initial: unknown) => {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (next: unknown) => {
          const value = typeof next === "function" ? next(states[i]) : next;
          if (!Object.is(value, states[i])) {
            states[i] = value;
            changed = true;
          }
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = refIndex++;
      refs[i] ??= { current: initial };
      return refs[i];
    },
    useMemo: (factory: () => unknown, deps: unknown[]) => memo(memos, memoIndex++, factory, deps),
    useCallback: (callback: unknown, deps: unknown[]) =>
      memo(callbacks, callbackIndex++, () => callback, deps),
    useEffect: (effect: () => void) => effect(),
    setTimeout: (callback: () => void, delay: number) => {
      expect(delay).toBe(300);
      timer = callback;
      return 1;
    },
    clearTimeout: vi.fn(),
    gameKey: (item: BggPickerItem) => String(item.id),
    GamePickerRow: "GamePickerRow",
    FlatList: "FlatList",
    View: "View",
    Stack: { Screen: "Screen" },
    Button,
    Typography: "Typography",
    Skeleton: "Skeleton",
    HeaderBackButton: "HeaderBackButton",
    SearchHelpLabel: "SearchHelpLabel",
    SearchInput: "SearchInput",
    FilterChips: "FilterChips",
    EmptyList: "EmptyList",
    Gamepad2: "Gamepad2",
    Search: "Search",
    LibraryBig: "LibraryBig",
  };
  const render = (): Node => {
    for (let i = 0; i < 5; i++) {
      stateIndex = refIndex = memoIndex = callbackIndex = 0;
      changed = false;
      const node = runInNewContext(code, context) as Node;
      if (!changed) return node;
    }
    throw new Error("Picker render did not settle");
  };
  return {
    picker,
    props,
    auth,
    account,
    router,
    pending,
    Button,
    render,
    scroll: () => {
      const list = render();
      list.props.onScrollBeginDrag();
      list.props.onEndReached();
      return render();
    },
    debounce: () => timer?.(),
  };
}
it("memoizes the actual identity/action row while retaining artwork, metadata and its labeled 44px action", () => {
  const rowDeclaration = file.statements.find(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some((d) => d.name.getText(file) === "GamePickerRow"),
  );
  if (!rowDeclaration) throw new Error("GamePickerRow missing");
  const rowCode = ts.transpileModule(`${rowDeclaration.getText(file)}; GamePickerRow;`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const row = runInNewContext(rowCode, {
    memo,
    React: {
      createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
        type,
        props,
        children,
      }),
    },
    GroupedList: "GroupedList",
    GameListRow: "GameListRow",
    Button: "Button",
    Plus: "Plus",
  });
  expect(row.$$typeof).toBe(Symbol.for("react.memo"));
  const item = {
      ...game(1),
      imageUrl: "https://image.test/game.png",
      year: 2020,
      average: 7.1,
      rank: 10,
    },
    onSelect = vi.fn();
  const tree = row.type({
    item,
    onSelect,
    selectLabel: "Select",
    accentForeground: "accent-foreground-token",
  }) as Node;
  const identity = tree.children[0] as Node;
  expect(identity.props).toMatchObject({
    name: item.name,
    imageUrl: item.imageUrl,
    year: item.year,
    average: item.average,
    rank: item.rank,
  });
  expect(identity.props.actions.props).toMatchObject({
    accessibilityLabel: "Select: Game 1",
    style: { minWidth: 44, minHeight: 44 },
  });
  identity.props.actions.props.onPress();
  expect(onSelect).toHaveBeenCalledWith(item);
});
it("requires owned native fixtures and escapes real game names rather than treating them as selectors", () => {
  const script = readFileSync(
    new URL("../../../.maestro/helpers/game-picker-inputs.js", import.meta.url),
    "utf8",
  );
  const base = {
    PICKER_LOCALE: "en",
    PICKER_BUILD_ACK: "owned-development-preview-build",
    PICKER_FIXTURE_ACK: "owned-planning-event-linked-collection",
    PICKER_EVENT_ID: "11111111-1111-4111-8111-111111111111",
    PICKER_EVENT_NAME: "Event [owned]",
    PICKER_FIRST_GAME: "First [game]",
    PICKER_LATER_GAME: "Later (game)",
  };
  const run = (overrides: Partial<Record<keyof typeof base, string>> = {}) => {
    const context = { ...base, ...overrides, output: { picker: {} as Record<string, string> } };
    runInNewContext(script, context);
    return context.output.picker;
  };
  for (const locale of ["en", "it"]) {
    const result = run({ PICKER_LOCALE: locale });
    expect(new RegExp(result.first).test(base.PICKER_FIRST_GAME)).toBe(true);
    expect(new RegExp(result.first).test("First game")).toBe(false);
    expect(new RegExp(result.later).test(base.PICKER_LATER_GAME)).toBe(true);
    expect(new RegExp(result.tables).test(locale === "en" ? "2. Tables" : "2. Tavoli")).toBe(true);
  }
  for (const invalid of [
    { PICKER_LOCALE: "xx" },
    { PICKER_BUILD_ACK: "production" },
    { PICKER_FIXTURE_ACK: "" },
    { PICKER_EVENT_ID: "bad" },
    { PICKER_FIRST_GAME: "" },
    { PICKER_LATER_GAME: base.PICKER_FIRST_GAME },
  ])
    expect(() => run(invalid)).toThrow();
});
it.each([1, 10, 40])(
  "opens/reopens with eight cached games and never expands before user intent: %s pages",
  (pages) => {
    const h = harness(pages),
      first = h.render();
    h.picker.hasNextPage = true;
    expect(first.props.data).toHaveLength(8);
    expect(first.props).toMatchObject({
      initialNumToRender: 8,
      maxToRenderPerBatch: 6,
      windowSize: 7,
    });
    first.props.onEndReached();
    first.props.onEndReached();
    expect(h.render().props.data).toHaveLength(8);
    expect(h.picker.fetchNextPage).not.toHaveBeenCalled();
    first.props.onScrollBeginDrag();
    first.props.onEndReached();
    first.props.onEndReached();
    expect(h.render().props.data).toHaveLength(16);
    expect(h.picker.data.pages).toHaveLength(pages);
    expect(h.picker.fetchNextPage).not.toHaveBeenCalled();
    expect(harness(pages).render().props.data).toHaveLength(8);
  },
);
it("offers an accessible explicit footer when a tall viewport cannot scroll, without automatic growth", () => {
  const h = harness(2),
    first = h.render();
  const more = nodes(first.props.ListFooterComponent).find((n) => n.type === h.Button);
  expect(more).toBeDefined();
  expect(nodes(more).some((n) => n.children.includes("Load more games"))).toBe(true);
  more?.props.onPress();
  more?.props.onPress();
  const next = h.render();
  expect(next.props.data).toHaveLength(16);
  next.props.onEndReached();
  expect(h.render().props.data).toHaveLength(16);
  expect(h.picker.fetchNextPage).not.toHaveBeenCalled();
});
it("keeps the new footer's end, background/error and next-page loading states observable", () => {
  const h = harness(1);
  for (let chunk = 1; chunk < 4; chunk++) h.scroll();
  expect(h.render().props.ListFooterComponent).toBeNull();
  h.picker.hasNextPage = true;
  for (const state of ["background", "error"]) {
    h.picker.isFetching = state === "background";
    h.picker.isError = state === "error";
    const footer = h.render().props.ListFooterComponent;
    expect(footer.type).toBe(h.Button);
    expect(footer.props.isDisabled).toBe(true);
    footer.props.onPress();
    expect(h.picker.fetchNextPage).not.toHaveBeenCalled();
  }
  h.picker.isFetching = h.picker.isError = false;
  const ready = h.render().props.ListFooterComponent;
  expect(ready.props.isDisabled).toBe(false);
  ready.props.onPress();
  expect(h.picker.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  h.picker.isFetching = h.picker.isFetchingNextPage = true;
  const pending = h.render();
  expect(pending.props.data).toHaveLength(25);
  expect(pending.props.ListFooterComponent.type).toBe("Skeleton");
});
it("reveals cached pages first, then exposes a newly fetched page without needing another scroll event", () => {
  const h = harness(2);
  h.picker.hasNextPage = true;
  for (let chunk = 1; chunk < 8; chunk++) h.scroll();
  const second = h.render();
  expect(second.props.data).toHaveLength(50);
  second.props.onEndReached();
  second.props.onEndReached();
  expect(h.picker.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  h.picker.isFetching = h.picker.isFetchingNextPage = true;
  const pending = h.render();
  pending.props.onEndReached();
  const calls = h.picker.fetchNextPage.mock.calls.length;
  pending.props.onEndReached();
  expect(h.picker.fetchNextPage).toHaveBeenCalledTimes(calls);
  h.picker.data = { pages: [...h.picker.data.pages, page(2)] };
  h.picker.isFetching = h.picker.isFetchingNextPage = false;
  expect(h.render().props.data).toHaveLength(58);
  expect(h.picker.data.pages).toHaveLength(3);
});
it.each(["background", "error", "end"])("does not start automatic requests during %s", (kind) => {
  const h = harness(1);
  h.picker.hasNextPage = kind !== "end";
  h.picker.isFetching = kind === "background";
  h.picker.isError = kind === "error";
  for (let chunk = 0; chunk < 4; chunk++) h.scroll();
  expect(h.render().props.data).toHaveLength(25);
  expect(h.picker.fetchNextPage).not.toHaveBeenCalled();
});
it("keeps cached rows available during errors and retries only on the explicit action", () => {
  const h = harness(3);
  h.picker.isError = true;
  const list = h.render();
  expect(list.props.data).toHaveLength(8);
  list.props.onScrollBeginDrag();
  list.props.onEndReached();
  expect(h.render().props.data).toHaveLength(16);
  const retry = nodes(list.props.ListHeaderComponent).find(
    (n) =>
      n.type === h.Button &&
      nodes(n).some((child) => child.children.includes("Search failed. Retry")),
  );
  expect(retry).toBeDefined();
  retry?.props.onPress();
  expect(h.account.account.refetch).toHaveBeenCalledOnce();
  expect(h.picker.refetch).toHaveBeenCalledOnce();
});
it("does not present an excluded first page as empty and offers a path through further pages", () => {
  const h = harness(2);
  h.props.excludeIds = page(0).items.map((i) => i.id);
  const first = h.render();
  expect(first.props.data).toHaveLength(0);
  expect(nodes(first.props.ListHeaderComponent).some((n) => n.type === "EmptyList")).toBe(false);
  const more = nodes(first.props.ListHeaderComponent).find(
    (n) => n.type === h.Button && nodes(n).some((c) => c.children.includes("Load more games")),
  );
  expect(more).toBeDefined();
  for (let chunk = 1; chunk < 5; chunk++) {
    const button = nodes(h.render().props.ListHeaderComponent).find((n) => n.type === h.Button);
    expect(button).toBeDefined();
    button?.props.onPress();
  }
  expect(h.render().props.data[0].id).toBe(25);
  h.props.excludeIds = [...page(0).items, ...page(1).items].map((i) => i.id);
  for (let chunk = 5; chunk < 8; chunk++) {
    const button = nodes(h.render().props.ListHeaderComponent).find((n) => n.type === h.Button);
    expect(button).toBeDefined();
    button?.props.onPress();
  }
  expect(nodes(h.render().props.ListHeaderComponent).some((n) => n.type === "EmptyList")).toBe(
    true,
  );
});
it.each(["snapshot", "owner", "filter", "search"])(
  "resets the visible budget and scroll key for %s changes, rejecting late callbacks",
  (kind) => {
    const h = harness(3),
      first = h.render();
    first.props.onScrollBeginDrag();
    first.props.onEndReached();
    expect(h.render().props.data).toHaveLength(16);
    const oldSelect = first.props.renderItem({ item: page(0).items[0] }).props.onSelect;
    if (kind === "snapshot") h.account.account.data.active.snapshot = "snapshot-two";
    if (kind === "owner") h.auth.userId = "other-owner";
    if (kind === "filter")
      nodes(first.props.ListHeaderComponent)
        .find((n) => n.type === "FilterChips")
        ?.props.onToggle("search");
    if (kind === "search") {
      nodes(first.props.ListHeaderComponent)
        .find((n) => n.type === "SearchInput")
        ?.props.onChange("casc");
      h.render();
      h.debounce();
    }
    const current = h.render();
    expect(current.props.data).toHaveLength(8);
    expect(current.props.key).not.toBe(first.props.key);
    first.props.onScrollBeginDrag();
    first.props.onEndReached();
    current.props.onEndReached();
    oldSelect(page(0).items[0]);
    expect(h.render().props.data).toHaveLength(8);
    expect(h.picker.fetchNextPage).not.toHaveBeenCalled();
    expect(h.props.onSelect).not.toHaveBeenCalled();
    if (kind === "snapshot") {
      h.account.account.data.active.snapshot = "snapshot-one";
      expect(h.render().props.data).toHaveLength(8);
    }
  },
);
it("keeps data/render/select references stable during input typing and guards duplicate selection", () => {
  const h = harness(2),
    first = h.render();
  nodes(first.props.ListHeaderComponent)
    .find((n) => n.type === "SearchInput")
    ?.props.onChange("c");
  h.props.excludeIds = [];
  const next = h.render();
  expect(next.props.data).toBe(first.props.data);
  expect(next.props.renderItem).toBe(first.props.renderItem);
  expect(next.props.onScrollBeginDrag).toBe(first.props.onScrollBeginDrag);
  expect(next.props.onEndReached).toBe(first.props.onEndReached);
  const row = next.props.renderItem({ item: page(0).items[0] });
  row.props.onSelect(page(0).items[0]);
  row.props.onSelect(page(0).items[1]);
  expect(h.props.onSelect).toHaveBeenCalledOnce();
  expect(h.router.back).not.toHaveBeenCalled();
});
