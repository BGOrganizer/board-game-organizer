import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { eventProposalPayloadSchema } from "@board-game-organizer/schemas";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../components/events/EventProposalEditor.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "proposal.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node));
if (!fn) throw Error("Missing proposal editor");
const code = ts.transpileModule(fn.getText(ast).replace(/^export /, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
type Tree = { type: string; props: Record<string, unknown>; children: (Tree | Tree[] | null)[] };
function find(tree: Tree | Tree[] | null, type: string): Tree | undefined {
  if (!tree || typeof tree !== "object") return;
  if (Array.isArray(tree)) return tree.map((child) => find(child, type)).find(Boolean);
  return tree.type === type ? tree : tree.children.map((child) => find(child, type)).find(Boolean);
}
// Real editor callbacks with a schema-backed form stub; not native rendering or remote acceptance.
function harness() {
  let cursor = 0;
  const slots: { current: unknown }[] = [];
  const effects: (() => void)[] = [];
  const propose = vi.fn(),
    back = vi.fn();
  const router = { canGoBack: () => true, back, replace: vi.fn() };
  const form = {
    allowed: true,
    validInput: true,
    canAttempt: true,
    canSubmit: false,
    payload: null as { kind: "date"; day: string; startTime: string } | null,
    event: { timeZone: "UTC", version: 1 },
    q: { isPending: false, isError: false },
    table: {},
    chooseDate: (wall: string) => {
      form.payload = { kind: "date", day: wall.slice(0, 10), startTime: wall.slice(11, 16) };
      form.canSubmit = eventProposalPayloadSchema.safeParse(form.payload).success;
    },
    submit: vi.fn(() => {
      if (!form.canAttempt || !form.canSubmit) return false;
      propose(form.payload);
      return true;
    }),
  };
  const component = runInNewContext(`${code};EventProposalEditor;`, {
    React: {
      Fragment: "fragment",
      createElement: (type: string, props: object | null, ...children: Tree[]) => ({
        type,
        props: props ?? {},
        children,
      }),
    },
    useEventProposalEditor: () => form,
    useT: () => (value: string) => value,
    useCommunityApi: () => ({ apiUrl: "api", userId: "user" }),
    useRouter: () => router,
    useState: (initial: unknown) => {
      const i = cursor++;
      slots[i] ??= { current: initial };
      return [
        slots[i].current,
        (value: unknown) => {
          slots[i].current = value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = cursor++;
      slots[i] ??= { current: initial };
      return slots[i];
    },
    useEffect: (effect: () => void) => effects.push(effect),
    View: "View",
    Stack: { Screen: "Screen" },
    HeaderTitle: "HeaderTitle",
    headerBackOptions: () => ({}),
    MessageSquarePlus: "icon",
    FormInteractionScope: "Scope",
    InputScrollView: "Scroll",
    Button: { Label: "Label" },
    FormSubmitButton: "Submit",
    EventDateTimeField: "Date",
    Typography: "Typography",
  });
  function render() {
    cursor = 0;
    const tree = component({ eventId: "event", kind: "date" });
    while (effects.length) effects.shift()?.();
    return tree;
  }
  const field = (tree: Tree, type: string) => {
    const node = find(tree, type);
    if (!node) throw Error(`Missing ${type}`);
    return node.props;
  };
  return { render, field, form, propose, back };
}
it("keeps an empty DATE proposal submit actionable, reveals its error and never mutates", () => {
  const h = harness(),
    tree = h.render(),
    button = h.field(tree, "Submit");
  expect(button.isDisabled).toBe(false);
  (button.onPress as () => void)();
  expect(h.field(h.render(), "Date").error).toBe("Choose a valid date and time.");
  expect(h.propose).not.toHaveBeenCalled();
  expect(h.back).not.toHaveBeenCalled();
});
it("selecting a date only edits the draft; a separate valid submit sends once and closes", () => {
  const h = harness();
  (h.field(h.render(), "Date").onChange as (value: string) => void)("2030-06-04T20:00");
  expect(h.propose).not.toHaveBeenCalled();
  expect(h.back).not.toHaveBeenCalled();
  const tree = h.render();
  expect(h.field(tree, "Date").value).toBe("2030-06-04T20:00");
  (h.field(tree, "Submit").onPress as () => void)();
  h.render();
  expect(h.propose).toHaveBeenCalledExactlyOnceWith({
    kind: "date",
    day: "2030-06-04",
    startTime: "20:00",
  });
  expect(h.back).toHaveBeenCalledOnce();
});
it("updates only the error-focus revision on a version-only Event change, retaining the date draft", () => {
  const h = harness();
  h.form.chooseDate("2030-06-04T20:00");
  const before = h.render();
  expect(h.field(before, "Scope").sourceRevision).toBe(1);
  h.form.event.version = 2;
  const after = h.render();
  expect(h.field(after, "Scope").sourceRevision).toBe(2);
  expect(h.field(after, "Scope").key).toBe(h.field(before, "Scope").key);
  expect(h.field(after, "Date").value).toBe("2030-06-04T20:00");
  expect(h.propose).not.toHaveBeenCalled();
});
it("disables submit while the form cannot attempt, without discarding its date", () => {
  const h = harness();
  h.form.chooseDate("2030-06-04T20:00");
  h.form.canAttempt = false;
  const tree = h.render();
  expect(h.field(tree, "Submit").isDisabled).toBe(true);
  expect(h.field(tree, "Date").value).toBe("2030-06-04T20:00");
});
