// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { Activity, act, createElement, StrictMode } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { useRecordListWindow } from "../hooks/useRecordListWindow";

type Item = { id: number };
type Page = { items: readonly Item[] };
type Options = {
  scope: string;
  pages: readonly Page[] | undefined;
  pageSize?: number;
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => Promise<unknown>;
};
type Result = {
  items: Item[];
  hasNextPage: boolean;
  resetPresentation: () => void;
  fetchNextPage: (_options?: { cancelRefetch?: boolean }) => Promise<void>;
};
const roots = new Map<Root, HTMLDivElement>();
const clients = new Set<QueryClient>();
beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());
afterEach(async () => {
  for (const [root, container] of roots) {
    await act(async () => root.unmount());
    container.remove();
  }
  roots.clear();
  for (const client of clients) client.clear();
  clients.clear();
});
const items = (start: number, count = 20): Item[] =>
  Array.from({ length: count }, (_, index) => ({ id: start + index }));
const page = (start: number, count = 20): Page => ({ items: items(start, count) });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mountPoint() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.set(root, container);
  return { root, container };
}
function Probe({ options, publish }: { options: Options; publish: (result: Result) => void }) {
  const result = useRecordListWindow(options);
  publish(result);
  return createElement("output", null, result.items.map((row) => row.id).join(","));
}
async function harness(options: Partial<Options> = {}, strict = false) {
  const { root, container } = mountPoint();
  let currentOptions: Options = {
    scope: "preview:actor:list",
    pages: [page(0), page(20), page(40)],
    hasNextPage: false,
    isFetching: false,
    fetchNextPage: vi.fn(async () => {}),
    ...options,
  };
  let shown = true;
  const results: Result[] = [];
  const publish = (result: Result) => {
    results.push(result);
  };
  const render = async () => {
    await act(async () => {
      const panel = createElement(
        Activity,
        { mode: shown ? "visible" : "hidden" },
        createElement(Probe, { options: currentOptions, publish }),
      );
      root.render(strict ? createElement(StrictMode, null, panel) : panel);
    });
  };
  await render();
  return {
    container,
    results,
    current: () => results[results.length - 1],
    update: async (patch: Partial<Options>) => {
      currentOptions = { ...currentOptions, ...patch };
      await render();
    },
    hide: async () => {
      shown = false;
      await render();
    },
    show: async () => {
      shown = true;
      await render();
    },
    dispose: async () => {
      await act(async () => root.unmount());
      roots.delete(root);
      container.remove();
    },
  };
}
async function reveal(fetch: Result["fetchNextPage"]) {
  await act(async () => {
    await fetch();
  });
}

it("resets only presentation on Activity hide/reentry while retaining every canonical Query page", async () => {
  const retained = Object.freeze([page(0), page(20), page(40)]);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  clients.add(client);
  const key = ["records", "preview", "actor"];
  client.setQueryData(key, { pages: retained, pageParams: ["", "next", "last"] });
  const canonical = client.getQueryData<{ pages: readonly Page[] }>(key);
  if (!canonical) throw new Error("Missing canonical pages");
  const network = vi.fn(async () => {});
  const h = await harness({ pages: canonical.pages, fetchNextPage: network });
  const first = h.current().fetchNextPage;
  expect(h.current().items).toHaveLength(20);
  await reveal(first);
  expect(h.current().items).toHaveLength(40);
  await reveal(first); // A stale end event cannot reveal the same chunk twice.
  expect(h.current().items).toHaveLength(40);
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(60);
  expect(h.current().hasNextPage).toBe(false);
  const beforeHide = h.current().fetchNextPage;
  await h.hide();
  expect(h.container.querySelector("output")?.style.display).toBe("none");
  await reveal(beforeHide);
  await h.show();
  expect(h.current().items).toHaveLength(20);
  expect(h.container.querySelector("output")?.textContent?.split(",")).toHaveLength(20);
  expect(client.getQueryData(key)).toBe(canonical);
  expect(canonical.pages).toBe(retained);
  expect(canonical.pages).toHaveLength(3);
  expect(network).not.toHaveBeenCalled();
});

it("keeps oversized and empty cached pages within the existing progressive presentation budget", async () => {
  const network = vi.fn(async () => {});
  const oversized = await harness({ pages: [page(0, 35), page(35)], fetchNextPage: network });
  expect(oversized.current().items).toHaveLength(20);
  await reveal(oversized.current().fetchNextPage);
  expect(oversized.current().items).toHaveLength(40);
  expect(oversized.current().hasNextPage).toBe(true);
  await reveal(oversized.current().fetchNextPage);
  expect(oversized.current().items).toHaveLength(55);
  expect(oversized.current().hasNextPage).toBe(false);
  const empty = await harness({ pages: [page(0, 0), page(20)], fetchNextPage: network });
  expect(empty.current().items).toHaveLength(0);
  expect(empty.current().hasNextPage).toBe(true);
  await reveal(empty.current().fetchNextPage);
  expect(empty.current().items).toEqual(items(20));
  expect(network).not.toHaveBeenCalled();
});

