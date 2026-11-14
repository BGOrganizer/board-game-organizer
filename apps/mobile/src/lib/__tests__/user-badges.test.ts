import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { RECORD_USER_ROLES } from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";

type Element = { type: any; props: Record<string, any> };
function load(file: string, name = file) {
  const output: Record<string, (props: any) => Element> = {};
  const jsx = (type: any, props: any) => ({ type, props });
  const compound = (name: string) =>
    Object.assign(
      () => {},
      Object.fromEntries(
        ["Image", "Fallback", "Trigger", "Portal", "Overlay", "Content", "Title"].map((part) => [
          part,
          `${name}.${part}`,
        ]),
      ),
    );
  const modules: Record<string, any> = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": {
      View: "View",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      useWindowDimensions: () => ({ height: 640 }),
    },
    "heroui-native/chip": { Chip: "Chip" },
    "heroui-native/avatar": { Avatar: compound("Avatar") },
    "heroui-native/popover": { Popover: compound("Popover") },
    "heroui-native/hooks": { useThemeColor: (tokens: string | string[]) => tokens },
    "heroui-native/text": { Typography: "Typography" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "@board-game-organizer/shared": { RECORD_USER_ROLES },
    "./IconBadge": { IconBadge: "IconBadge" },
    "./UserAvatar": { UserAvatar: "UserAvatar" },
    "@/components/common/ui/UserAvatar": { UserAvatar: "UserAvatar" },
    "@/components/common/ui/IconBadge": { IconBadge: "IconBadge" },
    "@/components/common/ui/ListCard": { ListCard: "ListCard" },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "./GameRating": { GameRating: "GameRating" },
    "./GroupedRow": { GroupedRow: "GroupedRow" },
    "lucide-react-native": Object.fromEntries(
      [
        "Plus",
        "Trophy",
        "Ban",
        "UserRoundCheck",
        "UserRoundPlus",
        "UsersRound",
        "Crown",
        "Clock3",
        "ListOrdered",
        "Mail",
        "Presentation",
        "ShieldCheck",
      ].map((key) => [key, key]),
    ),
  };
  const source = readFileSync(
    new URL(`../../components/common/ui/${file}.tsx`, import.meta.url),
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
      require: (id: string) => {
        if (!(id in modules)) throw new Error(`Unexpected dependency ${id}`);
        return modules[id];
      },
    },
  );
  return output[name];
}

it("provides static, action and popover modes with the same 22px visual and 13px icon", () => {
  const render = load("IconBadge");
  const info = render({ icon: "Crown", label: "Admin" });
  expect(info.props.accessibilityRole).toBe("image");
  const chip = info.props.children;
  expect(chip.props.style).toMatchObject({ width: 22, height: 22, borderRadius: 11 });
  expect(chip.props.variant).toBe("secondary");
  expect(chip.props.style.backgroundColor).toBe("default");
  expect(chip.props.children[0].props).toMatchObject({ size: 13, color: "default-foreground" });
  expect(chip.props.children[1]).toBeNull();
  const press = vi.fn(),
    stopPropagation = vi.fn();
  const action = render({
    icon: "Crown",
    label: "Lock player",
    color: "danger",
    onPress: press,
    isDisabled: true,
    multiple: true,
    testID: "seat-order-lock-owned",
  });
  expect(info.props.pointerEvents).toBe("none");
  expect(chip.props.disabled).toBe(true);
  expect(chip.props.onPress).toBeUndefined();
  expect(chip.props.accessible).toBe(false);
  expect(action.type).toBe("View");
  expect(action.props.style).toMatchObject({ width: 44, height: 44 });
  const actionChip = action.props.children;
  expect(actionChip.type).toBe("Chip");
  expect(actionChip.props.testID).toBe("seat-order-lock-owned");
  expect(actionChip.props.disabled).toBe(true);
  expect(actionChip.props.accessibilityRole).toBe("button");
  expect(actionChip.props.accessibilityState).toEqual({ disabled: true });
  expect(actionChip.props.hitSlop).toBe(11);
  expect(actionChip.props.style.width + actionChip.props.hitSlop * 2).toBe(44);
  expect(actionChip.props.variant).toBe("secondary");
  expect(actionChip.props.style.backgroundColor).toBe(chip.props.style.backgroundColor);
  expect(actionChip.props.style.opacity).toBeUndefined();
  actionChip.props.onPress({ stopPropagation });
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(press).toHaveBeenCalledOnce();
  const [icon, plus] = actionChip.props.children;
  expect(icon.props.color).toBe("danger-soft-foreground");
  expect(plus.props.children.props.color).toBe(icon.props.color);
  expect(icon.props.opacity).toBe(0.5);
  expect(plus.props.style.backgroundColor).toBe(chip.props.style.backgroundColor);
  expect(plus.props.style).toMatchObject({
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
  });
  expect(plus.props.style.top + plus.props.style.height).toBeLessThanOrEqual(22);
  expect(plus.props.style.right + plus.props.style.width).toBeLessThanOrEqual(22);
  const popover = render({
    icon: "Crown",
    label: "Admin",
    title: "Roles",
    children: "Explanation",
  });
  expect(popover.props.children.props.style).toMatchObject({ width: 44, height: 44 });
  const [trigger, portal] = popover.props.children.props.children;
  expect(trigger.props.children.type).toBe("Chip");
  expect(trigger.props.children.props.disabled).toBeFalsy();
  expect(trigger.props.children.props.accessibilityState).toEqual({ disabled: false });
  expect(trigger.props.children.props.style.backgroundColor).toBe("default");
  trigger.props.children.props.onPress({ stopPropagation });
  expect(portal.props.children[1].props.children[0].props.children).toBe("Roles");
  expect(portal.props.children[1].props.children[1]).toBe("Explanation");
});

