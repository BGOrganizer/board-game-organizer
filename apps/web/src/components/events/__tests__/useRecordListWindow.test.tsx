import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useRecordListWindow } from "../../../../../../packages/shared/src/events/hooks/useRecordListWindow";

const base = () => ({
  scope: "owner/query",
  pages: undefined as { items: number[] }[] | undefined,
  hasNextPage: false,
  isFetching: false,
  fetchNextPage: vi.fn(async () => undefined),
});

it("bounds large retained pages, coalesces cache reveals and resets on query/account changes", async () => {
  const options = { ...base(), pages: [{ items: Array.from({ length: 45 }, (_, i) => i) }] };
  const { result, rerender } = renderHook(useRecordListWindow<number>, { initialProps: options });
  expect(result.current.items).toHaveLength(20);
  expect(result.current.hasNextPage).toBe(true);
  const first = result.current.fetchNextPage;
  await act(async () => {
    await Promise.all([first(), first()]);
  });
  expect(result.current.items).toHaveLength(40);
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(result.current.items).toHaveLength(45);
  expect(result.current.hasNextPage).toBe(false);
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(options.fetchNextPage).not.toHaveBeenCalled();
  rerender({ ...options, scope: "another-owner/query" });
  expect(result.current.items).toHaveLength(20);
  await act(async () => {
    await first();
  });
  expect(result.current.items).toHaveLength(20);
});

it("does not scan beyond the visible page even when pages are empty", async () => {
  const options = { ...base(), pages: [{ items: [] }, { items: [1] }, { items: [2] }] };
  const { result } = renderHook(useRecordListWindow<number>, { initialProps: options });
  expect(result.current.items).toEqual([]);
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(result.current.items).toEqual([1]);
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(result.current.items).toEqual([1, 2]);
  expect(result.current.hasNextPage).toBe(false);
});

it("guards network reads and does not publish old completions after a scope change", async () => {
  let finish!: () => void;
  const fetchNextPage = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const options = { ...base(), hasNextPage: true, fetchNextPage };
  const { result, rerender } = renderHook(useRecordListWindow<number>, { initialProps: options });
  let request!: Promise<void>;
  act(() => {
    request = result.current.fetchNextPage();
  });
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  rerender({ ...options, scope: "new-query" });
  await act(async () => {
    finish();
    await request;
  });
  rerender({
    ...options,
    scope: "new-query",
    pages: [{ items: Array.from({ length: 30 }, (_, i) => i) }],
  });
  expect(result.current.items).toHaveLength(20);
});

it("reveals newly fetched data once, keeps failures observable, and permits retry", async () => {
  const options = { ...base(), hasNextPage: true };
  const { result, rerender } = renderHook(useRecordListWindow<number>, { initialProps: options });
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(options.fetchNextPage).toHaveBeenCalledTimes(1);
  rerender({ ...options, pages: [{ items: [1] }, { items: [2] }] });
  expect(result.current.items).toEqual([1, 2]);
  rerender({ ...options, isFetching: true });
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(options.fetchNextPage).toHaveBeenCalledTimes(1);
  const fail = vi.fn(async () => {
    throw new Error("offline");
  });
  rerender({ ...options, fetchNextPage: fail });
  await act(async () => {
    await expect(result.current.fetchNextPage()).rejects.toThrow("offline");
  });
  await act(async () => {
    await expect(result.current.fetchNextPage()).rejects.toThrow("offline");
  });
  expect(fail).toHaveBeenCalledTimes(2);
});

it("rejects callbacks from a previous mount or a previous generation of the same query", async () => {
  const options = { ...base(), hasNextPage: true };
  const { result, rerender, unmount } = renderHook(useRecordListWindow<number>, {
    initialProps: options,
  });
  const stale = result.current.fetchNextPage;
  rerender({ ...options, scope: "temporary" });
  rerender(options);
  await act(async () => {
    await stale();
  });
  expect(options.fetchNextPage).not.toHaveBeenCalled();
  const afterUnmount = result.current.fetchNextPage;
  unmount();
  await afterUnmount();
  expect(options.fetchNextPage).not.toHaveBeenCalled();
});

it("reads custom source pages lazily at their page size and keeps unchanged projections and callbacks stable", async () => {
  const getItems = vi.fn((page: { rows: number[] }) => page.rows);
  const pages = Array.from({ length: 300 }, (_, page) => ({
    rows: Array.from({ length: 25 }, (_, row) => page * 25 + row),
  }));
  const options = { ...base(), pages, getItems, pageSize: 25 };
  const view = renderHook(useRecordListWindow<number, { rows: number[] }>, {
    initialProps: options,
  });
  expect(view.result.current.items).toHaveLength(25);
  expect(getItems).toHaveBeenCalledTimes(1);
  const items = view.result.current.items;
  const more = view.result.current.fetchNextPage;
  view.rerender({ ...options, fetchNextPage: vi.fn(async () => undefined) });
  expect(view.result.current.items).toBe(items);
  expect(view.result.current.fetchNextPage).toBe(more);
  await act(async () => {
    await Promise.all([more(), more()]);
  });
  expect(view.result.current.items).toHaveLength(50);
  expect(getItems).toHaveBeenCalledTimes(3);
  expect(pages).toHaveLength(300);
  view.rerender({ ...options, scope: "owner/query/new-snapshot" });
  expect(view.result.current.items).toHaveLength(25);
  await act(async () => {
    await more();
  });
  expect(view.result.current.items).toHaveLength(25);
});

it("uses the current request adapter without recreating callbacks or reading after unmount", async () => {
  const options = { ...base(), hasNextPage: true };
  const view = renderHook(useRecordListWindow<number>, { initialProps: options });
  const more = view.result.current.fetchNextPage;
  const replacement = vi.fn(async () => undefined);
  view.rerender({ ...options, fetchNextPage: replacement });
  expect(view.result.current.fetchNextPage).toBe(more);
  await act(async () => {
    await more();
  });
  expect(options.fetchNextPage).not.toHaveBeenCalled();
  expect(replacement).toHaveBeenCalledOnce();
  const afterUnmount = view.result.current.fetchNextPage;
  view.unmount();
  await afterUnmount();
  expect(replacement).toHaveBeenCalledOnce();
});
