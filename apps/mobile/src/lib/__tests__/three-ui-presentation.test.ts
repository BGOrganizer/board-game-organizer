import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Node = { type: unknown; props: Record<string, any> };
// Actual native JSX/props with host primitives replaced; not native touch/frame acceptance.
function load(file: string, name: string, extra: Record<string, unknown> = {}) {
  const text = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  const exports: Record<string, (props: any) => Node> = {};
  const jsx = (type: unknown, props: any) => ({ type, props });
  const modules: Record<string, unknown> = {
    "react-native": { View: "View" },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/hooks": { useThemeColor: (tokens: string | string[]) => tokens },
    "heroui-native/text": { Typography: "Typography" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    ...extra,
  };
  runInNewContext(
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      require: (id: string) => {
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
        if (!(id in modules)) throw new Error(`Unexpected dependency ${id}`);
        return modules[id];
      },
    },
  );
  return exports[name];
}
function find(value: any, type: string): Node | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map((n) => find(n, type)).find(Boolean);
  return value.type === type ? value : find(value.props?.children, type);
}
function proposal(kind: string, status = "PENDING", change: Record<string, any> = {}) {
  const row = { id: "proposal", payload: { kind }, status, ...change.row };
  const state = {
    visible: true,
    manager: true,
    canPropose: false,
    intents: [],
    q: {
      isPending: false,
      isError: false,
      items: [row],
      hasVerifiedBase: change.verified !== false,
      canPrevious: false,
      data: {},
    },
    actions: { busy: Boolean(change.busy) },
    open: vi.fn(),
    selected: null,
    ...change.state,
  };
  const render = load("events/EventProposalSection", "EventProposalSection", {
    "@board-game-organizer/shared": {
      useEventProposalSection: () => state,
      eventProposalLabel: () => "Proposal",
      clientMutationPhase: vi.fn(),
    },
    "@lingui/react": { useLingui: () => ({ i18n: { locale: "en" } }) },
    "expo-router": { useRouter: () => ({ push: vi.fn() }) },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "lucide-react-native": {
      CircleCheck: "CircleCheck",
      CircleX: "CircleX",
      ClipboardCheck: "ClipboardCheck",
    },
    "@/components/common/ui/GroupedList": { GroupedList: "GroupedList" },
    "@/components/games/GameListRow": { GameListRow: "GameListRow" },
    "@/components/locations/LocationListRow": { LocationListRow: "LocationListRow" },
    "@/lib/useCommunityApi": { useCommunityApi: () => ({ apiUrl: "api", userId: "owner" }) },
    "./EventDateTimeField": { EventDateTimeField: "DateTime" },
    "./EventProposalItem": { EventProposalItem: "ProposalItem" },
    "./EventProposalReviewDialog": { EventProposalReviewDialog: "ReviewDialog" },
  });
  const item = find(
    render({ event: { id: "event", version: 1 }, kind, disabled: change.disabled }),
    "ProposalItem",
  );
  if (!item) throw new Error("Missing proposal row");
  return { item, row, state };
}
it.each(["date", "location", "game"])(
  "matches %s moderation to the actual native vote circle without shrinking its touch envelope",
  (kind) => {
    const { item, state, row } = proposal(kind);
    const envelope = item.props.actions as Node;
    expect(envelope.props.style).toMatchObject({ width: 44, height: 44 });
    const action = envelope.props.children as Node;
    const vote = load("events/EventVoteButtons", "EventVoteButtons", {
      react: { useState: () => [false, vi.fn()] },
      "lucide-react-native": { Check: "Check", Minus: "Minus", Vote: "Vote", X: "X" },
      "@/components/common/ui/ConfirmDialog": { ConfirmDialog: "Dialog" },
    });
    const choice = find(
      vote({ inline: true, label: "Vote", busy: false, onChange: vi.fn() }),
      "Button",
    );
    expect(action.props.style).toMatchObject(choice?.props.style);
    expect(action.props.variant).toBe("primary");
    expect(action.props.className).toContain("rounded-full");
    expect(action.props.hitSlop).toBe(4);
    expect(action.props.children.props).toMatchObject({ size: 16, color: "accent-foreground" });
    action.props.onPress();
    expect(state.open).toHaveBeenCalledWith(row);
  },
);
it.each(["PENDING", "ACCEPTED", "REJECTED"])(
  "retains distinct %s glyph/label meanings with the accent action",
  (status) => {
    const { item } = proposal("date", status);
    const action = item.props.actions.props.children;
    expect(action.props.accessibilityLabel).toBe(
      `${status === "PENDING" ? "Review proposal" : "Proposal details"}: Proposal`,
    );
    expect(action.props.children.type).toBe(
      status === "PENDING" ? "ClipboardCheck" : status === "ACCEPTED" ? "CircleCheck" : "CircleX",
    );
  },
);
it.each([
  { disabled: true },
  { verified: false },
  { busy: true },
  { row: { clientAction: "accept" } },
])("retains the existing pending/authority guard: %j", (change) => {
  expect(
    proposal("date", "PENDING", change).item.props.actions.props.children.props.isDisabled,
  ).toBe(true);
});
it("does not expose the moderation action to an ordinary viewer", () => {
  expect(proposal("date", "PENDING", { state: { manager: false } }).item.props.actions).toBeNull();
});
it("keeps on-map credits and shows a footer only as a no-map attribution fallback", () => {
  const text = readFileSync(
    new URL("../../components/locations/LocationPicker.tsx", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "location.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let maps = 0,
    fallbacks = 0;
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "MapLibreMap") {
      const props = new Set(
        node.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText(ast)),
      );
      expect(props.has("attribution")).toBe(true);
      expect(props.has("logo")).toBe(true);
      maps++;
    }
    if (ts.isConditionalExpression(node) && node.condition.getText(ast) === "!mapStyle") {
      expect(node.whenTrue.getText(ast)).toContain("https://www.openstreetmap.org/copyright");
      expect(node.whenTrue.getText(ast)).toContain("maptiler-logo.png");
      expect(node.whenFalse.getText(ast)).toBe("null");
      fallbacks++;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  expect(maps).toBe(1);
  expect(fallbacks).toBe(1);
  expect(text).toMatch(/accessibilityLabel=\{t\("Map by MapTiler"\)\}\s+hitSlop=\{6\}/);
});
