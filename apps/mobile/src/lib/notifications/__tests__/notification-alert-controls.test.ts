import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === "object" && "props" in value
    ? [value, ...nodes(value.props.children)]
    : [];
}
function harness(overrides: Record<string, unknown> = {}) {
  const model = {
    changes: [
      {
        notificationId: "a",
        messageCode: "information",
        title: "Source notification",
        description: "Original actor: Café",
        requiresResponse: false,
      },
    ],
    tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
    isPending: false,
    isError: false,
    readError: null,
    isReading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    markAllAsRead: vi.fn(async () => {}),
    markDisplayedAsRead: vi.fn(),
    fetchNextPage: vi.fn(async () => {}),
    refetch: vi.fn(async () => {}),
    resetWindow: vi.fn(),
    ...overrides,
  };
  const values: unknown[] = [];
  let cursor = 0;
  const effects: (() => void)[] = [];
  const dimensions = { width: 400, height: 700 };
  const modules: Record<string, unknown> = {
    react: {
      memo: (fn: unknown) => fn,
      useCallback: (fn: unknown) => fn,
      useState: (initial: unknown) => {
        const i = cursor++;
        if (!(i in values)) values[i] = initial;
        return [
          values[i],
          (value: unknown) => {
            values[i] = value;
          },
        ];
      },
      useEffect: (fn: () => void) => effects.push(fn),
    },
    "react-native": { FlatList: "FlatList", View: "View", useWindowDimensions: () => dimensions },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
    },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/hooks": { useThemeColor: (tokens: string[]) => tokens },
    "heroui-native/popover": { Popover: { Title: "Title" } },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": { Bell: "Bell", CheckCheck: "CheckCheck", RotateCcw: "RotateCcw" },
    "@/components/common/ui/HelpPopover": { HelpPopover: "HelpPopover" },
    "@/components/common/ui/NotificationUnreadDot": { NotificationUnreadDot: "UnreadDot" },
    "@/lib/i18n": { useT: () => (message: string) => message },
  };
  const out: Record<string, (props: unknown) => Element> = {};
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const source = readFileSync(
    new URL("../../../components/notifications/NotificationChangesPopover.tsx", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports: out,
      require: (id: string) => {
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (!(id in modules)) throw Error(id);
        return modules[id];
      },
    },
  );
  const render = () => {
    cursor = 0;
    effects.length = 0;
    return out.NotificationChangesPopover({ model });
  };
  const find = (tree: Element, type: string) => {
    const node = nodes(tree).find((node) => node.type === type);
    if (!node) throw Error(type);
    return node;
  };
  const open = () => {
    render().props.onOpenChange(true);
    return render();
  };
  return { model, dimensions, render, open, find, effects };
}

