import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; key?: unknown; props: Record<string, any> };
const nodes = (value: unknown): Element[] => {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [
    element,
    ...Object.values(element.props).flatMap((prop) =>
      prop && typeof prop === "object" && (Array.isArray(prop) || "props" in prop)
        ? nodes(prop)
        : [],
    ),
  ];
};
function harness(name: "EventDetail" | "EventTable") {
  const options = { apiUrl: "https://owned-preview.test", userId: "owner", enabled: true };
  const event = {
    id: "event",
    name: "Owned event",
    dates: [],
    locations: [],
    groupType: "PRIVATE",
    status: "PLANNING",
    readOnly: false,
    personalAccessOnly: false,
    sharedResultsOnly: false,
  };
  const table = {
    id: "table",
    eventId: "event",
    name: "Owned table",
    eventStatus: "CONFIRMED",
    sharedResultsOnly: false,
    readOnly: false,
  };
  const query = {
    data: event as typeof event | undefined,
    isPending: false,
    isError: false,
    isPlaceholderData: false,
    error: null,
    refetch: vi.fn(),
  };
  const tableQuery = { ...query, data: table as typeof table | undefined };
  const tables = {
    items: [{ id: "retained-table" }],
    hasNextPage: true,
    isFetching: false,
    isFetchNextPageError: false,
    isError: false,
    isPending: false,
    isFetchingNextPage: false,
    error: null,
    fetchNextPage: vi.fn(),
    resetPresentation: vi.fn(),
    refetch: vi.fn(),
  };
  const changes = vi.fn(() => ({ tabCounts: { details: 0, participants: 0, tables: 0 } }));
  const hooks: Array<{ value?: unknown; current?: unknown }> = [];
  let cursor = 0;
  const jsx = (type: any, props: Record<string, unknown>, key?: unknown): Element => ({
    key,
    type: type?.kind ?? type,
    props,
  });
  const modules: Record<string, any> = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    react: {
      useState: (initial: unknown) => {
        const index = cursor++;
        hooks[index] ??= { value: typeof initial === "function" ? initial() : initial };
        return [
          hooks[index].value,
          (next: unknown) => {
            hooks[index].value = typeof next === "function" ? next(hooks[index].value) : next;
          },
        ];
      },
      useRef: (initial: unknown) => {
        const index = cursor++;
        hooks[index] ??= { current: initial };
        return hooks[index];
      },
      useCallback: (callback: unknown) => callback,
    },
    "react-native": { View: "View", FlatList: "FlatList" },
    "heroui-native/tabs": { Tabs: { kind: "Tabs", Label: "TabsLabel" } },
    "heroui-native/button": { Button: { kind: "Button", Label: "ButtonLabel" } },
    "@lingui/react": { useLingui: () => ({ i18n: { locale: "en" } }) },
    "expo-router": {
      Stack: { Screen: "Screen" },
      useRouter: () => ({ push: vi.fn() }),
      useLocalSearchParams: () => ({}),
    },
    "heroui-native/hooks": { useThemeColor: () => "semantic" },
    "@/lib/useCommunityApi": { useCommunityApi: () => options },
    "@/lib/useFloatingActionLayout": { useFloatingActionLayout: () => ({ paddingBottom: 48 }) },
    "@/lib/i18n": { useT: () => (text: string) => text },
    "@/components/common/ui/ScrollTargetContext": {
      ScrollTargetContext: { Provider: "ScrollProvider" },
    },
    "@board-game-organizer/schemas": { notificationItemId: () => "owned-item" },
    "@board-game-organizer/shared": {
      canManageEvent: () => false,
      communityAccessDenied: () => false,
      eventItemTargets: () => [],
      tableItemTargets: () => [],
      eventOptionsRequireVote: () => false,
      useEventRecord: () => query,
      useRecordTable: () => tableQuery,
      useRecordTables: () => tables,
      useEventRecordActions: () => ({
        busy: false,
        blocking: false,
        transition: { mutate: vi.fn() },
      }),
      useNotificationChanges: changes,
    },
  };
  const output: Record<string, (props: Record<string, string>) => Element> = {};
  const source = readFileSync(
    new URL(`../../components/events/${name}.tsx`, import.meta.url),
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
      exports: output,
      require: (id: string) => modules[id] ?? new Proxy({}, { get: (_, key) => String(key) }),
    },
  );
  const render = () => {
    cursor = 0;
    return output[name]({ eventId: "event", tableId: "table" });
  };
  const panels = (tree: Element) => nodes(tree).filter((node) => node.type === "RetainedTabPanel");
  const change = (tree: Element, value: string) => {
    const tabs = nodes(tree).find((node) => node.type === "Tabs");
    if (!tabs) throw Error("Tabs root missing");
    tabs.props.onValueChange(value);
  };
  return { options, event, table, query, tableQuery, tables, changes, render, panels, change };
}

