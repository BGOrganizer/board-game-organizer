import type { BggPickerItem } from "@board-game-organizer/schemas";
import { useGameListWindow } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { Activity, startTransition, useLayoutEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";

type Options = Parameters<typeof useGameListWindow<BggPickerItem>>[0];
type Result = ReturnType<typeof useGameListWindow<BggPickerItem>>;
const clients = new Set<QueryClient>();
afterEach(() => {
  for (const client of clients) client.clear();
  clients.clear();
});

const page = (start = 0, count = 24) => ({
  items: Array.from(
    { length: count },
    (_, offset): BggPickerItem => ({
      id: start + offset + 1,
      name: `Game ${start + offset + 1}`,
      year: null,
      imageUrl: null,
      source: "collection",
    }),
  ),
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
  useLayoutEffect(() => publish(result), [publish, result]);
  return (
    <output aria-label="Visible game IDs">{result.items.map((item) => item.id).join(",")}</output>
  );
}
function setup(patch: Partial<Options> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.add(client);
  const key = ["games", "api-one", "user-one", "snapshot-one"];
  const canonical = { pages: Object.freeze([page()]), pageParams: [""] };
  client.setQueryData(key, canonical);
  let options: Options = {
    scope: JSON.stringify(key),
    pages: canonical.pages,
    excludedIds: new Set(),
    hasNextPage: false,
    isFetching: false,
    isError: false,
    fetchNextPage: vi.fn(async () => {}),
    ...patch,
  };
  let visible = true;
  let current!: Result;
  const publish = (value: Result) => {
    current = value;
  };
  const element = () => (
    <QueryClientProvider client={client}>
      <Activity mode={visible ? "visible" : "hidden"}>
        <Probe options={options} publish={publish} />
      </Activity>
    </QueryClientProvider>
  );
  const view = render(element());
  return {
    client,
    key,
    canonical,
    view,
    current: () => current,
    update: (change: Partial<Options>) => {
      options = { ...options, ...change };
      view.rerender(element());
    },
    visibility: (next: boolean) => {
      visible = next;
      view.rerender(element());
    },
  };
}

it("requires drag intent, coalesces same-commit end events and preserves the complete Query snapshot", async () => {
  const h = setup();
  const first = h.current();
  expect(first.items).toHaveLength(8);
  await act(async () => first.endReached());
  expect(h.current().items).toHaveLength(8);
  await act(async () => {
    first.beginScroll();
    first.endReached();
    first.endReached();
  });
  expect(h.current().items).toHaveLength(16);
  await act(async () => h.current().endReached());
  expect(h.current().items).toHaveLength(24);
  expect(h.current().hasMore).toBe(false);
  expect(h.client.getQueryData(h.key)).toBe(h.canonical);
  expect(h.current().items).toEqual(h.canonical.pages[0].items);
});

it("exhausts cached rows before fetching and rejects concurrent network requests until completion", async () => {
  const pending = deferred();
  const fetchNextPage = vi.fn(() => pending.promise);
  const h = setup({ hasNextPage: true, fetchNextPage });
  await act(async () => h.current().loadMore());
  await act(async () => h.current().loadMore());
  expect(fetchNextPage).not.toHaveBeenCalled();
  const old = h.current().loadMore;
  let request!: Promise<void>;
  await act(async () => {
    request = old();
    void old();
    void old();
  });
  expect(fetchNextPage).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
  h.update({ isFetching: true });
  await act(async () => h.current().loadMore());
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve();
    await request;
  });
});

it.each(["end", "unknown", "fetching", "error"] as const)(
  "does not fetch beyond the window during %s",
  async (state) => {
    const fetchNextPage = vi.fn(async () => {});
    const h = setup({
      pages: undefined,
      hasNextPage: state === "unknown" ? undefined : state !== "end",
      isFetching: state === "fetching",
      isError: state === "error",
      fetchNextPage,
    });
    await act(async () => h.current().loadMore());
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Visible game IDs" })).toBeEmptyDOMElement();
  },
);

