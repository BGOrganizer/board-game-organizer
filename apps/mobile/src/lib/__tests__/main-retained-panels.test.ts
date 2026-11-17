import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute native owner composition/handlers; React Activity lifecycle has its own real React tests.
// Native layout, accessibility and frame timing still require Maestro/device verification.
type Element = { type: unknown; key?: string; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
const source = (path: string) =>
  readFileSync(new URL(`../../${path}.tsx`, import.meta.url), "utf8");
function harness(path: string, name: string) {
  const options = { apiUrl: "https://owned-preview.test", userId: "owner" };
  const hooks: unknown[] = [];
  let cursor = 0;
  const store = {
    communityViews: {} as Record<string, { tab: string }>,
    setCommunityView: (key: string, value: { tab: string }) => {
      store.communityViews[key] = value;
    },
  };
  const jsx = (type: unknown, props: Element["props"], key?: string) => ({ type, props, key });
  const Tabs = Object.assign(() => {}, { Label: "Tabs.Label" });
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      memo: (component: unknown) => component,
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [
          hooks[index],
          (value: unknown) => {
            hooks[index] = value;
          },
        ];
      },
    },
    "react-native": { View: "View" },
    "heroui-native/tabs": { Tabs },
    "@/lib/i18n": { useT: () => (text: string) => text },
    "@/lib/useCommunityApi": { useCommunityApi: () => options },
    "@board-game-organizer/store": {
      useAppStore: (select: (s: typeof store) => unknown) => select(store),
    },
  };
  const output: Record<string, (props: Record<string, unknown>) => Element> = {};
  runInNewContext(
    ts.transpileModule(source(path), {
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
  return {
    options,
    render: (props: Record<string, unknown> = {}) => {
      cursor = 0;
      return output[name](props);
    },
    change: (tree: Element, tab: string) => {
      const tabs = nodes(tree).find((node) => node.type === Tabs);
      if (!tabs) throw Error("Missing Tabs root");
      const change = tabs.props.onValueChange;
      if (typeof change !== "function") throw Error("Missing tab handler");
      change(tab);
    },
    panels: (tree: Element) => nodes(tree).filter((node) => node.type === "RetainedTabPanel"),
  };
}

it.each([
  ["groups/Groups", "Groups", ["private", "public", "search"]],
  ["events/Events", "Events", ["mine", "available", "terminated"]],
  ["community/Community", "Community", ["activity", "market"]],
] as const)("%s retains separately scoped visited list owners", (path, name, sections) => {
  const h = harness(`components/${path}`, name);
  let tree = h.render();
  const keys = h.panels(tree).map((panel) => panel.key);
  expect(keys).toHaveLength(sections.length);
  expect(new Set(keys).size).toBe(sections.length);
  for (const section of sections) {
    h.change(tree, section);
    tree = h.render();
    const panels = h.panels(tree);
    expect(panels.map((panel) => panel.key)).toEqual(keys);
    expect(panels.filter((panel) => panel.props.active)).toHaveLength(1);
    const activeKey = panels.find((panel) => panel.props.active)?.key;
    if (!activeKey) throw Error("Missing active panel key");
    expect(JSON.parse(activeKey).at(-1)).toBe(section);
    expect(panels.every((panel) => panel.props.children)).toBe(true);
  }
  h.options.userId = "other-owner";
  const otherOwner = h.panels(h.render()).map((panel) => panel.key);
  expect(otherOwner.every((key) => !keys.includes(key))).toBe(true);
  h.options.apiUrl = "https://other-preview.test";
  expect(h.panels(h.render()).every((panel) => !otherOwner.includes(panel.key))).toBe(true);
  expect(source(`components/${path}`)).not.toContain("useDeferredValue");
});

it("keeps Group-context Events in its existing detail owner instead of retaining nested main tabs", () => {
  const h = harness("components/events/Events", "Events");
  const header = { type: "Header", props: {} };
  const tree = h.render({ groupId: "group-a", canCreate: false, header });
  expect(tree.type).toBe("EventList");
  expect(tree.props).toEqual({ groupId: "group-a", canCreate: false, header });
  expect(h.panels(tree)).toEqual([]);
});

function jsxElements(path: string, tag: string) {
  const file = ts.createSourceFile(
    "native.tsx",
    source(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const elements: Array<ts.JsxOpeningElement | ts.JsxSelfClosingElement> = [];
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === tag
    )
      elements.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return elements.map((node) => ({
    prop: (name: string) => {
      const attribute = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((prop) => prop.name.getText(file) === name);
      if (!attribute) throw Error(`Missing ${tag}.${name}`);
      const value = attribute.initializer;
      if (!value) return "true";
      if (!ts.isJsxExpression(value)) return value.getText(file);
      if (!value.expression) throw Error(`Empty ${tag}.${name}`);
      return value.expression.getText(file);
    },
  }));
}

it("retains Contacts viewports with their tabpanel semantics, one shared permission/query owner and account isolation", () => {
  const path = "app/(tabs)/contacts";
  const text = source(path);
  expect(text.match(/useContacts\(/g)).toHaveLength(1);
  expect(text.match(/useInvites\(/g)).toHaveLength(1);
  expect(text).toContain("<ContactsContent key={JSON.stringify([apiUrl(), userId])}");
  const panels = jsxElements(path, "RetainedTabPanel");
  const contents = jsxElements(path, "Tabs.Content");
  expect(panels).toHaveLength(4);
  expect(contents).toHaveLength(4);
  for (const [index, section] of ["device", "search", "requests", "connections"].entries()) {
    expect(runInNewContext(contents[index].prop("value"))).toBe(section);
    expect(contents[index].prop("forceMount")).toBe("true");
    for (const tab of ["device", "search", "requests", "connections"]) {
      const context = { tab, attentionOptions: { apiUrl: "owned-preview" }, userId: "owner-a" };
      expect(runInNewContext(panels[index].prop("active"), context)).toBe(tab === section);
      expect(runInNewContext(contents[index].prop("aria-hidden"), context)).toBe(tab !== section);
      expect(JSON.parse(runInNewContext(panels[index].prop("key"), context))).toEqual([
        "owned-preview",
        "owner-a",
        section,
      ]);
    }
  }
  const readSection = vi.fn(),
    setTab = vi.fn();
  const onChange = runInNewContext(jsxElements(path, "Tabs")[0].prop("onValueChange"), {
    contactTab: (value: string) => value,
    readSection,
    setTab,
  });
  for (const section of ["connections", "requests", "device", "search"]) onChange(section);
  expect(readSection.mock.calls).toEqual(setTab.mock.calls);
  expect(text).toContain('if (id !== "device") attentionRead.read({ kind: "contacts", id })');
  expect(text).toContain('if (tab !== "search" || query.trim().length < 4)');
});

it("rejects late Community paging when its retained panel is hidden", () => {
  const path = "components/community/CommunityActivities";
  const callback = jsxElements(path, "SectionList")[0].prop("onEndReached");
  const q = {
    hasNextPage: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
  };
  for (const active of [false, true]) {
    runInNewContext(callback, { isActive: () => active, denied: false, q })();
    expect(q.fetchNextPage).toHaveBeenCalledTimes(active ? 1 : 0);
  }
  for (const changed of [
    { denied: true },
    { q: { ...q, hasNextPage: false } },
    { q: { ...q, isFetchingNextPage: true } },
    { q: { ...q, isFetchNextPageError: true } },
  ])
    runInNewContext(callback, { isActive: () => true, denied: false, q, ...changed })();
  expect(q.fetchNextPage).toHaveBeenCalledOnce();
});
