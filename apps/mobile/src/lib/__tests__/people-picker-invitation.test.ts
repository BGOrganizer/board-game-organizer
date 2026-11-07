import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Actual row callbacks/props, not RN rendering. Native portal/touch acceptance remains separate.
function renderRow(invitationTable: boolean, disabled: boolean) {
  const text = readFileSync(
    new URL("../../components/contacts/PeoplePicker.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "picker.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let expression = "";
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === "renderRow" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    )
      expression = node.initializer.expression?.getText(file) ?? "";
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(expression).not.toBe("");
  const onSelect = vi.fn();
  const row = runInNewContext(
    ts.transpileModule(`(${expression})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText,
    {
      invitationTable: invitationTable ? { eventId: "event", tableId: "table" } : undefined,
      disabled,
      onSelect,
      accent: "theme-accent",
      t: (value: string) => value,
      UserListRow: "UserListRow",
      Button: "Button",
      UserRoundPlus: "UserRoundPlus",
      HelpPopover: "HelpPopover",
      Typography: "Typography",
      React: {
        Fragment: "Fragment",
        createElement: (
          type: string,
          props: Record<string, unknown> | null,
          ...children: unknown[]
        ) => ({ type, props: { ...props, children } }),
      },
    },
  );
  return { row, onSelect };
}
it.each([
  [undefined, true, false, false],
  [null, true, false, false],
  ["TABLE_TIME_CONFLICT", true, false, true],
  ["TABLE_TIME_CONFLICT", false, false, false],
  [null, true, true, false],
  ["TABLE_TIME_CONFLICT", true, true, true],
] as const)(
  "guards native identity/invite actions while keeping conflict help independent (%s/%s/%s)",
  (reason, table, busy, unavailable) => {
    const picker = renderRow(table, busy);
    const person = {
      id: "player",
      name: "Player",
      username: null,
      email: null,
      avatarUrl: null,
      ...(reason === undefined ? {} : { invitationBlockReason: reason }),
    };
    const row = picker.row(person);
    const [button, help] = row.props.actions.props.children;
    expect(row.props.isDisabled).toBe(busy || unavailable);
    expect(button.props.isDisabled).toBe(busy || unavailable);
    row.props.onPress();
    button.props.onPress();
    expect(picker.onSelect).toHaveBeenCalledTimes(busy || unavailable ? 0 : 2);
    if (unavailable) {
      expect(help.type).toBe("HelpPopover");
      expect(help.props.label).toBe("Why invitation is unavailable: Player");
      expect(help.props.title).toBe("Invitation unavailable");
      expect(help.props.isDisabled).toBeUndefined();
      expect(help.props.children[0].props.children[0]).toContain("assigned as a demonstrator");
    } else expect(help).toBeNull();
  },
);