it("handles absent pages and waits for an idle source with a next page before fetching", async () => {
  const network = vi.fn(async () => {});
  const h = await harness({ pages: undefined, fetchNextPage: network });
  expect(h.current().items).toEqual([]);
  expect(h.current().hasNextPage).toBe(false);
  await reveal(h.current().fetchNextPage);
  await h.update({ pages: [], hasNextPage: true, isFetching: true });
  await reveal(h.current().fetchNextPage);
  expect(network).not.toHaveBeenCalled();
  await h.update({ isFetching: false });
  await reveal(h.current().fetchNextPage);
  expect(network).toHaveBeenCalledOnce();
});

it("coalesces in-flight end events and uses the latest source callback", async () => {
  const request = deferred();
  const oldSource = vi.fn(async () => {}),
    newSource = vi.fn(() => request.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: oldSource });
  const callback = h.current().fetchNextPage;
  await h.update({ fetchNextPage: newSource });
  expect(h.current().fetchNextPage).toBe(callback);
  let pending!: Promise<void>;
  await act(async () => {
    pending = callback({ cancelRefetch: false });
  });
  await reveal(h.current().fetchNextPage);
  expect(oldSource).not.toHaveBeenCalled();
  expect(newSource).toHaveBeenCalledOnce();
  await h.update({ pages: [page(0), page(20)] });
  await act(async () => {
    request.resolve();
    await pending;
  });
  expect(h.current().items).toHaveLength(40);
});

it("keeps a failed fetch observable and releases its current activation for retry", async () => {
  const network = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  await act(async () => {
    await expect(h.current().fetchNextPage()).rejects.toThrow("offline");
  });
  expect(h.current().items).toHaveLength(20);
  await reveal(h.current().fetchNextPage);
  expect(network).toHaveBeenCalledTimes(2);
});

it("ignores an async completion while hidden and starts reentry at one cached chunk", async () => {
  const request = deferred();
  const network = vi.fn(() => request.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.current().fetchNextPage();
  });
  await h.hide();
  await act(async () => {
    request.resolve();
    await pending;
  });
  await h.show();
  await h.update({ pages: [page(0), page(20)] });
  expect(h.current().items).toHaveLength(20);
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(40);
  expect(network).toHaveBeenCalledOnce();
});

it("rejects an old activation and prevents its finally from unlocking a new in-flight fetch", async () => {
  const old = deferred(),
    fresh = deferred();
  const network = vi
    .fn()
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => fresh.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  const oldCallback = h.current().fetchNextPage;
  let oldPending!: Promise<void>, freshPending!: Promise<void>;
  await act(async () => {
    oldPending = oldCallback();
  });
  await h.hide();
  await h.show();
  await reveal(oldCallback);
  expect(network).toHaveBeenCalledOnce();
  await act(async () => {
    freshPending = h.current().fetchNextPage();
  });
  expect(network).toHaveBeenCalledTimes(2);
  await h.update({ pages: [page(0), page(20)] });
  await act(async () => {
    old.resolve();
    await oldPending;
  });
  expect(h.current().items).toHaveLength(20);
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(20);
  expect(network).toHaveBeenCalledTimes(2);
  await act(async () => {
    fresh.resolve();
    await freshPending;
  });
  expect(h.current().items).toHaveLength(40);
});

