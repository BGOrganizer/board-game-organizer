import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute actual component callbacks/conditions without loading RN Flow. Not device acceptance.
type Tree = { type: unknown; props: Record<string, unknown> & { children: unknown[] } };
function render(
  name: string,
  context: Record<string, unknown>,
  props: Record<string, unknown>,
): Tree {
  const source = readFileSync(
    new URL(`../../components/events/${name}.tsx`, import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const fn = file.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )!;
  const code = `${fn.getText(file).replace(/^export /, "")}; ${name}(props);`;
  return runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText,
    {
      props,
      useT: () => (text: string) => text,
      useCommunityApi: () => ({ apiUrl: "api" }),
      React: {
        Fragment: "Fragment",
        createElement: (
          type: unknown,
          props: Record<string, unknown> | null,
          ...children: unknown[]
        ): Tree => ({ type, props: { ...props, children } }),
      },
      ...context,
    },
  );
}
function nodes(value: unknown): Tree[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Tree;
  return [node, ...nodes(node.props.children)];
}
it.each([false, true])(
  "native Accept opens choices only; decline stays direct, busy=%s",
  (busy) => {
    const setAccepting = vi.fn(),
      mutate = vi.fn();
    const registration = {
      id: "registration",
      tableId: "table",
      status: "PENDING",
      kind: "INVITATION",
      version: 2,
    };
    const context = {
      useState: () => [false, setAccepting],
      useEventRecordActions: () => ({ busy, respond: { mutate } }),
      InvitationActions: "actions",
      EventJoinSheet: "sheet",
    };
    const tree = render("EventTableInvitationActions", context, { eventId: "event", registration });
    const actions = nodes(tree).find((n) => n.type === "actions")!;
    (actions.props.onAccept as () => void)();
    expect(mutate).not.toHaveBeenCalled();
    expect(setAccepting).toHaveBeenCalledTimes(busy ? 0 : 1);
    expect(actions.props.pending).toBe(busy);
    if (!busy) {
      (actions.props.onDecline as () => void)();
      expect(mutate).toHaveBeenCalledWith({
        registrationId: "registration",
        input: { action: "decline", version: 2 },
      });
    }
    const open = render(
      "EventTableInvitationActions",
      { ...context, useState: () => [true, setAccepting] },
      { eventId: "event", registration },
    );
    const sheet = nodes(open).find((n) => n.type === "sheet")!;
    expect(sheet.props).toMatchObject({
      eventId: "event",
      tableId: "table",
      registrationId: "registration",
    });
    (sheet.props.onClose as () => void)();
    expect(setAccepting).toHaveBeenLastCalledWith(false);
    expect(
      render("EventTableInvitationActions", context, {
        eventId: "event",
        registration: { ...registration, status: "ACCEPTED" },
      }),
    ).toBeNull();
  },
);
it.each([false, true])(
  "native invitation sheet reuses shared form, PUBLIC gamesOnly=%s",
  (gamesOnly) => {
    const onClose = vi.fn(),
      submit = vi.fn(),
      table = { games: [{ gameId: 1 }], gamesDetail: [] };
    const form = {
      q: {},
      tableQuery: {},
      event: { dates: [], locations: [] },
      table,
      initialTab: gamesOnly ? "games" : "dates",
      isInvitation: true,
      requiresAvailability: !gamesOnly,
      gamesOnly,
      busy: false,
      canSubmit: true,
      submit,
      votes: {},
    };
    const useEventJoinForm = vi.fn(() => form),
      Button = { Label: "label" },
      Tabs = { Trigger: "tab", Label: "tab-label" };
    const BottomSheet = {
      Portal: "portal",
      Overlay: "overlay",
      Content: "content",
      Title: "title",
      Description: "description",
    };
    const context = {
      useEventJoinForm,
      useState: () => [null, vi.fn()],
      useWindowDimensions: () => ({ height: 800 }),
      useSafeAreaInsets: () => ({ bottom: 0 }),
      useThemeColor: () => "accent",
      BottomSheet,
      Button,
      Tabs,
      TabBar: "bar",
      Typography: "text",
      View: "view",
      Skeleton: "skeleton",
      BottomSheetFlatList: "list",
      UserRoundCheck: "icon",
    };
    const tree = render("EventJoinSheet", context, {
      eventId: "event",
      tableId: "table",
      registrationId: "registration",
      onClose,
    });
    expect(useEventJoinForm).toHaveBeenCalledWith(
      { apiUrl: "api" },
      "event",
      "table",
      onClose,
      "registration",
    );
    expect(
      nodes(tree)
        .filter((n) => n.type === "tab")
        .map((n) => n.props.value),
    ).toEqual(gamesOnly ? ["games"] : ["dates", "locations", "games"]);
    if (gamesOnly) expect(nodes(tree).find((n) => n.type === "list")?.props.data).toBe(table.games);
    const buttons = nodes(tree).filter((n) => n.type === Button);
    const confirm = buttons[buttons.length - 1];
    expect(confirm.props.isDisabled).toBe(false);
    (confirm.props.onPress as () => void)();
    expect(submit).toHaveBeenCalledOnce();
    (tree.props.onOpenChange as (open: boolean) => void)(false);
    expect(onClose).toHaveBeenCalledOnce();
    const pending = render(
      "EventJoinSheet",
      { ...context, useEventJoinForm: () => ({ ...form, busy: true, canSubmit: false }) },
      { eventId: "event", tableId: "table", registrationId: "registration", onClose },
    );
    (pending.props.onOpenChange as (open: boolean) => void)(false);
    expect(onClose).toHaveBeenCalledOnce();
    expect(nodes(pending).find((n) => n.type === "overlay")?.props.isCloseOnPress).toBe(false);
    expect(nodes(pending).find((n) => n.type === "content")?.props.enablePanDownToClose).toBe(
      false,
    );
    expect(
      nodes(pending)
        .filter((n) => n.type === Button)
        .every((n) => n.props.isDisabled === true),
    ).toBe(true);
  },
);
