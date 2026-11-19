import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

// Static consent/composition and pure selection policies; actual UI uses RNTL.
const source = (file: string) =>
  readFileSync(new URL(`../../components/events/${file}.tsx`, import.meta.url), "utf8");

it.each(["EventTableOverview", "EventTableSeats"])(
  "keeps exact cutoff timers for SELF participation in %s",
  (name) => expect(source(name)).toContain("useEventCutoff"),
);
it.each(["EventDetail", "EventInvitationPicker"])(
  "does not apply participation cutoff to Planning management in %s",
  (name) => expect(source(name)).not.toContain("useEventCutoff"),
);
it.each([
  [{}, true],
  [{ isPending: true }, false],
  [{ isError: true }, false],
  [{ queueOpen: true, hasNextPage: true }, false],
  [{ queueOpen: true, hasNextPage: false }, true],
  [{ waitingRows: [{ key: "queued" }] }, false],
] as const)(
  "keeps the source waiting-footer Boolean policy distinct from native rendering: %j",
  (state, showEmpty) => {
    const file = ts.createSourceFile(
      "seats.tsx",
      source("EventTableSeats"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let sections: ts.Expression | undefined;
    let footer: ts.ConditionalExpression | undefined;
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxAttribute(node) &&
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      ) {
        const name = node.name.getText(file);
        const expression = node.initializer.expression;
        if (name === "sections") sections = expression;
        if (
          name === "renderSectionFooter" &&
          ts.isArrowFunction(expression) &&
          ts.isConditionalExpression(expression.body)
        )
          footer = expression.body;
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    if (!sections || !footer) throw new Error("Expected actual roster section and footer policy");
    const roster = {
      seatRows: [],
      waitingRows: [],
      isPending: false,
      isError: false,
      queueOpen: false,
      hasNextPage: false,
      ...state,
    };
    // Only data and the Boolean condition execute: JSX is inspected as source,
    // never transpiled into a replacement React element or app callback.
    const groups = runInNewContext(sections.getText(file), {
      roster,
      t: (text: string) => text,
    }) as { key: string }[];
    expect(groups.map((section) => section.key)).toEqual(["seats", "waiting"]);
    const condition = footer.condition.getText(file);
    expect(runInNewContext(condition, { roster, section: groups[0] })).toBe(false);
    expect(runInNewContext(condition, { roster, section: groups[1] })).toBe(showEmpty);
    expect(footer.whenTrue.getText(file)).toContain('t("No players waiting")');
  },
);
it("never creates a synthetic Match or organizer seat from a table link", () => {
  for (const name of ["EventTable", "EventInvitationPicker", "EventResults", "EventWizard"]) {
    expect(source(name)).not.toContain("useMatch");
    expect(source(name)).not.toContain("/match/");
  }
  expect(source("EventWizard")).toContain("organizer has no automatic playing seat");
});
it("preserves whole-event immutable result finalization with per-table draft scores and genuine sheet interactions", () => {
  expect(source("EventFinalizeAction")).toContain(
    "Results and ratings for all included tables become immutable together.",
  );
  expect(source("EventFinalizeAction")).toMatch(
    /a\.finalize\.mutate\(\s*\{\s*version: confirm.version/,
  );
  expect(source("EventFinalizeAction")).toContain("<ConfirmDialog");
  expect(source("EventResults")).toContain("f.save(input");
  expect(source("TableScoreEditor")).toMatch(/onSubmit\(\{\s*lowerWins/);
  expect(source("TableScoreEditor")).toContain("previewTableResults");
  expect(source("TableScoreEditor")).toContain("@/components/common/ui/Input");
  expect(readFileSync(new URL("../useInputFocus.ts", import.meta.url), "utf8")).toContain(
    "useBottomSheetAwareHandlers",
  );
});
it("renders each native voting tab only when the shared form classifies multiple options", () => {
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
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "TabTrigger") {
      const value = node.attributes.properties
        .filter(ts.isJsxAttribute)
        .find((attribute) => attribute.name.getText(file) === "value");
      if (!value?.initializer || !ts.isStringLiteral(value.initializer))
        throw new Error("Expected static tab value");
      tabs.push(value.initializer.text);
      const conditions: string[] = [];
      for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent)
        if (ts.isConditionalExpression(parent)) conditions.push(parent.condition.getText(file));
      expect(conditions).toContain(`votingTabs.includes("${value.initializer.text}")`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(tabs).toEqual(["dates", "locations", "games"]);
  expect(text).toContain("!form.ready");
  expect(text).toContain("<FixedSettings");
});
it.each([
  [null, "dates", ["dates", "locations", "games"], "dates"],
  [null, "games", ["dates", "locations", "games"], "games"],
  ["dates", "games", ["dates", "games"], "dates"],
  ["locations", "games", ["locations", "games"], "locations"],
  ["dates", "dates", ["games"], "games"],
  ["games", "games", ["locations"], "locations"],
  ["games", undefined, [], undefined],
])(
  "uses native initial-tab policy without overriding user selection (%s/%s)",
  (selectedTab, initialTab, votingTabs, expected) => {
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
    expect(runInNewContext(expression, { selectedTab, votingTabs, form: { initialTab } })).toBe(
      expected,
    );
  },
);
