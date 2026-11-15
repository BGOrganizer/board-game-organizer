import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import type { PlannedTableResponse, TableLeaderboardPlayer } from "@board-game-organizer/schemas";
import { tablePlayerRatingRows } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import ts from "typescript";
import { expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import { messages as italian } from "../../../../../messages/it.js";
import { plannedTable } from "../../../../web/src/test-fixtures/eventRecords";
import { translate } from "../i18n";

type Element = { type: string; props: Record<string, any> };
// Execute actual native JSX with host primitives replaced; not device/layout/touch acceptance.
function component(file: string, name: string, modules: Record<string, unknown>) {
  const text = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  const output: Record<string, (props: any) => Element> = {};
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  runInNewContext(
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports: output,
      require: (id: string) => {
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
        if (!(id in modules)) throw new Error(`Unexpected rating dependency ${id}`);
        return modules[id];
      },
    },
  );
  return output[name];
}
const table: PlannedTableResponse = {
  ...plannedTable,
  groupId: "group",
  eventStatus: "TERMINATED",
  confirmed: { gameId: 1, playerIds: ["player", "other", "nd"], startsAt: plannedTable.createdAt },
  results: {
    entries: [
      { userId: "player", score: "8", rank: 1 },
      { userId: "other", score: "4", rank: 2 },
      { userId: "nd", score: null, rank: null },
    ],
    lowerWins: false,
    tieBreaks: [],
    finalizedAt: plannedTable.createdAt,
  },
  ratingChanges: [{ userId: "player", score: 1234.5, delta: 34.5, provisional: true }],
  groupRatingChanges: [{ userId: "player", score: 678.25, delta: -21.75, provisional: false }],
};
function render(
  tableValue = table,
  current?: TableLeaderboardPlayer,
  userId = "player",
  locale = "en",
) {
  const i18n = setupI18n({ locale, messages: { en: {}, it: italian } });
  const renderPopover = component("events/EventPlayerRatingPopover", "EventPlayerRatingPopover", {
    "@board-game-organizer/shared": { tablePlayerRatingRows },
    "@lingui/react": { useLingui: () => ({ i18n }) },
    "heroui-native/hooks": { useThemeColor: (tokens: string[]) => tokens },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": {
      Globe: "Globe",
      UsersRound: "UsersRound",
      Clock3: "Clock3",
      TrendingUp: "TrendingUp",
      TrendingDown: "TrendingDown",
      Minus: "Minus",
    },
    "react-native": { View: "View", useWindowDimensions: () => ({ width: 360 }) },
    "@/components/common/ui/HelpPopover": { HelpPopover: "HelpPopover" },
    "@/lib/i18n": { useT: () => (message: string) => translate(i18n, message) },
  });
  return renderPopover({ table: tableValue, current, userId, name: "@player" });
}
function nodes(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as Element;
  return [element, ...nodes(element.props.children)];
}
function texts(tree: unknown): string[] {
  return nodes(tree)
    .filter((node) => node.type === "Typography")
    .map((node) =>
      Array.isArray(node.props.children)
        ? node.props.children.join("")
        : String(node.props.children),
    );
}
const popovers = (tree: Element) => nodes(tree).filter((node) => node.type === "HelpPopover");

