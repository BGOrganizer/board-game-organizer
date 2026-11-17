import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute real native owner composition/handlers with platform adapters; not native timing proof.
type Element = { type: unknown; key?: string; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...Object.values(node.props).flatMap((child) => nodes(child))];
}
const source = (name: string) =>
  readFileSync(new URL(`../../components/events/${name}.tsx`, import.meta.url), "utf8");
function harness() {
  const options = { apiUrl: "owned-preview", userId: "owner" };
  const table = { eventId: "event", id: "table", canManage: true, eventStatus: "PLANNING" };
  const roster = {
    seatRows: [{ key: "seat" }],
    waitingRows: [{ key: "waiting" }],
    rows: [{ key: "seat" }],
    hasNextPage: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    resetPresentation: vi.fn(),
    more: vi.fn(),
  };
  const order = { editing: false, start: vi.fn(), move: vi.fn(), rows: [{ id: "draft" }] };
  const orderHook = vi.fn(() => order),
    rosterHook = vi.fn(() => roster);
  const slots: Array<{ value?: unknown; current?: unknown; deps?: readonly unknown[] }> = [];
  let cursor = 0,
    visible = true;
  const effects: Array<() => void> = [];
  const jsx = (type: unknown, props: Element["props"], key?: string) => ({ type, props, key });
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useRef: (initial: unknown) => {
        const index = cursor++;
        slots[index] ??= { current: initial };
        return slots[index];
      },
      useState: (initial: unknown) => {
        const index = cursor++;
        slots[index] ??= { value: initial };
        return [
          slots[index].value,
          (value: unknown) => {
            slots[index].value = value;
          },
        ];
      },
      useEffect: (effect: () => void, deps: readonly unknown[]) => {
        const index = cursor++;
        if (!slots[index]?.deps?.every((value, i) => Object.is(value, deps[i])))
          effects.push(effect);
        slots[index] = { deps };
      },
    },
    "@board-game-organizer/shared": {
      useTableSeatOrder: orderHook,
      useEventTableRoster: rosterHook,
      useEventCutoff: () => false,
      useEventRecordActions: () => ({ blocking: false }),
    },
    "@/lib/useCommunityApi": { useCommunityApi: () => options },
    "@/lib/listActivity": { useListActivity: () => () => visible },
    "@/lib/useFloatingActionLayout": { useFloatingActionLayout: () => ({ paddingBottom: 72 }) },
    "@/lib/i18n": { useT: () => (value: string) => value },
    "heroui-native/hooks": { useThemeColor: () => ["danger", "muted", "accent-foreground"] },
    "expo-router": { useRouter: () => ({ push: vi.fn() }) },
    "react-native": { View: "View", SectionList: "SectionList" },
    "@/components/common/ui/ScrollTargetContext": {
      ScrollTargetContext: { Provider: "ScrollProvider" },
    },
  };
  const output: Record<string, (props: Record<string, unknown>) => Element> = {};
  runInNewContext(
    ts.transpileModule(source("EventTableSeats"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports: output,
      require: (id: string) => modules[id] ?? new Proxy({}, { get: (_, name) => String(name) }),
    },
  );
  const header = { type: "Header", props: {} },
    info = { type: "Info", props: {} };
  const render = (active: boolean) => {
    cursor = 0;
    return output.EventTableSeats({ table, active, header, overview: info, onRemove: vi.fn() });
  };
  const find = (tree: Element, type: string) => {
    const node = nodes(tree).find((node) => node.type === type);
    if (!node) throw Error(`Missing ${type}`);
    return node;
  };
  return {
    options,
    table,
    roster,
    order,
    orderHook,
    rosterHook,
    render,
    find,
    panels: (tree: Element) => nodes(tree).filter((node) => node.type === "RetainedTabPanel"),
    hideOwner: () => {
      visible = false;
    },
    runEffects: () => {
      for (const effect of effects.splice(0)) effect();
    },
  };
}

it("retains separate native scroll presentations while keeping a single seat model and full roster rows", () => {
  const h = harness();
  const initial = h.render(true);
  h.runEffects();
  const keys = h.panels(initial).map((panel) => panel.key);
  const list = h.find(initial, "SectionList");
  const rows = list.props.sections;
  const end = list.props.onEndReached;
  if (typeof end !== "function") throw Error("Missing roster end callback");
  end();
  expect(h.roster.more).toHaveBeenCalledOnce();
  const overview = h.render(false);
  end(); // Old handler captured active=true; the current owner lease must reject it.
  expect(h.roster.more).toHaveBeenCalledOnce();
  h.runEffects();
  expect(h.roster.resetPresentation).toHaveBeenCalledOnce();
  expect(h.panels(overview).map((panel) => panel.props.active)).toEqual([true, false]);
  expect(h.find(overview, "SectionList").props.sections).toEqual(rows);
  expect(h.find(overview, "SectionList").props.ListFooterComponent).toBeTruthy();
  const reentry = h.render(true);
  expect(h.panels(reentry).map((panel) => panel.key)).toEqual(keys);
  expect(h.orderHook).toHaveBeenCalledTimes(3);
  expect(h.rosterHook).toHaveBeenCalledTimes(3);
  h.hideOwner();
  end();
  expect(h.roster.more).toHaveBeenCalledOnce();
  h.options.userId = "next-owner";
  expect(h.panels(h.render(true)).every((panel) => !keys.includes(panel.key))).toBe(true);
});

it("keeps the draft model while visiting Info and isolates the Info scroll target from hidden roster refs", () => {
  const h = harness();
  h.order.editing = true;
  const tree = h.render(false);
  expect(h.panels(tree).map((panel) => panel.props.active)).toEqual([true, false]);
  expect(h.find(tree, "EventSeatOrderEditor").props.model).toBe(h.order);
  expect(h.find(tree, "Info")).toBeTruthy();
  expect(nodes(tree).some((node) => node.type === "SectionList")).toBe(false);
  h.order.editing = false;
  const normal = h.render(true);
  const providers = nodes(normal).filter((node) => node.type === "ScrollProvider");
  expect(providers).toHaveLength(2);
  expect(providers[0].props.value).not.toBe(providers[1].props.value);
  const infoRef = h.find(normal, "InputScrollView").props.ref as { current: unknown };
  expect(providers[0].props.value).toBe(infoRef);
  const infoScroll = { scrollTo: vi.fn() };
  infoRef.current = infoScroll;
  const rosterRef = h.find(normal, "SectionList").props.ref;
  if (typeof rosterRef !== "function") throw Error("Missing roster ref");
  rosterRef(null);
  expect(infoRef.current).toBe(infoScroll);
  expect(h.order.rows).toEqual([{ id: "draft" }]);
});

it("keeps one native title owner and places separate tab measurement roots in each retained header", () => {
  expect(source("EventTableOverview")).not.toContain("Stack.Screen");
  const table = source("EventTable");
  expect(table).toContain("<Stack.Screen");
  expect(table).toContain("<Tabs value={selected} onValueChange={setTab}>");
  expect(table).not.toContain("<Tabs value={selected} onValueChange={setTab} style={{ flex: 1 }}>");
  const seats = source("EventTableSeats");
  expect(seats.match(/useTableSeatOrder\(/g)).toHaveLength(1);
  expect(seats.match(/useEventTableRoster\(/g)).toHaveLength(1);
  expect(seats).not.toContain("if (order.editing)\n    return");
});
