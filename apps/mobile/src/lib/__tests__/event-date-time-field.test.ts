import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Real field callbacks only. This does not simulate or establish native picker UI acceptance.
function picker(mode: "date" | "time" | "datetime", platform = "android") {
  const source = readFileSync(
    new URL("../../components/events/EventDateTimeField.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "field.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const functions = new Map<string, string>();
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ["commit", "pick"].includes(node.name.getText(file))
    )
      functions.set(node.name.getText(file), node.initializer.getText(file));
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(functions.size).toBe(2);
  const bindings = {
    mode,
    Platform: { OS: platform },
    day: "2030-06-03",
    wall: "2030-06-03T10:30",
    min: "2030-06-03T10:30",
    max: "2030-06-03T11:30",
    initial: new Date("2030-06-03T10:30Z"),
    DateTimePickerAndroid: { open: vi.fn() },
    setDraft: vi.fn(),
    setPickerError: vi.fn(),
    onChange: vi.fn(),
    t: (text: string) => text,
    result: undefined as unknown as { pick: () => void; commit: (value: Date) => void },
  };
  const code = ts.transpileModule(
    `const commit = ${functions.get("commit")}; const pick = ${functions.get("pick")}; result = {pick, commit};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  runInNewContext(code, bindings);
  return { ...bindings, ...bindings.result };
}
it.each(["10:30", "11:30"])(
  "opens the bounded table time with Android native clock and accepts inclusive boundary %s",
  (time) => {
    const field = picker("time");
    field.pick();
    const clock = field.DateTimePickerAndroid.open.mock.calls[0][0];
    expect(clock.mode).toBe("time");
    expect(clock.timeZoneName).toBe("UTC");
    clock.onChange({ type: "set" }, new Date(`2030-06-03T${time}Z`));
    expect(field.onChange).toHaveBeenCalledWith(`2030-06-03T${time}`);
  },
);
it.each(["10:29", "11:31"])(
  "rejects out-of-range native clock choice %s without clamping or writing",
  (time) => {
    const field = picker("time");
    field.commit(new Date(`2030-06-03T${time}Z`));
    expect(field.onChange).not.toHaveBeenCalled();
    expect(field.setPickerError).toHaveBeenLastCalledWith(
      "Choose a time within the allowed range.",
    );
  },
);
it("uses native date then native time for bounded event ends and commits neither intermediate nor cancelled choices", () => {
  const field = picker("datetime");
  field.pick();
  const date = field.DateTimePickerAndroid.open.mock.calls[0][0];
  expect(date.mode).toBe("date");
  expect(date.minimumDate.toISOString()).toBe("2030-06-03T10:30:00.000Z");
  expect(date.maximumDate.toISOString()).toBe("2030-06-03T11:30:00.000Z");
  date.onChange({ type: "dismissed" });
  expect(field.DateTimePickerAndroid.open).toHaveBeenCalledOnce();
  date.onChange({ type: "set" }, new Date("2030-06-03T00:00Z"));
  expect(field.onChange).not.toHaveBeenCalled();
  const time = field.DateTimePickerAndroid.open.mock.calls[1][0];
  expect(time.mode).toBe("time");
  expect(time.value.toISOString()).toBe("2030-06-03T10:30:00.000Z");
  time.onChange({ type: "dismissed" });
  expect(field.onChange).not.toHaveBeenCalled();
  time.onChange({ type: "set" }, new Date("2030-06-03T11:00Z"));
  expect(field.onChange).toHaveBeenCalledWith("2030-06-03T11:00");
});
it("preserves date-only callers and the iOS native-picker host", () => {
  const date = picker("date");
  date.pick();
  date.DateTimePickerAndroid.open.mock.calls[0][0].onChange(
    { type: "set" },
    new Date("2030-06-03T11:00Z"),
  );
  expect(date.onChange).toHaveBeenCalledWith("2030-06-03T11:00");
  const ios = picker("datetime", "ios");
  ios.pick();
  expect(ios.setDraft).toHaveBeenCalledWith(ios.initial);
  expect(ios.DateTimePickerAndroid.open).not.toHaveBeenCalled();
});