it("uses a warning card control with an internal danger dot and one explicit resource read action", () => {
  const h = harness(),
    initial = h.render();
  expect(initial.props).toMatchObject({
    icon: "Bell",
    tone: "warning",
    size: "compact",
    align: "end",
  });
  expect(initial.props.indicator.props.style).toEqual({ position: "absolute", top: 0, right: 0 });
  expect(nodes(initial).some((node) => node.type === "FlatList")).toBe(false);
  const tree = h.open(),
    button = h.find(tree, "Button");
  expect(button.props).toMatchObject({
    variant: "danger-soft",
    size: "sm",
    accessibilityLabel: "Mark all changes as read",
    isDisabled: false,
    style: { minWidth: 44, minHeight: 44 },
  });
  expect(nodes(button).find((node) => node.type === "CheckCheck")?.props).toMatchObject({
    size: 20,
    color: "danger-soft-foreground",
    accessible: false,
  });
  expect(h.model.markAllAsRead).not.toHaveBeenCalled();
  button.props.onPress();
  expect(h.model.markAllAsRead).toHaveBeenCalledOnce();
  expect(h.model.markDisplayedAsRead).not.toHaveBeenCalled();
  tree.props.onOpenChange(false);
  expect(h.model.resetWindow).toHaveBeenCalledTimes(2);
});
it("keeps the empty warning trigger, skeleton/error states and protected invitation-only selections", () => {
  const empty = harness({ changes: [] });
  const e = empty.open();
  expect(e.props.indicator).toBeUndefined();
  expect(empty.find(e, "FlatList").props.ListEmptyComponent.props.children).toBe("No new changes");
  for (const state of [
    { isPending: true },
    { isReading: true },
    { changes: [{ notificationId: "a", messageCode: "invitation", requiresResponse: true }] },
  ]) {
    const h = harness(state),
      tree = h.open(),
      button = h.find(tree, "Button");
    expect(button.props.isDisabled).toBe(true);
    button.props.onPress();
    expect(h.model.markAllAsRead).not.toHaveBeenCalled();
  }
  const pending = harness({ isPending: true, changes: [] });
  expect(pending.find(pending.open(), "FlatList").props.ListEmptyComponent.type).toBe("Skeleton");
  const offPage = harness({
    changes: [{ notificationId: "a", messageCode: "invitation", requiresResponse: true }],
    hasNextPage: true,
  });
  expect(offPage.find(offPage.open(), "Button").props.isDisabled).toBe(false);
});
it("grows to the actual viewport and scrolls only when its measured content no longer fits", () => {
  const h = harness(),
    tree = h.open();
  expect(tree.props.contentStyle).toMatchObject({
    minWidth: 260,
    minHeight: 96,
    maxWidth: 376,
    maxHeight: 636,
  });
  let list = h.find(tree, "FlatList");
  expect(list.props).toMatchObject({
    initialNumToRender: 8,
    maxToRenderPerBatch: 8,
    windowSize: 5,
    scrollEnabled: false,
    showsVerticalScrollIndicator: false,
  });
  expect(list.props.style.maxHeight).toBe(560);
  list.props.onContentSizeChange(300, 500);
  list = h.find(h.render(), "FlatList");
  expect(list.props.scrollEnabled).toBe(false);
  list.props.onContentSizeChange(300, 900);
  list = h.find(h.render(), "FlatList");
  expect(list.props.scrollEnabled).toBe(true);
  expect(list.props.showsVerticalScrollIndicator).toBe(true);
  nodes(h.render())
    .find((node) => node.props.onLayout)
    ?.props.onLayout({ nativeEvent: { layout: { height: 64 } } });
  expect(h.find(h.render(), "FlatList").props.style.maxHeight).toBe(540);
  h.dimensions.width = 200;
  h.dimensions.height = 150;
  expect(h.render().props.contentStyle).toMatchObject({
    minWidth: 176,
    minHeight: 86,
    maxHeight: 86,
  });
});
it("loads progressively only while open and not fetching/failed, with a stable row key", () => {
  const h = harness({ hasNextPage: true });
  h.render();
  for (const effect of h.effects) effect();
  expect(h.model.fetchNextPage).not.toHaveBeenCalled();
  const list = h.find(h.open(), "FlatList");
  for (const effect of h.effects) effect();
  expect(h.model.fetchNextPage).toHaveBeenCalledOnce();
  list.props.onEndReached();
  expect(h.model.fetchNextPage).toHaveBeenCalledTimes(2);
  expect(list.props.keyExtractor({ notificationId: "a" })).toBe("a:generic");
  expect(list.props.keyExtractor({ notificationId: "a", itemId: "point" })).toBe("a:point");
  for (const state of [
    { isFetchingNextPage: true },
    { isFetchNextPageError: true },
    { isError: true },
  ]) {
    const guarded = harness({ hasNextPage: true, ...state });
    guarded.find(guarded.open(), "FlatList").props.onEndReached();
    expect(guarded.model.fetchNextPage).not.toHaveBeenCalled();
  }
});
it.each(["query", "next", "read"])(
  "shows cached rows and retries the correct %s operation",
  (type) => {
    const h = harness({
      isError: type !== "read",
      isFetchNextPageError: type === "next",
      readError: type === "read" ? Error("failed") : null,
    });
    const list = h.find(h.open(), "FlatList");
    expect(list.props.data).toHaveLength(1);
    const retry = nodes(list.props.ListFooterComponent).find(
      (node) => node.props.accessibilityLabel === "Try again",
    );
    expect(retry).toBeTruthy();
    retry?.props.onPress();
    expect(
      type === "query"
        ? h.model.refetch
        : type === "next"
          ? h.model.fetchNextPage
          : h.model.markAllAsRead,
    ).toHaveBeenCalledOnce();
  },
);
it("formats row categories/current labels and invitation hints without making row taps read", () => {
  const h = harness({
    changes: [{ notificationId: "a", messageCode: "invitation", requiresResponse: true }],
    isFetchingNextPage: true,
  });
  const list = h.find(h.open(), "FlatList");
  expect(
    nodes(list.props.ListFooterComponent).some(
      (node) => node.props.children === "Invitations remain unread until you respond.",
    ),
  ).toBe(true);
  expect(nodes(list.props.ListFooterComponent).some((node) => node.type === "Skeleton")).toBe(true);
  for (const row of [
    {
      messageCode: "date",
      title: "Date updated",
      description: "alex: Café and games",
      requiresResponse: false,
    },
    {
      messageCode: "event_confirmed",
      title: "Evento confermato",
      description: "alex: Café e società",
      requiresResponse: false,
    },
    {
      messageCode: "invitation",
      title: "Invito a un tavolo",
      description: "alex: Serata del giovedì",
      requiresResponse: true,
    },
  ]) {
    const element = list.props.renderItem({ item: row });
    const content = element.type(element.props);
    expect(
      nodes(content)
        .filter((node) => node.type === "Typography")
        .map((node) => node.props.children),
    ).toEqual([row.title, row.description]);
  }
  expect(h.model.markAllAsRead).not.toHaveBeenCalled();
});