it("retains separate event tables data and headers while switching to details", () => {
  const h = harness("EventDetail");
  let tree = h.render();
  let panels = h.panels(tree);
  expect(panels).toHaveLength(3);
  expect(panels.map((panel) => panel.props.active)).toEqual([true, false, false]);
  expect(panels.map((panel) => panel.key)).toEqual(
    ["details", "participants", "tables"].map((panel) =>
      JSON.stringify([h.options.apiUrl, h.options.userId, "event", panel]),
    ),
  );
  const lists = panels
    .flatMap((panel) => nodes(panel.props.children))
    .filter((node) => node.type === "FlatList");
  expect(lists).toHaveLength(2);
  expect(lists[0].props.data).toEqual([]);
  expect(lists[1].props.data).toBe(h.tables.items);
  for (const list of lists) {
    expect(
      nodes(list.props.ListHeaderComponent).some((node) => node.type === "EventDetailsCard"),
    ).toBe(true);
    expect(nodes(list.props.ListHeaderComponent).some((node) => node.type === "Tabs")).toBe(true);
  }
  h.change(tree, "tables");
  tree = h.render();
  h.change(tree, "details");
  tree = h.render();
  panels = h.panels(tree);
  expect(panels.map((panel) => panel.props.active)).toEqual([true, false, false]);
  expect(nodes(panels[2]).find((node) => node.type === "FlatList")?.props.data).toBe(
    h.tables.items,
  );
  expect(h.changes).toHaveBeenCalledTimes(3); // One notification model per controller render.
});

it("rejects stale hidden event paging and keeps each flat-list ref owned by its panel", () => {
  const h = harness("EventDetail");
  let tree = h.render();
  const lists = h
    .panels(tree)
    .flatMap((panel) => nodes(panel.props.children))
    .filter((node) => node.type === "FlatList");
  const details = lists[0],
    tables = lists[1];
  const detailScroll = { scrollTo: vi.fn() },
    tableScroll = { scrollTo: vi.fn() };
  details.props.ref({ getNativeScrollRef: () => detailScroll });
  tables.props.ref({ getNativeScrollRef: () => tableScroll });
  tables.props.onEndReached();
  expect(h.tables.fetchNextPage).not.toHaveBeenCalled();
  h.change(tree, "tables");
  tree = h.render();
  expect(detailScroll.scrollTo).toHaveBeenCalledOnce();
  details.props.ref(null); // Hidden details must not clear the active tables target.
  details.props.onEndReached();
  expect(h.tables.fetchNextPage).not.toHaveBeenCalled();
  tables.props.onEndReached();
  expect(h.tables.fetchNextPage).toHaveBeenCalledOnce();
  for (const flag of ["isFetching", "isFetchNextPageError"] as const) {
    h.tables[flag] = true;
    tables.props.onEndReached();
    h.tables[flag] = false;
  }
  h.tables.hasNextPage = false;
  tables.props.onEndReached();
  h.tables.hasNextPage = true;
  expect(h.tables.fetchNextPage).toHaveBeenCalledOnce();
  h.change(tree, "participants");
  h.render();
  expect(tableScroll.scrollTo).toHaveBeenCalledOnce();
  tables.props.onEndReached();
  expect(h.tables.fetchNextPage).toHaveBeenCalledOnce();
});

it("evicts unavailable participant panels and preserves readonly event messaging and scope keys", () => {
  const h = harness("EventDetail");
  let tree = h.render();
  h.change(tree, "participants");
  h.event.readOnly = true;
  tree = h.render();
  expect(nodes(h.panels(tree)[1]).some((node) => node.type === "EventParticipants")).toBe(false);
  expect(nodes(h.panels(tree)[1]).some((node) => node.type === "ScreenScrollView")).toBe(true);
  for (const field of ["sharedResultsOnly", "personalAccessOnly"] as const) {
    h.event[field] = true;
    tree = h.render();
    expect(h.panels(tree)).toHaveLength(2);
    expect(h.panels(tree)[0].props.active).toBe(true);
    h.event[field] = false;
  }
  h.options.userId = "next-owner";
  tree = h.render();
  expect(h.panels(tree).every((panel) => String(panel.key).includes("next-owner"))).toBe(true);
  h.query.data = undefined;
  expect(h.panels(h.render())).toHaveLength(0);
});

it("retains results independently without replacing the existing overview/participants owner", () => {
  const h = harness("EventTable");
  let tree = h.render();
  const overviewKey = h.panels(tree)[0].key,
    resultsKey = h.panels(tree)[1].key;
  h.change(tree, "participants");
  tree = h.render();
  expect(
    nodes(h.panels(tree)[0]).find((node) => node.type === "EventTableOverview")?.props.section,
  ).toBe("participants");
  h.change(tree, "results");
  tree = h.render();
  expect(h.panels(tree).map((panel) => panel.props.active)).toEqual([false, true]);
  expect(
    nodes(h.panels(tree)[0]).find((node) => node.type === "EventTableOverview")?.props.section,
  ).toBe("participants");
  for (const panel of h.panels(tree))
    expect(nodes(panel).filter((node) => node.type === "Tabs")).toHaveLength(1);
  h.change(tree, "overview");
  tree = h.render();
  expect(h.panels(tree).map((panel) => panel.key)).toEqual([overviewKey, resultsKey]);
  expect(
    nodes(h.panels(tree)[0]).find((node) => node.type === "EventTableOverview")?.props.section,
  ).toBe("overview");
  h.change(tree, "results");
  h.table.eventStatus = "PLANNING";
  tree = h.render();
  expect(h.panels(tree)).toHaveLength(1);
  expect(h.panels(tree)[0].props.active).toBe(true);
  expect(nodes(tree).some((node) => node.type === "EventTableResults")).toBe(false);
  h.options.apiUrl = "https://next-preview.test";
  expect(String(h.panels(h.render())[0].key)).toBe(
    JSON.stringify([h.options.apiUrl, h.options.userId, "event", "table", "overview"]),
  );
  h.tableQuery.data = undefined;
  expect(h.panels(h.render())).toHaveLength(0);
});