it("keeps online status and separates role/lock targets by 44px using only dual-badge spacing", () => {
  const render = load("UserAvatar");
  const bare = render({ name: "@Alex" });
  expect(bare.props.style).toMatchObject({ marginRight: 0, marginTop: 0, marginBottom: 0 });
  expect(bare.props.children[0].props.children[1].props.children).toBe("A");
  const empty = render({ name: "", avatarUrl: "/avatar" });
  expect(empty.props.children[0].props.children[1].props.children).toBe("?");
  const single = render({
    name: "Alex",
    online: false,
    badge: {
      icon: "Crown",
      label: "Friends",
      color: "success",
      description: "Friendship accepted.",
    },
  });
  expect(single.props.style).toMatchObject({ marginTop: 0, marginBottom: 12 });
  expect(single.props.children[1].props.style).toMatchObject({
    right: -1,
    backgroundColor: "muted",
  });
  expect(single.props.children[2].props.children.props.children.props.children).toBe(
    "Friendship accepted.",
  );
  const fallback = render({
    name: "Alex",
    badge: { icon: "Crown", label: "Friends", color: "success" },
  });
  expect(fallback.props.children[2].props.children.props.children.props.children).toBe("Friends");
  const dual = render({
    name: "Alex",
    online: true,
    badgeContent: "Roles",
    topBadgeContent: "Lock",
  });
  expect(dual.props.style).toMatchObject({ marginTop: 8, marginBottom: 8, marginRight: 12 });
  expect(dual.props.style.isolation).toBe("isolate");
  expect(dual.props.children[0].props.style.zIndex).toBe(0);
  const [, online, bottom, top] = dual.props.children;
  expect(online.props.style).toMatchObject({ left: -1, backgroundColor: "success" });
  expect(bottom.props.style).toMatchObject({ bottom: -20, right: -20, zIndex: 2 });
  expect(top.props.style).toMatchObject({ top: -20, right: -20, zIndex: 2 });
  expect(48 - top.props.style.top - bottom.props.style.bottom).toBe(88);
  const topOnly = render({ name: "Alex", topBadgeContent: "Lock" });
  expect(topOnly.props.style.marginRight).toBe(12);
});

it("does not invent relationships and retains every independently supplied relationship explanation", () => {
  const render = load("UserRelationshipBadge");
  expect(render({ user: {} })).toBeNull();
  expect(
    render({
      user: { isFriend: false, blockedByMe: false, isFollowing: false, isFollower: false },
    }),
  ).toBeNull();
  const all = render({
    user: { blockedByMe: true, isFriend: true, isFollowing: true, isFollower: true },
  });
  expect(all.props.multiple).toBe(true);
  expect(all.props.color).toBe("danger");
  expect(
    all.props.children.props.children.map((fact: Element) => fact.props.children[1].props.children),
  ).toEqual([
    "People you have blocked.",
    "Friendship accepted.",
    "People you follow.",
    "People who follow you.",
  ]);
  expect(render({ user: { isFriend: true } }).props.multiple).toBe(false);
});

it("keeps role facts in a bounded explanation and no role means no control", () => {
  const render = load("UserRoleBadge");
  expect(render({ roles: [] })).toBeNull();
  const role = render({ roles: ["moderator"] });
  expect(role.props).toMatchObject({
    color: "accent",
    multiple: false,
    title: "Roles and participation",
  });
  const all = render({
    roles: [
      "admin",
      "moderator",
      "demonstrator",
      "invitedPlayer",
      "waitingPlayer",
      "confirmedPlayer",
    ],
  });
  expect(all.props.multiple).toBe(true);
  expect(all.props.children.props.style.maxHeight).toBe(320);
  expect(all.props.children.props.children).toHaveLength(6);
});

