import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Node = { type: string; props: Record<string, any> };
function load(file: string, name: string, modules: Record<string, unknown>) {
  const exports: Record<string, (props: any) => Node> = {};
  const jsx = (type: string, props: any, key?: string) => ({ type, props, key });
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8"),
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
      require: (id: string) => {
        if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
        if (!(id in modules)) throw new Error(`Unexpected module ${id}`);
        return modules[id];
      },
    },
  );
  return exports[name];
}
function nodes(value: any): Node[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  return [value, ...nodes(value.props?.children)];
}
function setup() {
  const slots: any[] = [];
  let cursor = 0;
  const cleanups: (() => void)[] = [];
  const options = {
    apiUrl: "https://owned-api.test",
    userId: "owner",
    enabled: true,
    getToken: vi.fn(),
    feedback: {},
  };
  const share = vi.fn().mockResolvedValue({ action: "sharedAction" });
  const invite: any = { isPending: false, isError: false, data: undefined, mutate: vi.fn() };
  const useInvites = vi.fn(() => invite);
  const component = load("invites/TableInviteLinkRow", "TableInviteLinkRow", {
    react: {
      useRef: (initial: unknown) => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = { current: initial };
        return slots[i];
      },
      useState: (initial: unknown) => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = initial;
        return [
          slots[i],
          (next: unknown) => {
            slots[i] = next;
          },
        ];
      },
      useEffect: (fn: () => () => void) => {
        const i = cursor++;
        if (!(i in slots)) {
          slots[i] = true;
          cleanups.push(fn());
        }
      },
    },
    "@board-game-organizer/shared": { useInvites },
    "react-native": { View: "View", Share: { share } },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/hooks": { useThemeColor: () => ["foreground", "muted"] },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/text": { Typography: "Typography" },
    "lucide-react-native": {
      UserPlus: "UserPlus",
      UserRoundPlus: "UserRoundPlus",
      Share2: "Share2",
    },
    "@/components/common/ui/GroupedList": { GroupedList: "GroupedList" },
    "@/components/common/ui/GroupedRow": { GroupedRow: "GroupedRow" },
    "@/lib/i18n": { useT: () => (id: string) => id },
    "@/lib/useCommunityApi": { useCommunityApi: () => options },
  });
  let tree: Node;
  const render = (props: any = {}) => {
    cursor = 0;
    tree = component({ tableId: "table", ...props });
    return tree;
  };
  const find = (id: string) => nodes(tree).find((n) => n.props?.testID === id);
  const press = () => find("generate-table-invite-link")?.props.onPress();
  render();
  return {
    options,
    invite,
    useInvites,
    share,
    render,
    find,
    press,
    unmount: () => {
      for (const fn of cleanups) fn();
    },
    all: () => nodes(tree),
  };
}
// Executes actual native JSX/callbacks with host primitives replaced. Device/Share UI remains Maestro acceptance.
describe("native contextual Table invite row", () => {
  it("uses the Contacts generation action, fresh-token options and full native share link", async () => {
    const s = setup();
    expect(s.useInvites).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: "table",
        userId: "owner",
        token: null,
        getToken: s.options.getToken,
      }),
    );
    expect(s.find("generate-table-invite-link")?.props).toMatchObject({
      size: "sm",
      variant: "outline",
      style: { minWidth: 44, minHeight: 44 },
      accessibilityLabel: "Generate invite",
    });
    expect(s.all().find((n) => n.type === "UserPlus")?.props).toMatchObject({
      size: 18,
      color: "foreground",
    });
    s.press();
    s.press();
    expect(s.invite.mutate).toHaveBeenCalledTimes(1);
    const callbacks = s.invite.mutate.mock.calls[0][1];
    callbacks.onSuccess({ link: "https://owned-api.test/invite/opaque-token" });
    expect(s.share).toHaveBeenCalledWith({ message: "https://owned-api.test/invite/opaque-token" });
    callbacks.onSettled();
    s.invite.data = { link: "https://owned-api.test/invite/opaque-token" };
    s.render();
    expect(s.find("table-invite-link-value")?.props).toMatchObject({
      selectable: true,
      children: s.invite.data.link,
      accessibilityLabel: "Invite link",
    });
    s.find("share-table-invite-link")?.props.onPress();
    expect(s.share).toHaveBeenCalledTimes(2);
    expect(s.invite.mutate).toHaveBeenCalledTimes(1);
  });
  it.each(["pending", "disabled", "anonymous", "session-disabled"])(
    "guards %s creation and sharing",
    (mode) => {
      const s = setup();
      if (mode === "pending") s.invite.isPending = true;
      if (mode === "anonymous") s.options.userId = "";
      if (mode === "session-disabled") s.options.enabled = false;
      s.invite.data = { link: "link" };
      s.render({ disabled: mode === "disabled" });
      s.press();
      s.find("share-table-invite-link")?.props.onPress();
      expect(s.find("generate-table-invite-link")?.props.isDisabled).toBe(true);
      expect(s.invite.mutate).not.toHaveBeenCalled();
      expect(s.share).not.toHaveBeenCalled();
    },
  );
  it("shows a bounded skeleton and observable create failure, and permits retry", () => {
    const s = setup();
    s.invite.isPending = true;
    s.render();
    expect(s.all().find((n) => n.type === "Skeleton")?.props.style).toMatchObject({
      height: 14,
      width: "80%",
    });
    s.invite.isPending = false;
    s.invite.isError = true;
    s.render();
    expect(s.all().find((n) => n.props?.accessibilityRole === "alert")?.props.children).toBe(
      "Could not create the invite. Try again.",
    );
    s.press();
    expect(s.invite.mutate).toHaveBeenCalledTimes(1);
  });
  it("retains the generated link after native share failure and allows sharing again", async () => {
    const s = setup();
    s.invite.data = { link: "link" };
    s.share.mockRejectedValueOnce(new Error("share failed"));
    s.render();
    s.find("share-table-invite-link")?.props.onPress();
    await new Promise<void>((resolve) => setImmediate(resolve));
    s.render();
    expect(s.all().find((n) => n.props?.accessibilityRole === "alert")?.props.children).toBe(
      "Could not share the invite. Try again.",
    );
    s.find("share-table-invite-link")?.props.onPress();
    await new Promise<void>((resolve) => setImmediate(resolve));
    s.render();
    expect(s.all().some((n) => n.props?.accessibilityRole === "alert")).toBe(false);
    expect(s.find("table-invite-link-value")?.props.children).toBe("link");
    expect(s.invite.mutate).not.toHaveBeenCalled();
  });
  it.each(["unmount", "owner", "api", "table"])(
    "rejects late creation callbacks after %s changes",
    (change) => {
      const s = setup();
      s.press();
      const callbacks = s.invite.mutate.mock.calls[0][1];
      if (change === "unmount") s.unmount();
      if (change === "owner") s.options.userId = "next";
      if (change === "api") s.options.apiUrl = "https://next.test";
      if (change !== "unmount") s.render({ tableId: change === "table" ? "next-table" : "table" });
      callbacks.onSuccess({ link: "old-token" });
      callbacks.onSettled();
      expect(s.share).not.toHaveBeenCalled();
    },
  );
});

