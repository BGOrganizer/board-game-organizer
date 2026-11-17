// @vitest-environment jsdom
import type { BggPickerItem } from "@board-game-organizer/schemas";
import { QueryClient } from "@tanstack/react-query";
import { Activity, act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { useGameListWindow } from "../hooks/useGameListWindow";

type Options = Parameters<typeof useGameListWindow<BggPickerItem>>[0];
type Result = ReturnType<typeof useGameListWindow<BggPickerItem>>;
const roots = new Map<Root, HTMLDivElement>();
const clients = new Set<QueryClient>();
beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());
afterEach(async () => {
  for (const [root, host] of roots) {
    await act(async () => root.unmount());
    host.remove();
  }
  roots.clear();
  for (const client of clients) client.clear();
  clients.clear();
});
const page = (start: number) => ({
  items: Array.from({ length: 8 }, (_, index) => ({
    id: start + index,
    name: `Game ${start + index}`,
    year: null,
    imageUrl: null,
    source: "collection" as const,
  })),
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Probe({ options, publish }: { options: Options; publish: (result: Result) => void }) {
  const result = useGameListWindow(options);
  publish(result);
  return createElement("output", null, result.items.map((item) => item.id).join(","));
}
async function harness(patch: Partial<Options> = {}, strict = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.set(root, host);
  const client = new QueryClient();
  clients.add(client);
  const retained = Object.freeze([page(0), page(8), page(16)]);
  client.setQueryData(["games", "preview", "actor"], {
    pages: retained,
    pageParams: ["", "8", "16"],
  });
  let options: Options = {
    scope: "preview:actor:collection:snapshot",
    pages: retained,
    excludedIds: new Set(),
    hasNextPage: false,
    isFetching: false,
    isError: false,
    fetchNextPage: vi.fn(async () => {}),
    ...patch,
  };
  let visible = true;
  const results: Result[] = [];
  const render = async () => {
    await act(async () => {
      const activity = createElement(
        Activity,
        { mode: visible ? "visible" : "hidden" },
        createElement(Probe, { options, publish: (value) => results.push(value) }),
      );
      root.render(strict ? createElement(StrictMode, null, activity) : activity);
    });
  };
  await render();
  return {
    client,
    retained,
    results,
    current: () => results[results.length - 1],
    hide: async () => {
      visible = false;
      await render();
    },
    show: async () => {
      visible = true;
      await render();
    },
    update: async (patch: Partial<Options>) => {
      options = { ...options, ...patch };
      await render();
    },
    dispose: async () => {
      await act(async () => root.unmount());
      roots.delete(root);
      host.remove();
    },
  };
}
async function reveal(load: () => unknown) {
  await act(async () => {
    await load();
  });
}
it("resets only the eight-row presentation budget and drag intent across Activity reentry", async () => {
  const network = vi.fn(async () => {});
  const h = await harness({ fetchNextPage: network });
  const initial = h.current();
  await act(async () => initial.endReached());
  expect(h.current().items).toHaveLength(8);
  initial.beginScroll();
  await reveal(initial.endReached);
  await reveal(h.current().loadMore);
  expect(h.current().items).toHaveLength(24);
  const old = h.current();
  await h.hide();
  await reveal(old.loadMore);
  await h.show();
  expect(h.current().items).toHaveLength(8);
  old.beginScroll();
  await reveal(old.endReached);
  await reveal(h.current().endReached);
  expect(h.current().items).toHaveLength(8);
  h.current().beginScroll();
  await reveal(h.current().endReached);
  expect(h.current().items).toHaveLength(16);
  expect(
    h.client.getQueryData<{ pages: typeof h.retained }>(["games", "preview", "actor"])?.pages,
  ).toEqual(h.retained);
  expect(network).not.toHaveBeenCalled();
});
it("coalesces repeated cached and network callbacks before React commits", async () => {
  const request = deferred(),
    network = vi.fn(() => request.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  const old = h.current().loadMore;
  let pending!: Promise<void>;
  await act(async () => {
    pending = old();
    void old();
    void old();
  });
  expect(network).toHaveBeenCalledOnce();
  request.resolve();
  await act(async () => pending);
  await h.update({ pages: [page(0), page(8), page(16)] });
  const next = h.current().loadMore;
  await act(async () => {
    await next();
    await next();
  });
  expect(h.current().items).toHaveLength(24);
});
it("rejects previous-activation callbacks and keeps an old finally from unlocking the new fetch", async () => {
  const old = deferred(),
    fresh = deferred();
  const network = vi
    .fn()
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => fresh.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  const stale = h.current().loadMore;
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => {
    first = stale();
  });
  await h.hide();
  await h.show();
  await reveal(stale);
  expect(network).toHaveBeenCalledOnce();
  await act(async () => {
    second = h.current().loadMore();
  });
  await h.update({ pages: [page(0), page(8), page(16)] });
  await act(async () => {
    old.resolve();
    await first;
  });
  await reveal(h.current().loadMore);
  expect(h.current().items).toHaveLength(16);
  expect(network).toHaveBeenCalledTimes(2);
  await act(async () => {
    fresh.resolve();
    await second;
  });
  await reveal(h.current().loadMore);
  expect(h.current().items).toHaveLength(24);
});
it("resets API/user/snapshot scopes, including a changed owner while hidden", async () => {
  const network = vi.fn(async () => {});
  const h = await harness({ fetchNextPage: network });
  const old = h.current();
  await reveal(old.loadMore);
  await h.update({ scope: "other-api:other-actor:other-snapshot", pages: [page(100)] });
  expect(h.current().items[0].id).toBe(100);
  expect(h.current().items).toHaveLength(8);
  old.beginScroll();
  await reveal(old.loadMore);
  await reveal(h.current().endReached);
  expect(network).not.toHaveBeenCalled();
  await h.hide();
  await h.update({ scope: "hidden-owner", pages: [page(200)], hasNextPage: true });
  await reveal(h.current().loadMore);
  expect(network).not.toHaveBeenCalled();
  await h.show();
  await reveal(h.current().loadMore);
  expect(network).toHaveBeenCalledOnce();
});
it("refreshes callbacks after StrictMode cleanup/recreate without disabling paging", async () => {
  const h = await harness({}, true);
  const initial = h.results[0];
  expect(initial.loadMore).not.toBe(h.current().loadMore);
  initial.beginScroll();
  await reveal(initial.loadMore);
  expect(h.current().items).toHaveLength(8);
  await reveal(h.current().loadMore);
  expect(h.current().items).toHaveLength(16);
  await h.hide();
  await h.show();
  expect(h.current().items).toHaveLength(8);
  await reveal(h.current().loadMore);
  expect(h.current().items).toHaveLength(16);
});
it("retains the raw-row budget when exclusions or empty cached pages yield no visible rows", async () => {
  const network = vi.fn(async () => {});
  const pages = [{ items: [] }, page(0), page(8)];
  const h = await harness({
    pages,
    excludedIds: new Set(page(0).items.map((item) => item.id)),
    fetchNextPage: network,
  });
  expect(h.current().items).toEqual([]);
  await reveal(h.current().loadMore);
  expect(h.current().items).toEqual([]);
  await reveal(h.current().loadMore);
  expect(h.current().items).toEqual(page(8).items);
  expect(network).not.toHaveBeenCalled();
});
it("releases an active request after failure and ignores callbacks after disposal", async () => {
  const network = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const h = await harness({ pages: undefined, hasNextPage: true, fetchNextPage: network });
  await act(async () => {
    await expect(h.current().loadMore()).rejects.toThrow("offline");
  });
  await reveal(h.current().loadMore);
  expect(network).toHaveBeenCalledTimes(2);
  const stale = h.current();
  await h.dispose();
  stale.beginScroll();
  await reveal(stale.loadMore);
  expect(network).toHaveBeenCalledTimes(2);
});

it("does not let a previous owner's pending request clear the current owner's loading gate", async () => {
  const old = deferred(),
    fresh = deferred();
  const network = vi
    .fn()
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => fresh.promise);
  const h = await harness({ pages: [page(0)], hasNextPage: true, fetchNextPage: network });
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => {
    first = h.current().loadMore();
  });
  await h.update({ scope: "other-api:other-owner:snapshot", pages: [page(100)] });
  await act(async () => {
    second = h.current().loadMore();
  });
  await h.update({ pages: [page(100), page(108), page(116)] });
  await act(async () => {
    old.resolve();
    await first;
  });
  await reveal(h.current().loadMore);
  expect(h.current().items).toHaveLength(16);
  expect(network).toHaveBeenCalledTimes(2);
  await act(async () => {
    fresh.resolve();
    await second;
  });
  await reveal(h.current().loadMore);
  expect(h.current().items).toHaveLength(24);
});