it("passes both avatar controls through the list row without changing row selection", () => {
  const render = load("UserListRow");
  const press = vi.fn();
  const tree = render({
    name: "Alex",
    badgeContent: "Roles",
    topBadgeContent: "Lock",
    onPress: press,
    isDisabled: true,
    actions: "Menu",
  });
  const identity = tree.props.children[0];
  expect(identity.props.accessibilityRole).toBe("button");
  expect(identity.props.disabled).toBe(true);
  expect(identity.props.children[0].props).toMatchObject({
    badgeContent: "Roles",
    topBadgeContent: "Lock",
  });
  expect(tree.props.children[1].props.children).toBe("Menu");
  const plain = render({ name: "Alex" });
  expect(plain.props.children[0].props.accessibilityRole).toBeUndefined();
  expect(plain.props.children[1]).toBeNull();
});

it.each(["en", "it"])(
  "validates real badge acceptance fixture inputs before navigation (%s)",
  (locale) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/user-badge-inputs.js", import.meta.url),
      "utf8",
    );
    const inputs = {
      BADGE_LOCALE: locale,
      BADGE_GROUP_ID: "00000000-0000-4000-8000-000000000001",
      BADGE_EVENT_ID: "00000000-0000-4000-8000-000000000002",
      BADGE_TABLE_ID: "00000000-0000-4000-8000-000000000003",
      BADGE_RELATIONSHIP_LABEL: "Friends",
      BADGE_RELATIONSHIP_EXPLANATION: "Friendship accepted.",
      BADGE_GROUP_ROLE_LABEL: "Admin",
      BADGE_ROLE_LABEL: "Admin · Accepted participant",
    };
    const check = (patch: Record<string, string> = {}) => {
      const output: { badges?: { contacts: string; table: string; group: string; roles: string } } =
        {};
      runInNewContext(source, { ...inputs, ...patch, output });
      return output.badges;
    };
    expect(check()?.table).toBe(
      `bgo-dev:///event/table?eventId=${inputs.BADGE_EVENT_ID}&tableId=${inputs.BADGE_TABLE_ID}`,
    );
    expect(check()?.roles).toBe(
      locale === "it" ? "Ruoli e partecipazione" : "Roles and participation",
    );
    for (const key of Object.keys(inputs)) expect(() => check({ [key]: "" })).toThrow();
    expect(() => runInNewContext(source, { output: {} })).toThrow();
  },
);

it.each([1, 2, null, undefined])(
  "keeps native score position %s visible with an explanatory avatar control",
  (rank) => {
    const render = load("../../ratings/ScoreIdentity", "ScoreIdentity");
    const player = {
      id: "player",
      name: "Player",
      username: "handle",
      email: null,
      avatarUrl: null,
    };
    const tree = render({ player, rank });
    const [avatar, metadata] = tree.props.children;
    expect(avatar.type).toBe("UserAvatar");
    expect(avatar.props.name).toBe(player.name);
    if (rank != null) {
      expect(avatar.props.badgeContent.props).toMatchObject({
        icon: rank === 1 ? "Trophy" : "ListOrdered",
        color: rank === 1 ? "success" : "default",
        title: "Position",
        label: `Position: #${rank}`,
      });
      expect(metadata.props.children[1].props.children).toBe(`Position: #${rank}`);
    } else {
      expect(avatar.props.badgeContent).toBeUndefined();
      expect(metadata.props.children[1]).toBeNull();
    }
    expect(metadata.props.children[2].props.children).toBe("handle");
    const rating = { userId: "player", score: 501, delta: 1, provisional: false };
    const rated = render({ player, rank, showGameRating: true, gameRating: rating });
    expect(rated.props.children[1].props.children[2].props).toMatchObject({
      rating,
      showDelta: true,
    });
    const unknown = render({ player: { ...player, name: "", username: null } });
    expect(unknown.props.children[0].props.name).toBe("?");
    expect(unknown.props.children[1].props.children[2].props.children).toBe("Username unavailable");
  },
);

it("uses the shared native avatar in player cards without inventing badge facts", () => {
  const render = load("../../events/EventPlayerCard", "EventPlayerCard");
  const card = render({
    name: "Player",
    avatarUrl: "/avatar",
    username: "handle",
    children: "Stats",
  });
  const identity = card.props.children.props.children[0];
  expect(identity.props.children[0].type).toBe("UserAvatar");
  expect(identity.props.children[0].props).toMatchObject({ name: "Player", avatarUrl: "/avatar" });
  expect(identity.props.children[0].props.badgeContent).toBeUndefined();
  expect(identity.props.children[1].props.children[1].props.children).toBe("@handle");
  const loading = render({ name: undefined, avatarUrl: null });
  expect(loading.props.children.props.children[0].type).toBe("Skeleton");
});
