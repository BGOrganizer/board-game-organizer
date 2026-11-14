import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import {
  formatUsername,
  groupLeaderboardRoles,
  RECORD_USER_ROLES,
} from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: unknown; props: Record<string, any> };
// Real JSX/props with host primitives replaced, not native geometry/touch acceptance.
function load(file: string, name: string, modules: Record<string, unknown>, expose = false) {
  const text = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  const exports: Record<string, (props: any) => Element> = {};
  const jsx = (type: unknown, props: any) => ({ type, props });
  const code = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  runInNewContext(code + (expose ? `\nexports.${name} = ${name};` : ""), {
    exports,
    require: (id: string) => {
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (!(id in modules)) throw new Error(`Unexpected dependency ${id}`);
      return modules[id];
    },
  });
  return exports[name];
}
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return value && typeof value === "object" && "props" in value
    ? [value, ...nodes(value.props.children)]
    : [];
}
it.each([
  ["primary", "accent-foreground"],
  ["danger-soft", "danger-soft-foreground"],
  ["ghost", "muted"],
] as const)(
  "keeps the interactive header help %s variant on its semantic foreground pair",
  (triggerVariant, color) => {
    const render = load("common/ui/HelpPopover", "HelpPopover", {
      "heroui-native/button": { Button: "Button" },
      "heroui-native/hooks": { useThemeColor: (token: string) => token },
      "heroui-native/popover": {
        Popover: Object.assign("Popover", {
          Trigger: "Trigger",
          Portal: "Portal",
          Overlay: "Overlay",
          Content: "Content",
          Title: "Title",
        }),
      },
      "lucide-react-native": { CircleHelp: "Help" },
      "react-native": { View: "View" },
    });
    const tree = nodes(
      render({
        label: "Action unavailable",
        triggerVariant,
        triggerClassName: "opacity-60",
        children: "Reason",
      }),
    );
    const button = tree.find((n) => n.type === "Button");
    expect(button?.props).toMatchObject({
      variant: triggerVariant,
      className: "opacity-60",
      style: { minWidth: 44, minHeight: 44 },
    });
    expect(button?.props.isDisabled).toBeUndefined();
    expect(tree.find((n) => n.type === "Help")?.props).toMatchObject({ size: 20, color });
    expect(tree.find((n) => n.type === "Content")).toBeTruthy();
  },
);
it.each([false, undefined, true])(
  "keeps finalization readiness=%s on the same primary Flag action without losing safety guards",
  (resultsReady) => {
    const render = load("events/EventFinalizeAction", "EventFinalizeAction", {
      "@board-game-organizer/shared": {
        canManageEvent: () => true,
        eventRecordKeys: { mutation: () => [] },
        eventRecordVisibility: () => "PUBLIC",
        useClientMutationDraft: () => undefined,
        useEventRecordActions: () => ({ busy: false }),
      },
      "heroui-native/button": { Button: "Button" },
      "heroui-native/hooks": { useThemeColor: (token: string) => token },
      "heroui-native/switch": { Switch: "Switch" },
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": { Flag: "Flag" },
      react: { useRef: (current: unknown) => ({ current }), useState: () => [null, vi.fn()] },
      "react-native": { View: "View" },
      "@/components/common/layout/headerStyles": { HEADER_ICON_SIZE: 20, headerButtonProps: {} },
      "@/components/common/ui/ConfirmDialog": { ConfirmDialog: "ConfirmDialog" },
      "@/components/common/ui/HelpPopover": { HelpPopover: "HelpPopover" },
      "@/lib/i18n": { useT: () => (message: string) => message },
      "@/lib/useCommunityApi": {
        useCommunityApi: () => ({ userId: "owner", apiUrl: "https://api.test" }),
      },
    });
    const tree = nodes(
      render({
        event: { id: "event", status: "CONFIRMED", version: 1, canFinalize: true, resultsReady },
      }),
    );
    const help = tree.find((node) => node.type === "HelpPopover");
    const action = tree.find((node) => node.type === "Button");
    if (resultsReady === true) {
      expect(help).toBeUndefined();
      expect(action?.props).toMatchObject({
        variant: "primary",
        isDisabled: false,
        testID: "event-finalize-results",
      });
    } else {
      expect(action).toBeUndefined();
      expect(help?.props).toMatchObject({
        icon: "Flag",
        triggerVariant: "primary",
        triggerClassName: "opacity-60",
      });
      expect(help?.props.isDisabled).toBeUndefined();
      expect(help?.props.onPress).toBeUndefined();
    }
    expect(tree.some((node) => node.type === "ConfirmDialog")).toBe(false);
  },
);
it.each(["ADMIN", "MODERATOR", "MEMBER", null, undefined] as const)(
  "renders username plus authoritative %s role without showing real-name secondary text",
  (groupRole) => {
    const render = load(
      "groups/GroupLeaderboard",
      "PlayerRow",
      {
        "@board-game-organizer/shared": {
          formatUsername,
          groupLeaderboardRoles,
          RECORD_USER_ROLES,
        },
        "@lingui/react": { useLingui: vi.fn() },
        "expo-constants": { default: {} },
        "heroui-native/button": { Button: "Button" },
        "heroui-native/hooks": { useThemeColor: (key: string) => key },
        "heroui-native/skeleton": { Skeleton: "Skeleton" },
        "heroui-native/text": { Typography: "Typography" },
        "lucide-react-native": { Clock3: "Clock", Dices: "Dices" },
        react: { useEffect: vi.fn(), useState: vi.fn() },
        "react-native": { FlatList: "FlatList", View: "View" },
        "@/components/common/ui/EmptyList": { EmptyList: "Empty" },
        "@/components/common/ui/SearchHelpLabel": { SearchHelpLabel: "SearchHelp" },
        "@/components/common/ui/SearchInput": { SearchInput: "Search" },
        "@/components/common/ui/UserAvatar": { UserAvatar: "UserAvatar" },
        "@/components/common/ui/UserRoleBadge": { UserRoleBadge: "UserRoleBadge" },
        "@/components/ratings/LeaderboardStat": { LeaderboardStat: "Stat" },
        "@/components/ratings/RatingGameSelect": { RatingGameSelect: "Picker" },
        "@/lib/i18n": { useT: vi.fn() },
        "@/lib/useSessionAuth": { useSessionAuth: vi.fn() },
      },
      true,
    );
    const tree = nodes(
      render({
        player: {
          name: "Private Full Name",
          username: "@@handle",
          avatarUrl: null,
          groupRole,
          left: false,
          rating: 510,
          gamesPlayed: 2,
          gamesWon: 1,
          nd: 0,
        },
        t: (id: string) => id,
        format: new Intl.NumberFormat("en"),
      }),
    );
    expect(tree.some((n) => n.props.children === "@handle")).toBe(true);
    expect(tree.some((n) => n.props.children === "Private Full Name")).toBe(false);
    const avatar = tree.find((n) => n.type === "UserAvatar");
    expect(avatar?.props.name).toBe("@handle");
    const roles = groupLeaderboardRoles({ left: false, groupRole });
    if (roles.length) {
      expect(avatar?.props.badgeContent.props.roles).toEqual(roles);
      expect(tree.some((n) => n.props.children === RECORD_USER_ROLES[roles[0]].message)).toBe(true);
    } else expect(avatar?.props.badgeContent).toBeUndefined();
  },
);
it.each([0, 600])(
  "bounds the real game-list viewport and indicator inside its padded popover with keyboard=%s",
  (keyboardHeight) => {
    const render = load("ratings/RatingGameSelect", "RatingGameSelect", {
      "heroui-native/button": { Button: "Button" },
      "heroui-native/hooks": { useThemeColor: (token: string) => token },
      "heroui-native/select": {
        Select: Object.assign("Select", {
          Trigger: "Trigger",
          TriggerIndicator: "Indicator",
          Portal: "Portal",
          Overlay: "Overlay",
          Content: "Content",
          Item: "Item",
          ItemIndicator: "ItemIndicator",
        }),
      },
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": { X: "X" },
      "react-native": { useWindowDimensions: () => ({ height: 800 }), View: "View" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) },
      "@/components/common/ui/InputFlatList": { InputFlatList: "InputFlatList" },
      "@/lib/i18n": { useT: () => (id: string) => id },
      "@/lib/useKeyboardHeight": { useKeyboardHeight: () => keyboardHeight },
      "./LeaderboardGameCover": { LeaderboardGameCover: "Cover" },
    });
    const tree = nodes(
      render({ selectedId: null, games: [], onChange: vi.fn(), children: "Search" }),
    );
    const content = tree.find((n) => n.type === "Content"),
      list = tree.find((n) => n.type === "InputFlatList");
    expect(content?.props.style).toMatchObject({
      height: keyboardHeight ? 132 : 320,
      maxHeight: keyboardHeight ? 132 : 320,
      overflow: "hidden",
    });
    expect(list?.props.style).toMatchObject({ flex: 1, minHeight: 0, width: "100%" });
    expect(list?.props.style).not.toHaveProperty("height");
    expect(list?.props.keyboardAvoidance).toBe("external");
  },
);
