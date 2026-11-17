import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

function callback(component: string, name: string, context: Record<string, unknown>, tag?: string) {
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
      (!tag ||
        ((ts.isJsxOpeningElement(node.parent.parent) ||
          ts.isJsxSelfClosingElement(node.parent.parent)) &&
          node.parent.parent.tagName.getText(file) === tag)) &&
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

it.each(["InputFlatList", "InputSectionList", "InputScrollView"])(
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

it.each(["InputFlatList", "InputSectionList", "InputScrollView"])(
  "ignores hidden %s viewport measurements and forwards active layout events unchanged",
  (component) => {
    let active = false;
    const onLayout = vi.fn();
    const handle = callback(
      component,
      "onLayout",
      {
        isActive: () => active,
        scroll: { onLayout },
      },
      "View",
    );
    const event = { nativeEvent: { layout: { width: 200, height: 300 } } };
    handle(event);
    expect(onLayout).not.toHaveBeenCalled();
    active = true;
    handle(event);
    expect(onLayout).toHaveBeenCalledExactlyOnceWith(event);
    active = false;
    handle(event);
    expect(onLayout).toHaveBeenCalledOnce();
  },
);

it.each(["InputFlatList", "InputSectionList", "InputScrollView"])(
  "gates hidden %s scroll callbacks before focus bookkeeping or caller handlers",
  (component) => {
    let active = false;
    const onScroll = vi.fn(),
      user = vi.fn();
    const handle = callback(component, "onScroll", {
      isActive: () => active,
      scroll: { onScroll },
      onScroll: user,
    });
    const event = { nativeEvent: { contentOffset: { y: 80 } } };
    handle(event);
    expect(onScroll).not.toHaveBeenCalled();
    expect(user).not.toHaveBeenCalled();
    active = true;
    handle(event);
    expect(onScroll).toHaveBeenCalledExactlyOnceWith(event);
    expect(user).toHaveBeenCalledExactlyOnceWith(event);
    callback(component, "onScroll", {
      isActive: () => true,
      scroll: { onScroll },
      onScroll: undefined,
    })(event);
    expect(onScroll).toHaveBeenCalledTimes(2);
  },
);

it("keeps the active InputScrollView drag callback and rejects it while hidden", () => {
  let active = false;
  const beginScroll = vi.fn(),
    user = vi.fn();
  const handle = callback("InputScrollView", "onScrollBeginDrag", {
    isActive: () => active,
    scroll: { beginScroll },
    props: { onScrollBeginDrag: user },
  });
  const event = { nativeEvent: { contentOffset: { y: 80 } } };
  handle(event);
  expect(beginScroll).not.toHaveBeenCalled();
  expect(user).not.toHaveBeenCalled();
  active = true;
  handle(event);
  expect(beginScroll).toHaveBeenCalledOnce();
  expect(user).toHaveBeenCalledExactlyOnceWith(event);
  callback("InputScrollView", "onScrollBeginDrag", {
    isActive: () => true,
    scroll: { beginScroll },
    props: {},
  })(event);
  expect(beginScroll).toHaveBeenCalledTimes(2);
});

it("gates both the InputFlatList index failure fallback and the caller override", () => {
  let active = false;
  const scrollToOffset = vi.fn(),
    user = vi.fn();
  const context = {
    isActive: () => active,
    list: { current: { scrollToOffset } as { scrollToOffset: typeof scrollToOffset } | null },
    props: {} as { onScrollToIndexFailed?: (...args: unknown[]) => void },
  };
  const handle = callback("InputFlatList", "onScrollToIndexFailed", context);
  const event = { averageItemLength: 55, index: 3 };
  handle(event);
  expect(scrollToOffset).not.toHaveBeenCalled();
  active = true;
  handle(event);
  expect(scrollToOffset).toHaveBeenCalledExactlyOnceWith({ offset: 165, animated: false });
  context.props.onScrollToIndexFailed = user;
  active = false;
  handle(event);
  expect(user).not.toHaveBeenCalled();
  active = true;
  handle(event);
  expect(user).toHaveBeenCalledExactlyOnceWith(event);
  expect(scrollToOffset).toHaveBeenCalledOnce();
  context.list.current = null;
  delete context.props.onScrollToIndexFailed;
  handle(event);
  expect(scrollToOffset).toHaveBeenCalledOnce();
});

it("gates a SectionList index failure callback without inventing a fallback when absent", () => {
  let active = false;
  const user = vi.fn();
  const context = { isActive: () => active, props: { onScrollToIndexFailed: user } };
  const handle = callback("InputSectionList", "onScrollToIndexFailed", context);
  const event = { averageItemLength: 55, index: 3 };
  handle(event);
  expect(user).not.toHaveBeenCalled();
  active = true;
  handle(event);
  expect(user).toHaveBeenCalledExactlyOnceWith(event);
  expect(
    callback("InputSectionList", "onScrollToIndexFailed", {
      isActive: () => true,
      props: {},
    }),
  ).toBeUndefined();
});

it("does not consume a notification scroll target while hidden or after an asynchronous measurement hides", () => {
  let active = false;
  let measured: ((_x: number, y: number) => void) | undefined;
  const scrollTo = vi.fn();
  const measureLayout = vi.fn((_node: unknown, result: typeof measured) => {
    measured = result;
  });
  const context = {
    isActive: () => active,
    requested: "target",
    itemId: "target",
    target: { id: "target" },
    positioned: { current: null as string | null },
    scroll: { current: { getInnerViewNode: () => "scroll-node", scrollTo } },
    ref: { current: { measureLayout } },
  };
  const finishMeasurement = (y: number) => {
    if (!measured) throw Error("Expected native measurement callback");
    measured(0, y);
  };
  const handle = callback("notifications/NotificationItem", "onLayout", context);
  handle();
  expect(measureLayout).not.toHaveBeenCalled();
  active = true;
  handle();
  expect(measureLayout).toHaveBeenCalledOnce();
  active = false;
  finishMeasurement(100);
  expect(scrollTo).not.toHaveBeenCalled();
  expect(context.positioned.current).toBeNull();
  active = true;
  handle();
  finishMeasurement(100);
  expect(context.positioned.current).toBe("target");
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 84, animated: false });
  handle();
  expect(measureLayout).toHaveBeenCalledTimes(2);
  context.positioned.current = null;
  context.requested = "different";
  handle();
  expect(measureLayout).toHaveBeenCalledTimes(2);
});

it.each(["InputFlatList", "InputSectionList", "InputScrollView"])(
  "gates %s caller layout events independently of its viewport measurements",
  (component) => {
    let active = false;
    const user = vi.fn();
    const context = { isActive: () => active, props: { onLayout: user } };
    const handle = callback(component, "onLayout", context, "Component");
    const event = { nativeEvent: { layout: { width: 200, height: 300 } } };
    handle(event);
    expect(user).not.toHaveBeenCalled();
    active = true;
    handle(event);
    expect(user).toHaveBeenCalledExactlyOnceWith(event);
    expect(
      callback(component, "onLayout", { isActive: () => true, props: {} }, "Component"),
    ).toBeUndefined();
  },
);