it("resets account/API/snapshot presentation and rejects detached scroll/load callbacks", async () => {
  const fetchNextPage = vi.fn(async () => {});
  const h = setup({ fetchNextPage });
  const old = h.current();
  await act(async () => old.loadMore());
  expect(h.current().items).toHaveLength(16);
  h.update({ scope: "api-two:user-two:snapshot-two", pages: [page(100)] });
  const current = h.current();
  expect(current.items).toHaveLength(8);
  expect(current.items[0].id).toBe(101);
  await act(async () => {
    old.beginScroll();
    old.endReached();
    await old.loadMore();
    current.endReached();
  });
  expect(h.current().items).toHaveLength(8);
  await act(async () => {
    current.beginScroll();
    current.endReached();
  });
  expect(h.current().items).toHaveLength(16);
  expect(fetchNextPage).not.toHaveBeenCalled();
  expect(h.client.getQueryData(h.key)).toBe(h.canonical);
});

it("does not apply a lower-priority cached expansion to a newer source", async () => {
  const h = setup();
  const old = h.current();
  await act(async () => {
    startTransition(() => {
      void old.loadMore();
    });
    h.update({ scope: "new-api:new-owner:new-snapshot", pages: [page(100)] });
  });
  expect(h.current().items.map((item) => item.id)).toEqual(
    page(100, 8).items.map((item) => item.id),
  );
});

it("resets hidden Activity presentation before reentry and rejects callbacks captured before hide", async () => {
  const h = setup();
  const old = h.current();
  await act(async () => {
    startTransition(() => {
      void old.loadMore();
    });
    h.visibility(false);
  });
  h.visibility(true);
  expect(h.current().items).toHaveLength(8);
  await act(async () => {
    old.beginScroll();
    old.endReached();
    await old.loadMore();
  });
  expect(h.current().items).toHaveLength(8);
  await act(async () => h.current().loadMore());
  expect(h.current().items).toHaveLength(16);
  expect(h.client.getQueryData(h.key)).toBe(h.canonical);
});

it("does not let an older owner's finally release the current owner's request gate", async () => {
  const old = deferred();
  const fresh = deferred();
  const fetchNextPage = vi
    .fn()
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => fresh.promise);
  const h = setup({ pages: [page(0, 8)], hasNextPage: true, fetchNextPage });
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => {
    first = h.current().loadMore();
  });
  h.update({ scope: "new-owner", pages: [page(100, 8)] });
  await act(async () => {
    second = h.current().loadMore();
  });
  h.update({ pages: [page(100, 24)] });
  await act(async () => {
    old.resolve();
    await first;
    await h.current().loadMore();
  });
  expect(h.current().items).toHaveLength(16);
  expect(fetchNextPage).toHaveBeenCalledTimes(2);
  await act(async () => {
    fresh.resolve();
    await second;
  });
  await act(async () => h.current().loadMore());
  expect(h.current().items).toHaveLength(24);
});

it("bounds empty/excluded cached pages, releases failed requests, and ignores callbacks after unmount", async () => {
  const fetchNextPage = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const h = setup({
    pages: [{ items: [] }, page(0, 8), page(8, 8)],
    excludedIds: new Set(page(0, 8).items.map((item) => item.id)),
    hasNextPage: true,
    fetchNextPage,
  });
  expect(h.current().items).toEqual([]);
  await act(async () => h.current().loadMore());
  expect(h.current().items).toEqual([]);
  await act(async () => h.current().loadMore());
  expect(h.current().items).toEqual(page(8, 8).items);
  expect(fetchNextPage).not.toHaveBeenCalled();
  await act(async () => {
    await expect(h.current().loadMore()).rejects.toThrow("offline");
  });
  await act(async () => h.current().loadMore());
  expect(fetchNextPage).toHaveBeenCalledTimes(2);
  const old = h.current();
  h.view.unmount();
  await act(async () => {
    old.beginScroll();
    old.endReached();
    await old.loadMore();
  });
  expect(fetchNextPage).toHaveBeenCalledTimes(2);
});
