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
