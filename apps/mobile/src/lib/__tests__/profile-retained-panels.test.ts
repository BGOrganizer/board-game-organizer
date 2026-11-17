import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; key?: unknown; props: Record<string, any> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [
    node,
    ...Object.values(node.props).flatMap((prop) =>
      prop && typeof prop === "object" && (Array.isArray(prop) || "props" in prop)
        ? nodes(prop)
        : [],
    ),
  ];
}
// Executes native controller wiring; real Activity lifecycles are covered separately.
// This is not device layout or frame-timing evidence.
function harness() {
  const options = { apiUrl: "https://preview.test", userId: "viewer" };
  const data = {
    id: "viewer",
    name: "Owner",
    username: "owner",
    avatarUrl: null,
    social: { friends: 2, followers: 3, following: 4 },
    player: { gamesPlayed: 4, gamesWon: 1, winRate: 25 },
    collection: { snapshot: "published", counts: {} },
  };
  const query = {
    data: data as typeof data | undefined,
    error: null as unknown,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  };
  const account = {
    data: {
      active: { snapshot: "owned", counts: {} } as { snapshot: string; counts: object } | null,
    },
    error: null as unknown,
  };
  const state = {
    profileViews: {} as Record<string, { tab: string }>,
    setProfileView: vi.fn((key: string, value: { tab: string }) => {
      state.profileViews[key] = value;
    }),
  };
  const dismiss = vi.fn(),
    view = vi.fn(() => query),
    bgg = vi.fn(() => ({ account }));
  const jsx = (type: any, props: Record<string, unknown>, key?: unknown): Element => ({
    type: type?.kind ?? type,
    props,
    key,
  });
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    react: { useCallback: (callback: unknown) => callback },
    "react-native": { View: "View", ScrollView: "ScrollView", Keyboard: { dismiss } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 8 }) },
    "heroui-native/tabs": { Tabs: { kind: "Tabs", Label: "TabsLabel" } },
    "heroui-native/button": { Button: { kind: "Button", Label: "ButtonLabel" } },
    "@lingui/react": { useLingui: () => ({ i18n: { locale: "en" } }) },
    "@/lib/i18n": { useT: () => (message: string) => message },
    "@/lib/useCommunityApi": { useCommunityApi: () => options },
    "@board-game-organizer/store": {
      useAppStore: (selector: (value: typeof state) => unknown) => selector(state),
    },
    "@board-game-organizer/shared": {
      useProfileView: view,
      useBggAccount: bgg,
      communityAccessDenied: (error: unknown) => error === "denied",
    },
  };
  const exports: Record<string, (props: { userId?: string }) => Element> = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("../../components/profile/Profile.tsx", import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports,
      require: (id: string) => modules[id] ?? new Proxy({}, { get: (_, key) => String(key) }),
    },
  );
  const render = (userId?: string) => exports.Profile({ userId });
  const panels = (tree: Element) => nodes(tree).filter((node) => node.type === "RetainedTabPanel");
  const change = (tree: Element, tab: string) => {
    const root = nodes(tree).find((node) => node.type === "Tabs");
    if (!root) throw Error("Profile tab root missing");
    root.props.onValueChange(tab);
  };
  return { options, data, query, account, state, dismiss, view, bgg, render, panels, change };
}
it("retains separate full-page owners and tab headers without nesting Collection in a ScrollView", () => {
  const h = harness();
  let tree = h.render();
  const panels = h.panels(tree);
  expect(panels.map((panel) => panel.props.active)).toEqual([true, false, false]);
  expect(panels.map((panel) => panel.key)).toEqual([
    JSON.stringify([h.options.apiUrl, "viewer", "viewer", "activity"]),
    JSON.stringify([h.options.apiUrl, "viewer", "viewer", "player"]),
    JSON.stringify([h.options.apiUrl, "viewer", "viewer", "collection", "owned"]),
  ]);
  expect(panels.map((panel) => panel.props.children.type)).toEqual([
    "ScrollView",
    "ScrollView",
    "ProfileCollection",
  ]);
  for (const panel of panels)
    expect(nodes(panel).filter((node) => node.type === "Tabs")).toHaveLength(1);
  expect(nodes(panels[0]).some((node) => node.type === "ProfileRecentActivities")).toBe(true);
  expect(nodes(panels[1]).some((node) => node.type === "ProfilePlayer")).toBe(true);
  expect(nodes(panels[2]).some((node) => node.type === "ScrollView")).toBe(false);
  h.change(tree, "player");
  tree = h.render();
  expect(h.panels(tree).map((panel) => panel.props.active)).toEqual([false, true, false]);
  h.change(tree, "player");
  h.change(tree, "unknown");
  expect(h.dismiss).toHaveBeenCalledOnce();
  expect(h.state.setProfileView).toHaveBeenCalledOnce();
  h.change(tree, "collection");
  expect(h.panels(h.render()).map((panel) => panel.props.active)).toEqual([false, false, true]);
  expect(h.bgg).toHaveBeenCalledTimes(3); // One account workflow per controller render.
});
it("evicts Collection on unlink/snapshot change and replaces retained identities for another owner", () => {
  const h = harness();
  let tree = h.render();
  const original = h.panels(tree)[2].key;
  h.account.data.active = { snapshot: "new-snapshot", counts: {} };
  tree = h.render();
  expect(h.panels(tree)[2].key).not.toBe(original);
  h.change(tree, "collection");
  h.account.data.active = null;
  tree = h.render();
  expect(h.panels(tree)).toHaveLength(2);
  expect(h.panels(tree)[0].props.active).toBe(true);
  h.change(tree, "collection");
  expect(h.state.setProfileView).toHaveBeenCalledOnce();
  const previous = h.panels(tree).map((panel) => panel.key);
  h.options.apiUrl = "https://other-preview.test";
  h.options.userId = "other-viewer";
  tree = h.render("subject");
  expect(
    h
      .panels(tree)
      .slice(0, 2)
      .every((panel) => !previous.includes(panel.key)),
  ).toBe(true);
  expect(h.panels(tree)[2].props.children.props.snapshot).toBe("published");
  expect(nodes(tree).some((node) => node.type === "ProfileLogout")).toBe(false);
});
it("removes retained private content on denial and preserves the owner's logout/error/loading fallback", () => {
  const h = harness();
  h.render();
  h.query.error = "denied";
  h.query.isError = true;
  let tree = h.render();
  expect(h.panels(tree)).toEqual([]);
  expect(nodes(tree).some((node) => node.type === "ProfileIdentity")).toBe(false);
  expect(nodes(tree).some((node) => node.type === "ProfileLogout")).toBe(true);
  const retry = nodes(tree).find((node) => node.type === "Button");
  retry?.props.onPress();
  expect(h.query.refetch).toHaveBeenCalledOnce();
  h.query.error = null;
  h.query.isError = false;
  h.query.isPending = true;
  h.query.data = undefined;
  tree = h.render();
  expect(h.panels(tree)).toEqual([]);
  expect(nodes(tree).some((node) => node.type === "Skeleton")).toBe(true);
  expect(nodes(tree).some((node) => node.type === "ProfileLogout")).toBe(true);
});
