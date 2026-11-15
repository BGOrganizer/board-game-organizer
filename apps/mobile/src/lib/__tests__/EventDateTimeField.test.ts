import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../components/events/EventDateTimeField.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "field.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node));
if (!fn) throw Error("Missing date/time field");
const code = ts.transpileModule(fn.getText(ast).replace(/^export /, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
type Node = { props: { onPress?: () => void }; children: (Node | Node[] | null)[] };
function press(node: Node | Node[] | null): (() => void) | undefined {
  if (!node) return;
  if (Array.isArray(node)) return node.map(press).find(Boolean);
  return node.props.onPress ?? node.children.map(press).find(Boolean);
}
// Tests the native picker callback contract; no SDK rendering or device keyboard claim.
function harness() {
  let cursor = 0;
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: () => void }[] = [],
    effects: (() => void)[] = [];
  const open = vi.fn(),
    dismiss = vi.fn(),
    onChange = vi.fn();
  const context = {
    Date,
    Intl,
    Platform: { OS: "android" },
    DateTimePickerAndroid: { open, dismiss },
    React: {
      createElement: (_: unknown, props: object | null, ...children: Node[]) => ({
        props: props ?? {},
        children,
      }),
    },
    useT: () => (value: string) => value,
    useLingui: () => ({ i18n: { locale: "en" } }),
    useThemeColor: () => "muted",
    eventLocalDateTime: () => "2030-01-01T00:00",
    CalendarClock: "datetime",
    CalendarDays: "date",
    Clock3: "time",
    GroupedRow: "row",
    GroupedList: "list",
    Button: { Label: "label" },
    InputField: "field",
    SearchHelpLabel: "help",
    Typography: "text",
    Dialog: {},
    View: "view",
    useRef: (value: unknown) => {
      const i = cursor++;
      slots[i] ??= { value: { current: value } };
      return slots[i].value;
    },
    useState: (value: unknown) => {
      cursor++;
      return [value, vi.fn()];
    },
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const i = cursor++,
        old = slots[i];
      if (!old || deps.some((dep, index) => dep !== old.deps?.[index]))
        effects.push(() => {
          old?.cleanup?.();
          slots[i] = { deps, cleanup: effect() };
        });
    },
  };
  const field = runInNewContext(`${code};EventDateTimeField;`, context);
  const render = (changes = {}) => {
    cursor = 0;
    const tree = field({
      label: "Date",
      value: "2030-01-01T10:00",
      mode: "datetime",
      timeZone: "UTC",
      onChange,
      ...changes,
    });
    while (effects.length) effects.shift()?.();
    const pick = press(tree);
    if (!pick) throw Error("Missing picker button");
    return pick;
  };
  return {
    render,
    open,
    dismiss,
    onChange,
    unmount: () => {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}
it("uses the SDK date-then-time dialogs and commits only after both selections", () => {
  const h = harness();
  h.render()();
  expect(h.open.mock.calls[0][0].mode).toBe("date");
  h.open.mock.calls[0][0].onChange({ type: "set" }, new Date("2030-01-02T00:00Z"));
  expect(h.onChange).not.toHaveBeenCalled();
  expect(h.open.mock.calls[1][0].mode).toBe("time");
  h.open.mock.calls[1][0].onChange({ type: "set" }, new Date("2030-01-01T12:30Z"));
  expect(h.onChange).toHaveBeenCalledExactlyOnceWith("2030-01-02T12:30");
});
it.each(["date", "time"])("cancelling the %s dialog commits nothing", (stage) => {
  const h = harness();
  h.render()();
  if (stage === "time")
    h.open.mock.calls[0][0].onChange({ type: "set" }, new Date("2030-01-02T00:00Z"));
  const dialog = h.open.mock.calls.at(-1);
  if (!dialog) throw Error("Missing native dialog");
  dialog[0].onChange({ type: "dismissed" });
  expect(h.onChange).not.toHaveBeenCalled();
});
it.each(["scope", "unmount"])("rejects stale native callbacks after %s", (change) => {
  const h = harness();
  h.render()();
  const old = h.open.mock.calls[0][0];
  if (change === "scope") h.render({ value: "2030-01-03T11:00", timeZone: "Europe/Rome" });
  else h.unmount();
  old.onChange({ type: "set" }, new Date("2030-01-02T00:00Z"));
  expect(h.dismiss).toHaveBeenCalledWith("date");
  expect(h.open).toHaveBeenCalledOnce();
  expect(h.onChange).not.toHaveBeenCalled();
});
it("rejects out-of-range Android times without clamping", () => {
  const h = harness();
  h.render({
    mode: "time",
    value: "10:00",
    day: "2030-01-01",
    min: "2030-01-01T09:00",
    max: "2030-01-01T12:00",
  })();
  h.open.mock.calls[0][0].onChange({ type: "set" }, new Date("2030-01-01T13:00Z"));
  expect(h.onChange).not.toHaveBeenCalled();
});