it.each([
  [true, true],
  [false, true],
  [false, false],
])(
  "gates contextual generation on verified capability, placeholder=%s eligible=%s",
  (placeholder, eligible) => {
    const event = { canInvite: true, groupId: "group" };
    const canGenerateTableInviteLink = vi.fn(() => eligible);
    const render = load("events/EventInvitationPicker", "EventInvitationPicker", {
      "@board-game-organizer/shared": {
        canGenerateTableInviteLink,
        communityAccessDenied: () => false,
        useEventRecord: () => ({ data: event, isPlaceholderData: placeholder }),
        useEventRecordActions: () => ({ blocking: false }),
      },
      "expo-router": { Stack: { Screen: "Screen" }, useRouter: () => ({ back: vi.fn() }) },
      "react-native": { View: "View" },
      "heroui-native/skeleton": { Skeleton: "Skeleton" },
      "heroui-native/text": { Typography: "Typography" },
      "@/components/contacts/PeoplePicker": { PeoplePicker: "PeoplePicker" },
      "@/components/invites/TableInviteLinkRow": { TableInviteLinkRow: "TableInviteLinkRow" },
      "@/lib/i18n": { useT: () => (id: string) => id },
      "@/lib/useCommunityApi": { useCommunityApi: () => ({ apiUrl: "api", userId: "owner" }) },
    });
    const tree = render({ eventId: "event", tableId: "table" });
    const picker = nodes(tree).find((n) => n.type === "PeoplePicker");
    expect(Boolean(picker?.props.children)).toBe(!placeholder && eligible);
    if (!placeholder && eligible) expect(picker?.props.children.props.tableId).toBe("table");
    expect(canGenerateTableInviteLink).toHaveBeenCalledTimes(placeholder ? 0 : 1);
  },
);