it("does not let old callbacks or cleanup overwrite a changed API/actor/query scope", async () => {
  const request = deferred();
  const network = vi.fn(() => request.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  const old = h.current().fetchNextPage;
  let pending!: Promise<void>;
  await act(async () => {
    pending = old();
  });
  await h.update({
    scope: "another-api:another-actor:another-query",
    pages: [page(100), page(120)],
    hasNextPage: false,
  });
  expect(h.current().items).toEqual(items(100));
  await reveal(old);
  await act(async () => {
    request.resolve();
    await pending;
  });
  expect(h.current().items).toEqual(items(100));
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toEqual([...items(100), ...items(120)]);
  expect(network).toHaveBeenCalledOnce();
});

it("rejects retained callbacks and completions after actual unmount", async () => {
  const request = deferred();
  const network = vi.fn(() => request.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  const stale = h.current().fetchNextPage;
  let pending!: Promise<void>;
  await act(async () => {
    pending = stale();
  });
  await h.dispose();
  await act(async () => {
    request.resolve();
    await pending;
  });
  await reveal(stale);
  expect(network).toHaveBeenCalledOnce();
});

it("refreshes captured activation callbacks after StrictMode cleanup/recreate and Activity reentry", async () => {
  const network = vi.fn(async () => {});
  const h = await harness({ fetchNextPage: network }, true);
  const initial = h.results[0].fetchNextPage;
  expect(h.current().fetchNextPage).not.toBe(initial);
  await reveal(initial);
  expect(h.current().items).toHaveLength(20);
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(40);
  await h.hide();
  await h.show();
  expect(h.current().items).toHaveLength(20);
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(40);
  expect(network).not.toHaveBeenCalled();
});

type CustomPage = { rows: readonly Item[] };
function CustomProbe({
  options,
  publish,
}: {
  options: Omit<Options, "pages"> & {
    pages: readonly CustomPage[];
    getItems: (page: CustomPage) => readonly Item[];
  };
  publish: (result: Result) => void;
}) {
  const result = useRecordListWindow(options);
  publish(result);
  return createElement("output", null, result.items.length);
}
it("extracts custom pages only within the currently revealed page-size budget", async () => {
  const { root } = mountPoint();
  const pages = [{ rows: items(0, 2) }, { rows: items(2, 2) }, { rows: items(4, 2) }];
  const getItems = vi.fn((page: CustomPage) => page.rows);
  const network = vi.fn(async () => {});
  let result!: Result;
  await act(async () =>
    root.render(
      createElement(CustomProbe, {
        options: {
          scope: "custom",
          pages,
          pageSize: 2,
          hasNextPage: false,
          isFetching: false,
          fetchNextPage: network,
          getItems,
        },
        publish: (next) => {
          result = next;
        },
      }),
    ),
  );
  expect(result.items).toEqual(items(0, 2));
  expect(getItems).toHaveBeenCalledTimes(1);
  expect(getItems).not.toHaveBeenCalledWith(pages[1]);
  await reveal(result.fetchNextPage);
  expect(result.items).toEqual(items(0, 4));
  expect(getItems).not.toHaveBeenCalledWith(pages[2]);
  await reveal(result.fetchNextPage);
  expect(result.items).toEqual(items(0, 6));
  expect(result.hasNextPage).toBe(false);
  expect(network).not.toHaveBeenCalled();
});

it("keeps a new scope inactive until a hidden Activity is shown", async () => {
  const network = vi.fn(async () => {});
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  await h.hide();
  await h.update({ scope: "hidden-new-owner", pages: [page(100)] });
  expect(h.current().items).toEqual(items(100));
  await reveal(h.current().fetchNextPage);
  expect(network).not.toHaveBeenCalled();
  await h.show();
  await reveal(h.current().fetchNextPage);
  expect(network).toHaveBeenCalledOnce();
});

it("explicitly resets a still-mounted parent window without discarding cached pages or changing reset identity", async () => {
  const retained = Object.freeze([page(0), page(20), page(40)]);
  const network = vi.fn(async () => {});
  const h = await harness({ pages: retained, fetchNextPage: network });
  const reset = h.current().resetPresentation;
  await reveal(h.current().fetchNextPage);
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(60);
  expect(h.current().resetPresentation).toBe(reset);
  const previous = h.current().fetchNextPage;
  await act(async () => reset());
  expect(h.current().items).toHaveLength(20);
  expect(h.current().resetPresentation).toBe(reset);
  await reveal(previous);
  expect(h.current().items).toHaveLength(20);
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(40);
  expect(retained).toHaveLength(3);
  expect(network).not.toHaveBeenCalled();
  await h.update({ scope: "new-owner", pages: [page(100), page(120)] });
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(40);
  await act(async () => reset());
  expect(h.current().items).toEqual([...items(100), ...items(120)]);
});

it("invalidates a pending parent fetch on explicit reset and does not unlock its replacement", async () => {
  const old = deferred(),
    fresh = deferred();
  const network = vi
    .fn()
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => fresh.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  const stale = h.current().fetchNextPage;
  let oldPending!: Promise<void>, freshPending!: Promise<void>;
  await act(async () => {
    oldPending = stale();
  });
  await act(async () => h.current().resetPresentation());
  await reveal(stale);
  expect(network).toHaveBeenCalledOnce();
  await act(async () => {
    freshPending = h.current().fetchNextPage();
  });
  await h.update({ pages: [page(0), page(20)] });
  await act(async () => {
    old.resolve();
    await oldPending;
  });
  await reveal(h.current().fetchNextPage);
  expect(h.current().items).toHaveLength(20);
  expect(network).toHaveBeenCalledTimes(2);
  await act(async () => {
    fresh.resolve();
    await freshPending;
  });
  expect(h.current().items).toHaveLength(40);
});
