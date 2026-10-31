import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../components/events/${file}.tsx`, import.meta.url), "utf8");
// Execute native callbacks only; this is not RN rendering/touch acceptance.
it.each([false, true])(
  "preserves known recipient metadata through native removal confirmation (own=%s)",
  (own) => {
    const file = ts.createSourceFile(
      "overview.tsx",
      source("EventTableOverview"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let onRemove = "",
      run = "";
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === "run")
        run = node.initializer?.getText(file) ?? "";
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(file) === "onRemove" &&
        node.initializer &&
        ts.isJsxExpression(node.initializer)
      )
        onRemove = node.initializer.expression?.getText(file) ?? "";
      ts.forEachChild(node, visit);
    }
    visit(file);
    const setConfirm = vi.fn(),
      mutate = vi.fn();
    const evaluate = (expression: string, context: Record<string, unknown>) =>
      runInNewContext(
        ts.transpileModule(`(${expression})`, {
          compilerOptions: { target: ts.ScriptTarget.ES2022 },
        }).outputText,
        context,
      );
    const person = {
      userId: own ? "owner" : "guest",
      name: "Known player",
      username: "player",
      avatarUrl: null,
    };
    evaluate(onRemove, { setConfirm })({ id: "registration", version: 4, ...person }, own);
    const confirm = setConfirm.mock.calls[0][0];
    expect(confirm.person).toEqual(person);
    evaluate(run, {
      confirm,
      closed: false,
      tableId: "table",
      setConfirm,
      table: {
        eventStatus: "PLANNING",
        canInvite: true,
        canLeave: true,
        myRegistration: { id: "registration" },
      },
      a: { blocking: false, isResponding: () => false, respond: { mutate } },
    })();
    expect(mutate).toHaveBeenCalledWith({
      tableId: "table",
      registrationId: "registration",
      person,
      input: { action: own ? "cancel" : "remove", version: 4 },
    });
    expect(setConfirm).toHaveBeenLastCalledWith(null);
  },
);
it.each(["EventDetail", "EventTableOverview", "EventTableCard", "EventInvitationPicker"])(
  "uses exact boundary timer in %s instead of waiting for a list refetch",
  (name) => expect(source(name)).toContain("useEventCutoff"),
);
it("never creates a synthetic Match or organizer seat from a table link", () => {
  for (const name of ["EventTable", "EventInvitationPicker", "EventResults", "EventWizard"]) {
    expect(source(name)).not.toContain("useMatch");
    expect(source(name)).not.toContain("/match/");
  }
  expect(source("EventWizard")).toContain("organizer has no automatic playing seat");
});
it("preserves whole-event immutable result finalization with per-table draft scores and genuine sheet interactions", () => {
  expect(source("EventResults")).toContain("Finalization is irreversible.");
  expect(source("EventResults")).toContain("f.finalize()");
  expect(source("EventResults")).toContain("<ConfirmDialog");
  expect(source("TableScoreEditor")).toMatch(/onSubmit\(\{\s*lowerWins/);
  expect(source("TableScoreEditor")).toContain("previewTableResults");
  expect(source("TableScoreEditor")).toContain("useBottomSheetAwareHandlers");
});
it("always exposes native Dates/Locations/Games and never hides schedule tabs for repeat joins", () => {
  const text = source("EventJoinSheet");
  const file = ts.createSourceFile(
    "join.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const tabs: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "Tabs.Trigger") {
      const value = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((attribute) => attribute.name.getText(file) === "value");
      if (!value?.initializer || !ts.isStringLiteral(value.initializer))
        throw new Error("Expected static tab value");
      tabs.push(value.initializer.text);
      for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent)
        if (ts.isConditionalExpression(parent))
          expect(parent.condition.getText(file)).not.toContain("requiresAvailability");
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(tabs).toEqual(["dates", "locations", "games"]);
  expect(text).toContain("!form.initialTab");
});
it.each([
  [null, "dates", "dates"],
  [null, "games", "games"],
  ["dates", "games", "dates"],
  ["locations", "games", "locations"],
])(
  "uses native initial-tab policy without overriding user selection (%s/%s)",
  (selectedTab, initialTab, expected) => {
    const file = ts.createSourceFile(
      "join.tsx",
      source("EventJoinSheet"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let expression = "";
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === "tab")
        expression = node.initializer?.getText(file) ?? "";
      ts.forEachChild(node, visit);
    }
    visit(file);
    expect(expression).not.toBe("");
    expect(runInNewContext(expression, { selectedTab, form: { initialTab } })).toBe(expected);
  },
);
