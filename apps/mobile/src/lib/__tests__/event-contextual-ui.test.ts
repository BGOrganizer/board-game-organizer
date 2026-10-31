import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Actual native callbacks/props only. Rendered keyboard, portal and touch acceptance is separate.
function expression(fileName: string, tag: string, attribute: string) {
  const source = readFileSync(
    new URL(`../../components/events/${fileName}.tsx`, import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let value = "";
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(file) === tag) {
        const prop = node.attributes.properties
          .filter(ts.isJsxAttribute)
          .find((item) => item.name.getText(file) === attribute);
        if (prop?.initializer && ts.isJsxExpression(prop.initializer))
          value = prop.initializer.expression?.getText(file) ?? "";
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(value).not.toBe("");
  return ts.transpileModule(`(${value})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}
it("blurs the active native input via Keyboard.dismiss before opening group options; closing clears search", () => {
  const calls: string[] = [];
  const setQuery = vi.fn();
  const callback = runInNewContext(expression("EventGroupSelect", "Select", "onOpenChange"), {
    Keyboard: { dismiss: () => calls.push("dismiss-and-blur") },
    setOpen: (open: boolean) => calls.push(open ? "open" : "close"),
    search: { setQuery },
  });
  callback(true);
  expect(calls).toEqual(["dismiss-and-blur", "open"]);
  expect(setQuery).not.toHaveBeenCalled();
  callback(false);
  expect(calls).toEqual(["dismiss-and-blur", "open", "close"]);
  expect(setQuery).toHaveBeenCalledWith("");
});
it("caps the compact native option viewport while retaining loading/error space", () => {
  const code = expression("EventGroupSelect", "FlatList", "style");
  for (const length of [0, 1, 4, 50]) {
    const style = runInNewContext(code, { rows: { length } });
    expect(style.height).toBeGreaterThanOrEqual(144);
    expect(style.height).toBeLessThanOrEqual(192);
    expect(style.flexShrink).toBe(1);
  }
});
it.each([false, true])(
  "keeps a single virtualized native list, with waiting after the seat section only when supplied (waiting=%s)",
  (waiting) => {
    const seats = [{ key: "main" }],
      queued = waiting ? [{ key: "queued" }] : [];
    const sections = runInNewContext(expression("EventTableSeats", "SectionList", "sections"), {
      roster: { seatRows: seats, waitingRows: queued },
      t: (value: string) => value,
    });
    expect(sections.map((section: { title: string }) => section.title)).toEqual(
      waiting ? ["Seats list", "Waiting list"] : ["Seats list"],
    );
    expect(sections[0].data).toBe(seats);
    if (waiting) expect(sections[1].data).toBe(queued);
  },
);
it.each(["personal", "event"] as const)(
  "passes native Table origin without guessing navigation history (%s)",
  (context) => {
    const push = vi.fn();
    runInNewContext(expression("EventTableCard", "LinkedListCard", "onPress"), {
      context,
      table: { eventId: "event", id: "table" },
      router: { push },
    })();
    expect(push).toHaveBeenCalledWith({
      pathname: "/event/table",
      params: {
        eventId: "event",
        tableId: "table",
        ...(context === "event" ? { fromEvent: "event" } : {}),
      },
    });
  },
);
it.each(["personal", "group"] as const)(
  "passes native Event origin only for contextual Group navigation (%s)",
  (context) => {
    const push = vi.fn();
    runInNewContext(expression("EventCard", "LinkedListCard", "onPress"), {
      context,
      local: undefined,
      event: { id: "event", groupId: "group" },
      router: { push },
    })();
    expect(push).toHaveBeenCalledWith({
      pathname: "/event/[eventId]",
      params: { eventId: "event", ...(context === "group" ? { fromGroup: "group" } : {}) },
    });
  },
);
