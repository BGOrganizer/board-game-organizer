import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
// Execute actual native JSX with host primitives replaced. This is not device touch/layout acceptance.
function component(file: string, name: string, modules: Record<string, unknown>) {
  const text = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  const output: Record<string, (props: any) => Element> = {};
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const code = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  runInNewContext(code, {
    exports: output,
    require: (id: string) => {
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (!(id in modules)) throw new Error(`Unexpected presentation dependency ${id}`);
      return modules[id];
    },
  });
  return output[name];
}
it.each([
  [320, 640, 288, 320],
  [800, 1200, 360, 320],
  [240, 400, 208, 200],
])(
  "bounds the games popover at %s×%s without a request or vote dependency",
  (width, height, expectedWidth, expectedHeight) => {
    const render = component("events/EventTableGamesPopover", "EventTableGamesPopover", {
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": { Dices: "Dices" },
      "react-native": { FlatList: "FlatList", useWindowDimensions: () => ({ width, height }) },
      "@/components/common/ui/HelpPopover": { HelpPopover: "HelpPopover" },
      "@/components/games/GameListRow": { GameListRow: "GameListRow" },
      "@/lib/i18n": { useT: () => (id: string) => id },
    });
    const games = [
      { id: 1, name: "Approved game", imageUrl: null, year: 2024, average: 8, rank: 2 },
    ];
    const popover = render({ name: "Table", games });
    expect(popover.props.label).toBe("Board games: Table");
    expect(popover.props.width).toBe(expectedWidth);
    const list = popover.props.children as Element;
    expect(list.props.data).toBe(games);
    expect(list.props.style.maxHeight).toBe(expectedHeight);
    expect([
      list.props.initialNumToRender,
      list.props.maxToRenderPerBatch,
      list.props.windowSize,
    ]).toEqual([8, 6, 7]);
    expect(list.props.keyExtractor(games[0])).toBe("1");
    const row = list.props.renderItem({ item: games[0] }) as Element;
    expect(row.props).toEqual({
      name: "Approved game",
      imageUrl: null,
      year: 2024,
      average: 8,
      rank: 2,
    });
    expect(row.props.actions).toBeUndefined();
    expect(row.props.metadata).toBeUndefined();
    expect(list.props.ListEmptyComponent.props.children).toBe("No games found");
  },
);
it("keeps the horizontal card artwork fixed and actions outside its stretched navigation target", () => {
  const render = component("common/ui/LinkedListCard", "LinkedListCard", {
    "heroui-native/card": { Card: { Body: "Card.Body" } },
    "react-native": {
      Pressable: "Pressable",
      View: "View",
      StyleSheet: { absoluteFill: { position: "absolute", inset: 0 } },
    },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "./ListCard": { ListCard: "ListCard" },
  });
  const onPress = vi.fn(),
    actions = { type: "Button", props: {} },
    artwork = { type: "Artwork", props: {} };
  const tree = render({
    label: "Open table",
    onPress,
    artwork,
    leadingActions: actions,
    children: "Long name",
    notificationCount: 2,
  });
  const [navigation, body] = tree.props.children as Element[];
  expect(navigation.props.children).toBeUndefined();
  expect(navigation.props.accessibilityValue).toEqual({ text: "Unread updates" });
  navigation.props.onPress();
  expect(onPress).toHaveBeenCalledOnce();
  expect(body.props.style.flexDirection).toBe("row");
  expect(body.props.pointerEvents).toBe("box-none");
  const [text, picture] = body.props.children as Element[];
  expect(picture.props.style.flexShrink).toBe(0);
  expect(picture.props.children).toBe(artwork);
  const footer = text.props.children[1] as Element;
  expect(footer.props.style.flexWrap).toBe("wrap");
  expect(footer.props.style.position).toBeUndefined();
  expect(footer.props.children[0]).toBe(actions);
});
it("lets field-help labels shrink beside fixed controls at large native font scales", () => {
  const render = component("common/ui/SearchHelpLabel", "SearchHelpLabel", {
    "heroui-native/text": { Typography: "Typography" },
    "react-native": { View: "View" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "./HelpPopover": { HelpPopover: "HelpPopover" },
  });
  const tree = render({ label: "Impostazioni", help: "Existing help" });
  expect(tree.props.style).toMatchObject({ flexShrink: 1, minWidth: 0 });
  expect(tree.props.children[0].props.style.flexShrink).toBe(1);
});
it("uses actual HeroUI background compositions and keeps the existing API-owned roster hook", () => {
  const source = (file: string) =>
    readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  for (const file of [
    "events/EventDetailsCard",
    "events/EventTableInfo",
    "groups/GroupIdentityCard",
  ]) {
    expect(source(file)).toContain("background=");
    expect(source(file)).toContain('presentation="background"');
  }
  const table = source("events/EventTable");
  expect(table.indexOf("<EventTableInfo")).toBeLessThan(table.indexOf("<Tabs value="));
  expect(table).toContain('value="participants"');
  expect(table).toContain("table.sharedResultsOnly");
  expect(table).toContain('table.eventStatus !== "PLANNING"');
  const roster = source("events/EventTableSeats");
  expect(roster).toContain("useEventTableRoster(o, table)");
  expect(roster).toContain("active &&");
  expect(roster).toContain("roster.waitingRows");
});
