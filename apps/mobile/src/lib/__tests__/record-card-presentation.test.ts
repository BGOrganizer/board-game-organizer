import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import * as shared from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../web/src/test-fixtures/eventRecords";

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
      if (!(id in modules) && id === "heroui-native/hooks")
        return { useThemeColor: (tokens: string | string[]) => tokens };
      if (!(id in modules) && id === "@lingui/react")
        return { useLingui: () => ({ i18n: { _: (id: string) => id } }) };
      if (!(id in modules) && id === "@/components/common/ui/UserRoleBadge")
        return { UserRoleBadge: "UserRoleBadge" };
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
it.each(["planets", "constellation", "landscape"])(
  "preserves the original native %s illustration and colored sky in both compositions",
  (variant) => {
    const req = createRequire(import.meta.url);
    const render = component("common/ui/AnimatedDicebearArtwork", "AnimatedDicebearArtwork", {
      "@dicebear/core": req("@dicebear/core"),
      ...Object.fromEntries(
        ["planets", "constellation", "landscape", "shapes", "waves"].map((name) => [
          `@dicebear/styles/${name}.json`,
          req(`@dicebear/styles/${name}.json`),
        ]),
      ),
      react: { useMemo: (fn: () => unknown) => fn(), useEffect: () => {} },
      "react-native": { View: "View" },
      "react-native-reanimated": {
        __esModule: true,
        default: { View: "Animated.View" },
        useReducedMotion: () => false,
        useSharedValue: () => ({ get: () => 0, set: () => {} }),
        useAnimatedStyle: (fn: () => unknown) => fn(),
      },
      "react-native-svg": { SvgXml: "SvgXml" },
    });
    const cover = render({ seed: "stable", variant, presentation: "cover" });
    const coverXml = cover.props.children.props.children.props.xml as string;
    expect(cover.props.className).toBeUndefined();
    expect(coverXml).toMatch(/<rect[^>]*\bfill=/);
    const background = render({ seed: "stable", variant, presentation: "background" });
    expect(background.props.children.props.children.props.xml).toMatch(/<rect[^>]*\bfill=/);
    expect(background.props.children.props.children.props.xml).toBe(coverXml);
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
  expect(footer.props.children.props.children[0]).toBe(actions);
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
it("fits whole list artwork without overscan while leaving background artwork unchanged", () => {
  const source = readFileSync(
    new URL("../../components/common/ui/AnimatedDicebearArtwork.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain('presentation === "cover" ? "xMidYMid meet" : "xMidYMid slice"');
  expect(source).toContain('left: presentation === "cover" ? 4 : -4');
  expect(source).toContain("{ right: 4, bottom: 4 }");
});
it("stretches artwork along the left edge and keeps controls on one full-width horizontal row", () => {
  const render = component("common/ui/LinkedListCard", "LinkedListCard", {
    "heroui-native/card": { Card: { Body: "Card.Body" } },
    "react-native": {
      ScrollView: "ScrollView",
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
    actions: "Action",
    artworkLayout: "cover",
  });
  const body = tree.props.children[1] as Element;
  expect(body.props.style).toMatchObject({ alignItems: "stretch", padding: 0, gap: 0 });
  const [main, footer] = body.props.children as Element[];
  const [picture, content] = main.props.children as Element[];
  expect(main.props.style).toMatchObject({ flexDirection: "row", padding: 16, gap: 16 });
  expect(picture.props.style).toMatchObject({ width: 96, height: 96, position: "relative" });
  expect(picture.props.children).toBe("Artwork");
  expect(content.props.style.marginLeft).toBeUndefined();
  expect(content.props.children).toBe("Title");
  expect(footer.type).toBe("ScrollView");
  expect(footer.props.horizontal).toBe(true);
  expect(footer.props.style).toMatchObject({ height: 44, marginHorizontal: 12 });
  expect(footer.props.contentContainerStyle).toMatchObject({
    flexGrow: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  });
  expect(footer.props.contentContainerStyle.flexWrap).toBeUndefined();
  expect(footer.props.children.props.children).toEqual(["Icons", "Action"]);
});
it.each([
  ["admin", "warning", "Crown"],
  ["manager", "accent", "ShieldCheck"],
] as const)("gives native %s its own semantic color and icon", (kind, tone, icon) => {
  const render = component("common/ui/ArtworkStatusPopover", "ArtworkStatusPopover", {
    "heroui-native/hooks": { useThemeColor: (token: string) => token },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": { Crown: "Crown", ShieldCheck: "ShieldCheck" },
    "react-native": { View: "View" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "./HelpPopover": { HelpPopover: "HelpPopover" },
  });
  const popover = render({ kind, size: "compact" });
  expect(popover.props).toMatchObject({ size: "compact", tone, icon });
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
      "@/components/common/ui/ScheduleOptionsPopover": {
        ScheduleOptionsPopover: "ScheduleOptionsPopover",
      },
      "heroui-native/hooks": { useThemeColor: (token: string) => token },
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
    const adapter = render({ table, kind });
    const schedule = component("common/ui/ScheduleOptionsPopover", "ScheduleOptionsPopover", {
      "@board-game-organizer/shared": shared,
      "heroui-native/skeleton": { Skeleton: "Skeleton" },
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": { CalendarDays: "Calendar", MapPin: "Map" },
      "react-native": {
        FlatList: "FlatList",
        useWindowDimensions: () => ({ width: 320, height: 640 }),
      },
      "./DateTimeInfo": { DateTimeInfo: "DateTimeInfo" },
      "./GroupedRow": { GroupedRow: "GroupedRow" },
      "./HelpPopover": { HelpPopover: "HelpPopover" },
      "@/lib/i18n": { useT: () => (id: string) => id },
    });
    const popover = schedule(adapter.props);
    expect(popover.props.width).toBe(288);
    const list = popover.props.children;
    expect([
      list.props.initialNumToRender,
      list.props.maxToRenderPerBatch,
      list.props.windowSize,
    ]).toEqual([8, 6, 7]);
    expect(list.props.data).toHaveLength(1);
    expect(list.props.keyExtractor(list.props.data[0])).toBe(plannedEvent.locations[0].id);
    const row = list.props.renderItem({ item: list.props.data[0] });
    expect(row).toBeTruthy();
    if (kind === "locations") {
      const [icon, label] = row.props.children.props.children;
      expect(icon.type).toBe("Map");
      expect(icon.props).toMatchObject({ size: 16, color: "muted", accessible: false });
      expect(label.type).toBe("Typography");
      expect(label.props.children).toBe(plannedEvent.locations[0].address);
    }
    const missing = schedule(render({ table: { ...table, eventSchedule: undefined }, kind }).props)
      .props.children;
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
    "react-native": {
      View: "View",
      ScrollView: "ScrollView",
      useWindowDimensions: () => ({ height: 640 }),
    },
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
  ).toEqual(["demonstrator", "waiting"]);
  expect(
    tree.props.children
      .filter((node: Element) => node?.type === "Role")
      .map((node: Element) => node.props.label),
  ).not.toContain("Player with pending invitation");
});
it("keeps native Event admin/moderation, accepted, pending and demonstration independent", () => {
  const render = component("events/EventCardIndicators", "EventCardIndicators", {
    "@board-game-organizer/shared": { ...shared, useEventCutoff: () => false },
    "@lingui/react": { useLingui: () => ({ i18n: { number: (n: number) => String(n) } }) },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": {
      CalendarCheck: "Confirmed",
      CalendarClock: "Planning",
      Flag: "Terminated",
    },
    "react-native": {
      ScrollView: "ScrollView",
      useWindowDimensions: () => ({ width: 320, height: 640 }),
    },
    "@/components/common/ui/ArtworkStatusPopover": { ArtworkStatusPopover: "Role" },
    "@/components/common/ui/HelpPopover": { HelpPopover: "Status" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "./EventSchedulePopover": { EventSchedulePopover: "Schedule" },
  });
  const event = {
    ...plannedEvent,
    canManage: true,
    managementRole: "admin",
    myDemonstrator: true,
    myRegistrations: [
      seat("owner"),
      { ...seat("owner"), tableId: "second", kind: "INVITATION", status: "PENDING" },
    ],
  };
  const tree = render({ event });
  expect(
    tree.props.children
      .filter((node: Element) => node?.type === "Role")
      .map((node: Element) => node.props.kind),
  ).toEqual(["admin", "accepted", "pending", "demonstrator"]);
  for (const role of tree.props.children.filter((node: Element) => node?.type === "Role"))
    expect(role.props.size).toBe("compact");
  expect(
    tree.props.children.find((node: Element) => node?.props?.label === "Planning").props,
  ).toMatchObject({
    size: "compact",
    width: "content-fit",
    label: "Planning",
  });
  const moderator = render({ event: { ...event, managementRole: "moderator" } });
  expect(moderator.props.children[0].props).toMatchObject({
    kind: "manager",
    label: "Moderator",
  });
  const readOnly = render({ event: { ...event, readOnly: true } });
  expect(readOnly.props.children.filter((node: Element) => node?.type === "Role")).toHaveLength(0);
});
it.each(["admin", "moderator", "accepted", "invited", "requested", "none"] as const)(
  "retains native Group %s role and public/private status as separate compact controls",
  (role) => {
    const render = component("groups/GroupCardIndicators", "GroupCardIndicators", {
      "@board-game-organizer/shared": shared,
      "@lingui/react": {
        useLingui: () => ({
          i18n: { _: (d: { values: { count: number } }) => String(d.values.count) },
        }),
      },
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": {
        CircleCheck: "Check",
        CircleX: "Rejected",
        Clock3: "Pending",
        Globe: "Public",
        LockKeyhole: "Private",
      },
      "react-native": {
        ScrollView: "ScrollView",
        useWindowDimensions: () => ({ width: 320, height: 640 }),
      },
      "@/components/common/ui/ArtworkStatusPopover": { ArtworkStatusPopover: "Role" },
      "@/components/common/ui/HelpPopover": { HelpPopover: "Help" },
      "@/lib/i18n": { useT: () => (id: string) => id },
    });
    const group = { ...groupRecord, role };
    const privateTree = render({ group });
    expect(privateTree.props.children[1].props).toMatchObject({
      label: "Private",
      size: "compact",
      width: "content-fit",
      tone: "muted",
    });
    expect(privateTree.props.children[2]).toBeNull();
    if (role !== "none")
      expect(privateTree.props.children[0].props).toMatchObject({
        size: "compact",
        kind:
          role === "admin"
            ? "admin"
            : role === "moderator"
              ? "manager"
              : role === "accepted"
                ? "member"
                : role === "invited"
                  ? "invitation"
                  : "request",
      });
    else expect(privateTree.props.children[0]).toBeNull();
    const publicTree = render({ group: { ...group, type: "PUBLIC", reviewStatus: "PENDING" } });
    expect(publicTree.props.children[1].props).toMatchObject({ label: "Public", tone: "accent" });
    expect(publicTree.props.children[2].props).toMatchObject({
      label: "Awaiting review",
      tone: "warning",
    });
    const rejected = render({
      group: {
        ...group,
        type: "PUBLIC",
        reviewStatus: "REJECTED",
        rejectionReason: "Verify venue",
      },
    });
    expect(rejected.props.children[2].props).toMatchObject({
      label: "Changes rejected",
      tone: "danger",
    });
  },
);
it.each([
  ["admin", "Admin", "Crown", "warning"],
  ["moderator", "Moderator", "Shield", "accent"],
  [null, "Participant on the waiting list", "Player", "warning"],
  [undefined, "Participant on the waiting list", "Player", "warning"],
] as const)(
  "renders actual native participant @handles and %s avatar role without deriving permissions",
  (managementRole, label, icon, color) => {
    const render = component("events/EventParticipants", "EventParticipants", {
      "@board-game-organizer/shared": {
        ...shared,
        useEventParticipants: () => ({ items: [] }),
        useEventParticipantManagement: () => ({ canAct: () => false, isBusy: () => false }),
      },
      "heroui-native/button": { Button: "Button" },
      "heroui-native/hooks": { useThemeColor: (tokens: string[]) => tokens },
      "heroui-native/skeleton": { Skeleton: "Skeleton" },
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": {
        Ban: "Ban",
        Crown: "Crown",
        ShieldCheck: "Shield",
        UserRoundCheck: "Player",
        UserRoundMinus: "Remove",
      },
      "react-native": { FlatList: "FlatList", View: "View" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
      "@/components/common/ui/ConfirmDialog": { ConfirmDialog: "ConfirmDialog" },
      "@/components/common/ui/GroupBanDialog": { GroupBanDialog: "GroupBanDialog" },
      "@/components/common/ui/GroupedList": { GroupedList: "GroupedList" },
      "@/components/common/ui/MemberActions": { MemberActions: "MemberActions" },
      "@/components/common/ui/UserListRow": { UserListRow: "UserListRow" },
      "@/lib/i18n": { useT: () => (id: string) => id },
      "@/lib/useCommunityApi": { useCommunityApi: () => ({ userId: "viewer" }) },
    });
    const list = render({ event: plannedEvent, actions: {} }).props.children[0];
    const row = list.props.renderItem({
      item: {
        userId: "target",
        name: "Full name",
        username: "@handle",
        avatarUrl: null,
        position: "WAITING",
        managementRole,
      },
    }).props.children;
    expect(row.props.name).toBe("@handle");
    expect(row.props.secondary).toBe(label);
    expect(row.props.badgeContent.type).toBe("UserRoleBadge");
    expect(row.props.badgeContent.props.roles).toContain("waitingParticipant");
    expect(row.props.badgeContent.props.roles).toContain("acceptedParticipant");
    if (managementRole) expect(row.props.badgeContent.props.roles[0]).toBe(managementRole);
    expect(row.props.badge).toBeUndefined();
    expect(row.props.actions.props.items).toEqual([]);
  },
);
it.each([
  ["admin", "Admin"],
  ["moderator", "Moderator"],
  ["member", "Accepted member"],
  ["pending", "Member with pending invitation"],
] as const)("renders actual native Group %s under a normalized @handle", (kind, label) => {
  const render = component("groups/GroupMembers", "GroupMembers", {
    "@board-game-organizer/schemas": { notificationItemId: () => "item" },
    "@board-game-organizer/shared": {
      ...shared,
      useGroupMemberManagement: () => ({ list: { items: [] }, isBusy: () => false }),
    },
    "@lingui/react": { useLingui: () => ({ i18n: { locale: "en" } }) },
    "expo-router": { useRouter: () => ({}), useFocusEffect: () => {} },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/hooks": { useThemeColor: (tokens: string[]) => tokens },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": Object.fromEntries(
      [
        "Ban",
        "Check",
        "ClipboardCheck",
        "Clock3",
        "Crown",
        "EllipsisVertical",
        "RotateCcw",
        "ShieldCheck",
        "UserRoundMinus",
        "UserRoundPlus",
        "UsersRound",
        "X",
      ].map((name) => [name, name]),
    ),
    react: {
      useCallback: (f: unknown) => f,
      useEffect: () => {},
      useRef: (value: unknown) => ({ current: value }),
      useState: (value: unknown) => [value, () => {}],
    },
    "react-native": { View: "View", AppState: { currentState: "active" } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    ...Object.fromEntries(
      [
        "AddUserRow",
        "ConfirmDialog",
        "GroupBanDialog",
        "HelpPopover",
        "UserActionsSheet",
        "UserList",
        "UserListRow",
      ].map((name) => [`@/components/common/ui/${name}`, { [name]: name }]),
    ),
    "@/components/notifications/NotificationAttentionScope": {
      NotificationAttentionScope: "Scope",
    },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "@/lib/useCommunityApi": { useCommunityApi: () => ({ userId: "viewer" }) },
    "./GroupMemberActions": { GroupMemberActions: "Actions" },
    "./GroupMemberAttention": { GroupMemberAttention: "Attention" },
  });
  const tree = render({ group: groupRecord });
  const children = Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children];
  const list = children.find((node: Element) => node?.type === "UserList");
  const row = list.props.renderRow({
    userId: "target",
    username: "@handle",
    name: "Full name",
    isAdmin: kind === "admin",
    membership:
      kind === "admin"
        ? null
        : {
            status: kind === "pending" ? "PENDING" : "ACCEPTED",
            role: kind === "moderator" ? "MODERATOR" : "MEMBER",
            kind: "INVITATION",
          },
    ban: null,
  });
  expect(row.props.name).toBe("@handle");
  expect(row.props.secondary).toBe(label);
});
it("renders native identities directly over artwork with a single accessible horizontal toolbar", () => {
  const render = component("common/ui/RecordIdentityCard", "RecordIdentityCard", {
    "heroui-native/text": { Typography: "Typography" },
    "react-native": { View: "View", ScrollView: "ScrollView" },
    "./ListCard": { ListCard: "ListCard" },
  });
  const tree = render({
    title: "Identity",
    icon: "Icon",
    background: "Artwork",
    children: "Indicators",
  });
  expect(tree.props.background).toBe("Artwork");
  const [title, toolbar] = tree.props.children.props.children;
  expect(title.props.children[1].props).toMatchObject({
    accessibilityRole: "header",
    children: "Identity",
  });
  expect(toolbar.type).toBe("ScrollView");
  expect(toolbar.props.horizontal).toBe(true);
  expect(toolbar.props.style.height).toBe(44);
  expect(toolbar.props.children).toBe("Indicators");
  const card = component("common/ui/ListCard", "ListCard", {
    "heroui-native/card": { Card: { Body: "Card.Body" } },
    "react-native": { View: "View" },
  });
  const background = card({ background: "Artwork", children: "Identity" });
  expect(background.props.children).toHaveLength(2);
  expect(background.props.children[1].props.children).toBe("Identity");
  expect(tree.props.children.props.className).not.toBe("bg-background/90");
  expect(tree.props.children.props.style.flexWrap).toBeUndefined();
  expect(toolbar.props.style.maxWidth).toBe("60%");
  expect(title.props.style.flex).toBe(1);
});
it("requires a scroll in the current Results owner scope and rejects detached native callbacks", () => {
  let actor = "owner";
  const scrolled = { current: null as string | null },
    loadMore = vi.fn();
  const render = component("events/EventTableResults", "EventTableResults", {
    "@board-game-organizer/shared": {
      ...shared,
      useTableLeaderboard: () => ({ items: [], loadMore }),
    },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    react: { useMemo: (fn: () => unknown) => fn(), useRef: () => scrolled },
    "react-native": { FlatList: "FlatList", View: "View" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "@/components/common/ui/GroupedList": { GroupedList: "GroupedList" },
    "@/components/common/ui/UserListRow": { UserListRow: "UserListRow" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "@/lib/useCommunityApi": {
      useCommunityApi: () => ({ apiUrl: "https://api.test", userId: actor }),
    },
    "./EventPlayerRatingPopover": { EventPlayerRatingPopover: "Rating" },
  });
  const table = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 1, playerIds: ["owner"], startsAt: plannedTable.createdAt },
  };
  const first = render({ table });
  first.props.onEndReached();
  expect(loadMore).not.toHaveBeenCalled();
  first.props.onScrollBeginDrag();
  first.props.onEndReached();
  expect(loadMore).toHaveBeenCalledTimes(1);
  actor = "other";
  const second = render({ table });
  second.props.onEndReached();
  expect(loadMore).toHaveBeenCalledTimes(1);
  second.props.onScrollBeginDrag();
  first.props.onEndReached();
  expect(loadMore).toHaveBeenCalledTimes(1);
  second.props.onEndReached();
  expect(loadMore).toHaveBeenCalledTimes(2);
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