it("keeps GLOBAL and GROUP adjacent, nonwrapping and semantically distinct without changing compact hits", () => {
  const row = render();
  expect(row.props.style).toMatchObject({
    flexDirection: "row",
    flexWrap: "nowrap",
    flexShrink: 0,
  });
  const scopes = popovers(row);
  expect(row.props.children).toEqual(scopes);
  expect(scopes.map((scope) => scope.props.label)).toEqual([
    "Global ranking: @player",
    "Group ranking: @player",
  ]);
  expect(scopes.map((scope) => scope.props.icon)).toEqual(["Globe", "UsersRound"]);
  expect(scopes.map((scope) => scope.props.tone)).toEqual(["accent", "success"]);
  for (const scope of scopes) {
    expect(scope.props.size).toBe("compact");
    expect(scope.props.width).toBe(328);
    expect(scope.props.triggerClassName).toBe("bg-default");
  }
  const HelpPopover = component("common/ui/HelpPopover", "HelpPopover", {
    "heroui-native/button": { Button: "Button" },
    "heroui-native/hooks": { useThemeColor: (token: string) => token },
    "heroui-native/popover": {
      Popover: {
        Trigger: "Trigger",
        Portal: "Portal",
        Overlay: "Overlay",
        Content: "Content",
        Title: "Title",
      },
    },
    "lucide-react-native": { CircleHelp: "CircleHelp" },
    "react-native": { View: "View" },
  });
  for (const scope of scopes) {
    const native = HelpPopover(scope.props);
    const button = nodes(native).find((node) => node.type === "Button")!;
    expect(button.props.style).toMatchObject({ minWidth: 44, minHeight: 44 });
    expect(button.props.accessibilityLabel).toBe(scope.props.label);
    expect(nodes(native).some((node) => node.type === "Title")).toBe(false);
    expect(nodes(native).find((node) => node.type === "Content")?.props.accessibilityLabel).toBe(
      scope.props.label,
    );
  }
});
it("keeps each immutable history scoped, including direction, provisional status and all recorded fields", () => {
  const [global, group] = popovers(render());
  expect(global.props.title).toBeUndefined();
  expect(group.props.title).toBeUndefined();
  for (const scope of [global, group]) {
    expect((scope.props.children as Element).props.style).toMatchObject({
      flexDirection: "row",
      flexWrap: "nowrap",
      alignItems: "stretch",
    });
    expect(
      nodes(scope).filter((node) => node.type === "View" && node.props.style?.flex === 1),
    ).toHaveLength(3);
    expect(nodes(scope).some((node) => node.type === "Globe" || node.type === "UsersRound")).toBe(
      false,
    );
  }
  expect(texts(global)).toEqual([
    "Rating before",
    "1,200",
    "Rating after",
    "1,234.5",
    "Rating change",
    "+34.5",
  ]);
  expect(texts(group)).toEqual([
    "Rating before",
    "700",
    "Rating after",
    "678.25",
    "Rating change",
    "-21.75",
  ]);
  expect(nodes(global).find((node) => node.type === "Clock3")?.props.accessibilityLabel).toBe(
    "Provisional rating",
  );
  expect(nodes(group).some((node) => node.type === "Clock3")).toBe(false);
  expect(nodes(global).find((node) => node.type === "TrendingUp")?.props.color).toBe(
    "success-soft-foreground",
  );
  expect(nodes(group).find((node) => node.type === "TrendingDown")?.props.color).toBe(
    "danger-soft-foreground",
  );
  expect(group.props.tone).toBe("success");
});
it.each([{ groupId: null }, { groupId: "group", sharedResultsOnly: true }])(
  "never adds GROUP facts for personal/shared-final access %j",
  (privacy) => {
    const scopes = popovers(render({ ...table, ...privacy }));
    expect(scopes).toHaveLength(1);
    expect(scopes[0].props.icon).toBe("Globe");
    expect(texts(scopes[0])).not.toContain("Group ranking");
    expect(texts(scopes[0])).not.toContain("678.25");
  },
);
it.each([
  { rankingEnabled: false },
  { results: { ...table.results!, entries: [{ userId: "player", score: null, rank: null }] } },
  { results: { ...table.results!, entries: [{ userId: "player", score: "8", rank: 1 }] } },
])("retains both not-updated scopes for unrated/all-ND/one-finisher outcomes %j", (patch) => {
  for (const scope of popovers(render({ ...table, ...patch }))) {
    expect(texts(scope)).toEqual(["Ranking not updated"]);
  }
});
it.each([{ ratingChanges: [] }, { results: undefined }, { rankingEnabled: undefined }])(
  "retains unavailable immutable history %j",
  (patch) => {
    // Exercise missing historical/cache fields without relaxing the public response DTO.
    const legacy = { ...table, ...patch } as PlannedTableResponse;
    const [global] = popovers(render(legacy));
    expect(texts(global)).toEqual(["Historical ranking unavailable"]);
  },
);
it("retains rated ND zero deltas and never substitutes current facts into immutable history", () => {
  const live: TableLeaderboardPlayer = {
    userId: "nd",
    name: "ND",
    avatarUrl: null,
    score: 9999,
    provisional: true,
    gamesPlayed: 9,
    gamesWon: 1,
    nd: 1,
  };
  const [global] = popovers(
    render(
      { ...table, ratingChanges: [{ userId: "nd", score: 500, delta: 0, provisional: false }] },
      live,
      "nd",
    ),
  );
  expect(texts(global)).toContain("0");
  expect(texts(global)).not.toContain("9,999");
  expect(nodes(global).find((node) => node.type === "Minus")?.props.color).toBe("muted");
});
it("retains current scope-specific values without historical labels and keeps unavailable current state distinct", () => {
  const live: TableLeaderboardPlayer = {
    userId: "player",
    name: "Player",
    avatarUrl: null,
    score: 9999,
    provisional: false,
    gamesPlayed: 5,
    gamesWon: 1,
    nd: 0,
    globalRating: { score: 600, provisional: false },
    groupRating: { score: 400, provisional: true },
  };
  const [global, group] = popovers(
    render({ ...table, eventStatus: "CONFIRMED", confirmed: undefined }, live),
  );
  expect(global.props.title).toBe("Global ranking");
  expect(group.props.title).toBe("Group ranking");
  expect(texts(global)).toEqual(["Ranking", "600"]);
  expect(texts(group)).toEqual(["Ranking", "400"]);
  expect(texts(popovers(render({ ...table, eventStatus: "CONFIRMED" }))[0])).toEqual([
    "Ranking unavailable",
  ]);
});
it("reuses Italian scope labels and locale-aware number formatting", () => {
  const [global, group] = popovers(render(table, undefined, "player", "it"));
  expect(global.props.label).toBe("Ranking globale: @player");
  expect(group.props.label).toBe("Ranking del gruppo: @player");
  expect(texts(global)).toContain(
    new Intl.NumberFormat("it", { maximumFractionDigits: 2 }).format(1234.5),
  );
  expect(texts(global)).toContain("+34,5");
});
