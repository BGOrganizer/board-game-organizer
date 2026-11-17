"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WindowOptions = {
  scope: string;
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => Promise<unknown>;
  pageSize?: number;
};
type WindowResult<T> = {
  items: T[];
  cachedMore: boolean;
  hasNextPage: boolean;
  resetPresentation: () => void;
  fetchNextPage: (_options?: { cancelRefetch?: boolean }) => Promise<void>;
};

/** Reveal retained pages progressively; never change the authoritative Query pages. */
export function useRecordListWindow<T>(
  options: WindowOptions & { pages: readonly { items: readonly T[] }[] | undefined },
): WindowResult<T>;
export function useRecordListWindow<T, Page>(
  options: WindowOptions & {
    pages: readonly Page[] | undefined;
    getItems: (page: Page) => readonly T[];
  },
): WindowResult<T>;
export function useRecordListWindow<T, Page>({
  scope,
  pages,
  hasNextPage,
  isFetching,
  fetchNextPage,
  pageSize = 20,
  getItems,
}: WindowOptions & {
  pages: readonly Page[] | undefined;
  getItems?: (page: Page) => readonly T[];
}): WindowResult<T> {
  const fetchCurrent = useRef(fetchNextPage);
  fetchCurrent.current = fetchNextPage;
  const [window, setWindow] = useState({ scope, chunks: 1 });
  const gate = useRef({ scope, chunks: 1, loading: false, active: false, epoch: 0 });
  if (window.scope !== scope) {
    gate.current = { scope, chunks: 1, loading: false, active: false, epoch: 0 };
    setWindow({ scope, chunks: 1 });
  }
  const chunks = window.scope === scope ? window.chunks : 1;
  const generation = gate.current;
  const activation = generation.epoch;
  const resetPresentation = useCallback(() => {
    generation.epoch++;
    generation.chunks = 1;
    generation.loading = false;
    // Keep Query pages intact and never let an old owner overwrite a newer window.
    // Always publish a new object so StrictMode cleanup/recreate refreshes captured epochs.
    if (gate.current === generation) setWindow({ scope, chunks: 1 });
  }, [generation, scope]);
  useEffect(() => {
    generation.active = true;
    return () => {
      generation.active = false;
      resetPresentation();
    };
  }, [generation, resetPresentation]);
  const visible = useMemo(() => {
    const items: T[] = [];
    let remaining = chunks * pageSize;
    let hasCachedMore = false;
    for (const page of pages ?? []) {
      if (remaining <= 0) {
        hasCachedMore = true;
        break;
      }
      const rows = getItems ? getItems(page) : (page as { items: readonly T[] }).items;
      const take = Math.min(rows.length, remaining);
      items.push(...rows.slice(0, take));
      // An empty retained page still consumes one page of presentation work.
      remaining -= Math.max(pageSize, take);
      if (take < rows.length) {
        hasCachedMore = true;
        break;
      }
    }
    return { items, hasCachedMore };
  }, [pages, chunks, pageSize, getItems]);
  const fetch = useCallback(
    async (_options?: { cancelRefetch?: boolean }) => {
      const current = gate.current;
      if (
        current !== generation ||
        !current.active ||
        current.epoch !== activation ||
        current.chunks !== chunks ||
        current.loading
      )
        return;
      if (visible.hasCachedMore) {
        current.chunks++;
        setWindow({ scope, chunks: current.chunks });
        return;
      }
      if (!hasNextPage || isFetching) return;
      current.loading = true;
      try {
        await fetchCurrent.current();
        if (gate.current === current && current.active && current.epoch === activation) {
          current.chunks++;
          setWindow({ scope, chunks: current.chunks });
        }
      } finally {
        if (gate.current === current && current.epoch === activation) current.loading = false;
      }
    },
    [scope, generation, activation, chunks, visible.hasCachedMore, hasNextPage, isFetching],
  );
  return {
    items: visible.items,
    cachedMore: visible.hasCachedMore,
    hasNextPage: visible.hasCachedMore || hasNextPage,
    resetPresentation,
    fetchNextPage: fetch,
  };
}
