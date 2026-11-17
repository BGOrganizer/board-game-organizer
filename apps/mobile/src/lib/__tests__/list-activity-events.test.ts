import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

function callback(component: string, name: string, context: Record<string, unknown>) {
  const text = readFileSync(
    new URL(
      `../../components/${component.includes("/") ? component : `common/ui/${component}`}.tsx`,
      import.meta.url,
    ),
    "utf8",
  );
  const file = ts.createSourceFile(
    component,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === name &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    ) {
      expression = node.initializer.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error(`Missing ${component}.${name}`);
  return runInNewContext(
    ts.transpileModule(`(${expression.getText(file)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  ) as (...args: unknown[]) => void;
}

it.each(["InputFlatList", "InputSectionList"])(
  "ignores hidden %s size events before focus scrolling or user callbacks",
  (component) => {
    let active = false;
    const contentChanged = vi.fn(),
      user = vi.fn();
    const handle = callback(component, "onContentSizeChange", {
      isActive: () => active,
      scroll: { contentChanged },
      props: { onContentSizeChange: user },
    });
    handle(100, 200);
    expect(contentChanged).not.toHaveBeenCalled();
    expect(user).not.toHaveBeenCalled();
    active = true;
    handle(100, 200);
    expect(contentChanged).toHaveBeenCalledOnce();
    expect(user).toHaveBeenCalledExactlyOnceWith(100, 200);
  },
);

it("gates the direct Event participant list callbacks", () => {
  let active = false;
  const q = { beginScroll: vi.fn(), endReached: vi.fn() };
  const context = { isActive: () => active, q };
  const begin = callback("events/EventParticipants", "onScrollBeginDrag", context);
  const end = callback("events/EventParticipants", "onEndReached", context);
  begin({});
  end({});
  expect(q.beginScroll).not.toHaveBeenCalled();
  expect(q.endReached).not.toHaveBeenCalled();
  active = true;
  begin({});
  end({});
  expect(q.beginScroll).toHaveBeenCalledOnce();
  expect(q.endReached).toHaveBeenCalledOnce();
});

it("preserves Results ownership/termination guards and ignores hidden scroll/end events", () => {
  let active = false;
  const q = { loadMore: vi.fn() },
    scrolled = { current: "old-owner" };
  const context = {
    isActive: () => active,
    q,
    scrolled,
    owner: "current-owner",
    terminated: false,
  };
  const begin = callback("events/EventTableResults", "onScrollBeginDrag", context);
  const end = callback("events/EventTableResults", "onEndReached", context);
  begin({});
  end({});
  expect(scrolled.current).toBe("old-owner");
  expect(q.loadMore).not.toHaveBeenCalled();
  active = true;
  end({});
  expect(q.loadMore).not.toHaveBeenCalled();
  begin({});
  end({});
  expect(q.loadMore).toHaveBeenCalledOnce();
  context.terminated = true;
  end({});
  expect(q.loadMore).toHaveBeenCalledOnce();
});

it("gates hidden Table rosters without bypassing section, error or in-flight checks", () => {
  let visible = false;
  const roster = {
    hasNextPage: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    more: vi.fn(),
  };
  const context = { isActive: () => visible, active: true, roster };
  const end = callback("events/EventTableSeats", "onEndReached", context);
  end({});
  expect(roster.more).not.toHaveBeenCalled();
  visible = true;
  end({});
  expect(roster.more).toHaveBeenCalledOnce();
  for (const change of [
    () => {
      context.active = false;
    },
    () => {
      context.active = true;
      roster.hasNextPage = false;
    },
    () => {
      roster.hasNextPage = true;
      roster.isFetchingNextPage = true;
    },
    () => {
      roster.isFetchingNextPage = false;
      roster.isFetchNextPageError = true;
    },
  ]) {
    change();
    end({});
    expect(roster.more).toHaveBeenCalledOnce();
  }
});

it.each(["InputFlatList", "InputSectionList"])(
  "rejects late end events for a hidden %s and preserves focus-scroll suppression",
  (component) => {
    let active = false;
    const end = vi.fn(),
      focusScroll = { current: false };
    const handle = callback(component, "onEndReached", {
      isActive: () => active,
      focusScroll,
      props: { onEndReached: end },
    });
    const event = { distanceFromEnd: 0 };
    handle(event);
    expect(end).not.toHaveBeenCalled();
    active = true;
    handle(event);
    expect(end).toHaveBeenCalledExactlyOnceWith(event);
    focusScroll.current = true;
    handle(event);
    expect(end).toHaveBeenCalledOnce();
    focusScroll.current = false;
    active = false;
    handle(event);
    expect(end).toHaveBeenCalledOnce();
    active = true;
    handle(event);
    expect(end).toHaveBeenCalledTimes(2);
  },
);

for (const component of ["InputFlatList", "InputSectionList"]) {
  it.each(["onScrollBeginDrag", "onMomentumScrollBegin"])(
    `gates ${component}.%s before focus bookkeeping, user handlers or pagination`,
    (name) => {
      let active = false;
      const beginScroll = vi.fn(),
        user = vi.fn(),
        end = vi.fn(),
        focusScroll = { current: true };
      const handle = callback(component, name, {
        isActive: () => active,
        focusScroll,
        scroll: { beginScroll },
        props: { [name]: user, onEndReached: end, onEndReachedThreshold: 0.5 },
      });
      const bottom = {
        nativeEvent: {
          contentSize: { height: 1000 },
          layoutMeasurement: { height: 400 },
          contentOffset: { y: 600 },
        },
      };
      handle(bottom);
      expect(beginScroll).not.toHaveBeenCalled();
      expect(user).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();
      expect(focusScroll.current).toBe(true);
      active = true;
      handle(bottom);
      expect(beginScroll).toHaveBeenCalledOnce();
      expect(user).toHaveBeenCalledExactlyOnceWith(bottom);
      expect(end).toHaveBeenCalledExactlyOnceWith({ distanceFromEnd: 0 });
      expect(focusScroll.current).toBe(false);
      handle({ nativeEvent: { ...bottom.nativeEvent, contentOffset: { y: 0 } } });
      expect(end).toHaveBeenCalledOnce();
    },
  );
}
