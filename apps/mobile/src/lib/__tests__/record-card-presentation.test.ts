import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import * as shared from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { plannedEvent, plannedTable, seat } from "../../../../web/src/test-fixtures/eventRecords";

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
  const [text, picture] = (body.props.children as Element[]).filter(Boolean);
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
it("stretches cover artwork along the whole left edge and puts controls at bottom right", () => {
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
  const tree = render({
    label: "Table",
    onPress: vi.fn(),
    artwork: "Artwork",
    children: "Title",
    leadingActions: "Icons",
    artworkLayout: "cover",
  });
  const body = tree.props.children[1] as Element;
  expect(body.props.style).toMatchObject({ alignItems: "stretch", padding: 0, gap: 0 });
  const [picture, content] = body.props.children as Element[];
  expect(picture.props.style).toMatchObject({ width: 80, flexShrink: 0, position: "relative" });
  expect(picture.props.children).toBe("Artwork");
  expect(content.props.children[1].props.style).toMatchObject({
    marginTop: "auto",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  });
});
it("shrinks only the native visual icon/frame, retaining a 44px HeroUI touch target", () => {
  const render = component("common/ui/HelpPopover", "HelpPopover", {
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
    "lucide-react-native": { CircleHelp: "HelpIcon" },
    "react-native": { View: "View" },
  });
  const tree = render({
    label: "Help",
    title: "Help",
    size: "compact",
    tone: "accent",
    triggerClassName: "bg-default",
  });
  const button = tree.props.children[0].props.children;
  expect(button.props.style).toMatchObject({ minWidth: 44, minHeight: 44, padding: 0 });
  const frame = button.props.children;
  expect(frame.props.style).toMatchObject({ width: 28, height: 28 });
  expect(frame.props.children.props.children[0].props).toMatchObject({
    size: 16,
    color: "accent-soft-foreground",
  });
});
it.each(["dates", "locations"] as const)(
  "bounds actual native %s popover rows with no parent query dependency",
  (kind) => {
    const render = component("events/EventTableSchedulePopover", "EventTableSchedulePopover", {
      "@board-game-organizer/shared": shared,
      "heroui-native/skeleton": { Skeleton: "Skeleton" },
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": { CalendarDays: "Calendar", MapPin: "Map" },
      "react-native": {
        FlatList: "FlatList",
        View: "View",
        useWindowDimensions: () => ({ width: 320, height: 640 }),
      },
      "@/components/common/ui/DateTimeInfo": { DateTimeInfo: "DateTimeInfo" },
      "@/components/common/ui/GroupedRow": { GroupedRow: "GroupedRow" },
      "@/components/common/ui/HelpPopover": { HelpPopover: "HelpPopover" },
      "@/lib/i18n": { useT: () => (id: string) => id },
    });
    const table = {
      ...plannedTable,
      eventSchedule: shared.eventRecordSchedulePreview(plannedEvent),
    };
    const popover = render({ table, kind });
    expect(popover.props.width).toBe(288);
    const list = popover.props.children;
    expect([
      list.props.initialNumToRender,
      list.props.maxToRenderPerBatch,
      list.props.windowSize,
    ]).toEqual([8, 6, 7]);
    expect(list.props.data).toHaveLength(1);
    expect(list.props.keyExtractor(list.props.data[0])).toBe(plannedEvent.locations[0].id);
    expect(list.props.renderItem({ item: list.props.data[0] })).toBeTruthy();
    const missing = render({ table: { ...table, eventSchedule: undefined }, kind }).props.children;
    expect(missing.props.ListEmptyComponent.type).toBe("Skeleton");
  },
);
it("keeps native manager, demonstrator, pending and waiting indicators cumulative", () => {
  const render = component("events/EventTableCardIndicators", "EventTableCardIndicators", {
    "@board-game-organizer/shared": { ...shared, useEventCutoff: () => false },
    "@lingui/react": { useLingui: () => ({ i18n: { number: (n: number) => String(n) } }) },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": {
      CalendarCheck: "Confirmed",
      CircleOff: "Disabled",
      Clock3: "Pending",
      Flag: "Terminated",
      Trophy: "Rating",
    },
    "react-native": { View: "View" },
    "@/components/common/ui/ArtworkStatusPopover": { ArtworkStatusPopover: "Role" },
    "@/components/common/ui/HelpPopover": { HelpPopover: "Help" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "@/lib/useCommunityApi": { useCommunityApi: () => ({ userId: "owner" }) },
    "./EventTableGamesPopover": { EventTableGamesPopover: "Games" },
    "./EventTableSchedulePopover": { EventTableSchedulePopover: "Schedule" },
  });
  const tree = render({
    table: {
      ...plannedTable,
      canManage: true,
      managementRole: "admin",
      demonstratorUserId: "owner",
      myRegistration: { ...seat("owner"), kind: "SELF", status: "PENDING" },
      myPosition: "WAITING",
    },
  });
  expect(
    tree.props.children
      .filter((node: Element) => node?.type === "Role")
      .map((node: Element) => node.props.kind),
  ).toEqual(["admin", "demonstrator", "request", "waiting"]);
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
