"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Reveal retained pages progressively; never change the authoritative Query pages. */
export function useRecordListWindow<T>({
  scope,
  pages,
  hasNextPage,
  isFetching,
  fetchNextPage,
}: {
  scope: string;
  pages: readonly { items: readonly T[] }[] | undefined;
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  const [window, setWindow] = useState({ scope, chunks: 1 });
  const gate = useRef({ scope, chunks: 1, loading: false, active: true });
  if (window.scope !== scope) {
    gate.current = { scope, chunks: 1, loading: false, active: true };
    setWindow({ scope, chunks: 1 });
  }
  const chunks = window.scope === scope ? window.chunks : 1;
  const generation = gate.current;
  useEffect(() => {
    generation.active = true;
    return () => {
      generation.active = false;
    };
  }, [generation]);
  const visible = useMemo(() => {
    const items: T[] = [];
    let remaining = chunks * 20;
    let hasCachedMore = false;
    for (const page of pages ?? []) {
      if (remaining <= 0) {
        hasCachedMore = true;
        break;
      }
      const take = Math.min(page.items.length, remaining);
      items.push(...page.items.slice(0, take));
      // An empty retained page still consumes one page of presentation work.
      remaining -= Math.max(20, take);
      if (take < page.items.length) {
        hasCachedMore = true;
        break;
      }
    }
    return { items, hasCachedMore };
  }, [pages, chunks]);
  const fetch = useCallback(
    async (_options?: { cancelRefetch?: boolean }) => {
      const current = gate.current;
      if (current !== generation || !current.active || current.chunks !== chunks || current.loading)
        return;
      if (visible.hasCachedMore) {
        current.chunks++;
        setWindow({ scope, chunks: current.chunks });
        return;
      }
      if (!hasNextPage || isFetching) return;
      current.loading = true;
      try {
        await fetchNextPage();
        if (gate.current === current && current.active) {
          current.chunks++;
          setWindow({ scope, chunks: current.chunks });
        }
      } finally {
        current.loading = false;
      }
    },
    [scope, generation, chunks, visible.hasCachedMore, hasNextPage, isFetching, fetchNextPage],
  );
  return {
    items: visible.items,
    hasNextPage: visible.hasCachedMore || hasNextPage,
    fetchNextPage: fetch,
  };
}
