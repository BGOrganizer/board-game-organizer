import type { BggPickerItem } from "@board-game-organizer/schemas";
import { expect, it, vi } from "vitest";
import { useGameListWindow } from "../hooks/useGameListWindow";

type Hooks = {
  useRef: (value: unknown) => { current: unknown };
  useState: (value: unknown) => [unknown, (next: unknown) => void];
  useMemo: (factory: () => unknown, deps: unknown[]) => unknown;
  useCallback: (callback: unknown, deps: unknown[]) => unknown;
};
const runtime = vi.hoisted(() => ({ current: undefined as Hooks | undefined }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (value: unknown) => runtime.current?.useRef(value),
  useState: (value: unknown) => runtime.current?.useState(value),
  useMemo: (factory: () => unknown, deps: unknown[]) => runtime.current?.useMemo(factory, deps),
  useCallback: (callback: unknown, deps: unknown[]) => runtime.current?.useCallback(callback, deps),
}));
// Exercise the real headless hook with deterministic React state scheduling, not UI frame timing.
function harness() {
  const states: unknown[] = [],
    refs: { current: unknown }[] = [];
  const memos: { value: unknown; deps: unknown[] }[] = [],
    deferred: (() => void)[] = [];
  let stateIndex = 0,
    refIndex = 0,
    memoIndex = 0,
    changed = false,
    defer = false;
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = memoIndex++,
      previous = memos[index];
    if (
      !previous ||
      deps.length !== previous.deps.length ||
      deps.some((value, i) => !Object.is(value, previous.deps[i]))
    )
      memos[index] = { value: factory(), deps };
    return memos[index].value;
  };
  const options: Parameters<typeof useGameListWindow<BggPickerItem>>[0] = {
    scope: "first",
    pages: [
      {
        items: Array.from({ length: 24 }, (_, id) => ({
          id,
          name: `Game ${id}`,
          year: null,
          imageUrl: null,
          source: "collection" as const,
        })),
      },
    ],
    excludedIds: new Set(),
    hasNextPage: false,
    isFetching: false,
    isError: false,
    fetchNextPage: vi.fn(),
  };
  const hooks: Hooks = {
    useRef: (value) => {
      const index = refIndex++;
      refs[index] ??= { current: value };
      return refs[index];
    },
    useState: (value) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = value;
      return [
        states[index],
        (next) => {
          const update = () => {
            const value = typeof next === "function" ? next(states[index]) : next;
            changed ||= !Object.is(states[index], value);
            states[index] = value;
          };
          if (defer) deferred.push(update);
          else update();
        },
      ];
    },
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
  };
  const render = () => {
    for (let pass = 0; pass < 4; pass++) {
      stateIndex = refIndex = memoIndex = 0;
      changed = false;
      runtime.current = hooks;
      // biome-ignore lint/correctness/useHookAtTopLevel: React is mocked; each pass simulates a complete render with the same hook order.
      const result = useGameListWindow(options);
      if (!changed || defer) return result;
    }
    throw Error("Unsettled game window");
  };
  return {
    options,
    render,
    deferred,
    defer: () => {
      defer = true;
    },
  };
}
it("requires user intent, coalesces same-render cached expansion and never mutates Query pages", () => {
  const h = harness(),
    pages = h.options.pages,
    first = h.render();
  expect(first.items).toHaveLength(8);
  first.endReached();
  expect(h.render().items).toHaveLength(8);
  first.beginScroll();
  first.endReached();
  first.endReached();
  const second = h.render();
  expect(second.items).toHaveLength(16);
  expect(h.options.pages).toBe(pages);
  expect(h.options.fetchNextPage).not.toHaveBeenCalled();
  second.endReached();
  expect(h.render().items).toHaveLength(24);
  expect(h.render().hasMore).toBe(false);
});
it("exhausts cached rows before requesting another source page", () => {
  const h = harness();
  h.options.hasNextPage = true;
  h.render().loadMore();
  h.render().loadMore();
  expect(h.options.fetchNextPage).not.toHaveBeenCalled();
  h.render().loadMore();
  expect(h.options.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  h.options.isFetching = true;
  h.render().loadMore();
  expect(h.options.fetchNextPage).toHaveBeenCalledTimes(1);
});
it.each(["end", "unknown", "fetching", "error"])(
  "does not fetch beyond cache during %s",
  (state) => {
    const h = harness();
    h.options.pages = undefined;
    h.options.hasNextPage = state === "unknown" ? undefined : state !== "end";
    h.options.isFetching = state === "fetching";
    h.options.isError = state === "error";
    h.render().loadMore();
    expect(h.options.fetchNextPage).not.toHaveBeenCalled();
  },
);
it("resets presentation for a new source and rejects detached end/load callbacks", () => {
  const h = harness(),
    old = h.render();
  old.loadMore();
  expect(h.render().items).toHaveLength(16);
  h.options.scope = "second";
  const current = h.render();
  expect(current.items).toHaveLength(8);
  old.beginScroll();
  old.endReached();
  old.loadMore();
  current.endReached();
  expect(h.render().items).toHaveLength(8);
  current.beginScroll();
  current.endReached();
  expect(h.render().items).toHaveLength(16);
});
it("does not apply a lower-priority old-source updater after a new owner reset", () => {
  const h = harness(),
    old = h.render();
  h.defer();
  old.loadMore();
  h.options.scope = "second";
  expect(h.render().items).toHaveLength(8);
  h.deferred[1](); // Higher-priority owner reset commits before the deferred old update.
  h.deferred[0]();
  expect(h.render().items).toHaveLength(8);
});