it.each(["empty", "users", "error", "searching"])(
  "keeps the invite row before search in the existing virtualized header: %s",
  (mode) => {
    const row = { type: "TableInviteLinkRow", props: { tableId: "table" } };
    const render = load("contacts/PeoplePicker", "PeoplePicker", {
      "@board-game-organizer/shared": {
        communityAccessDenied: () => mode === "error",
        formatUsername: vi.fn(),
        hasContactRelationship: vi.fn(),
        useListSearch: () => ({
          query: "term",
          search: "term",
          setQuery: vi.fn(),
          toggle: vi.fn(),
        }),
        usePeoplePicker: () => ({
          items: mode === "users" ? [{ id: "person" }] : [],
          isPending: mode === "searching",
          error: mode === "error" ? new Error("offline") : null,
        }),
      },
      "heroui-native/button": { Button: "Button" },
      "heroui-native/hooks": { useThemeColor: () => ["foreground", "accent"] },
      "heroui-native/skeleton": { Skeleton: "Skeleton" },
      "heroui-native/text": { Typography: "Typography" },
      "lucide-react-native": { UserRoundPlus: "UserRoundPlus", UsersRound: "UsersRound" },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
      "@/components/common/ui/HelpPopover": { HelpPopover: "HelpPopover" },
      "@/components/common/ui/ListSearch": { ListSearch: "ListSearch" },
      "@/components/common/ui/UserList": { UserList: "UserList" },
      "@/components/common/ui/UserListRow": { UserListRow: "UserListRow" },
      "@/components/common/ui/UserRelationshipBadge": {
        UserRelationshipBadge: "UserRelationshipBadge",
      },
      "@/lib/i18n": { useT: () => (id: string) => id },
      "@/lib/useCommunityApi": { useCommunityApi: () => ({ userId: "owner" }) },
    });
    const tree = render({ children: row, friendsOnly: false, onSelect: vi.fn() });
    expect(tree.type).toBe("UserList");
    expect(tree.props.header.props.children[0]).toBe(row);
    expect(tree.props.header.props.children[1].type).toBe("ListSearch");
    expect(tree.props.data.length).toBe(mode === "users" ? 1 : 0);
  },
);

it.each(["success", "create-offline", "forbidden"])(
  "validates owned native generation input: %s",
  (mode) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/table-invite-link-inputs.js", import.meta.url),
      "utf8",
    );
    const input = { mode, locale: "en", eventId: "event", tableId: "table" };
    const run = (overrides: Record<string, unknown> = {}) => {
      const context = {
        output: {},
        TABLE_INVITE_NATIVE_ACK: "owned-preview-table-invite",
        TABLE_INVITE_NATIVE_INPUT: JSON.stringify(input),
        ...overrides,
      };
      runInNewContext(source, context);
      return context.output as {
        tableInvite: { link: string; offline: boolean; forbidden: boolean };
      };
    };
    const result = run().tableInvite;
    expect(result).toMatchObject({
      link: "bgo-dev:///event/invite?eventId=event&tableId=table",
      offline: mode === "create-offline",
      forbidden: mode === "forbidden",
    });
    expect(() => run({ TABLE_INVITE_NATIVE_ACK: "" })).toThrow();
    for (const field of ["mode", "locale", "eventId", "tableId"]) {
      expect(() =>
        run({ TABLE_INVITE_NATIVE_INPUT: JSON.stringify({ ...input, [field]: "?" }) }),
      ).toThrow();
    }
  },
);
