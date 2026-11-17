"use client";

import type { BggPickerItem } from "@board-game-organizer/schemas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gamePickerWindow } from "../gamePickerWindow";

/** Bounded presentation workflow; canonical Query pages remain untouched. */
export function useGameListWindow<T extends BggPickerItem>({
  scope,
  pages,
  excludedIds,
  hasNextPage,
  isFetching,
  isError,
  fetchNextPage,
}: {
  scope: string;
  pages: readonly { items: readonly T[] }[] | undefined;
  excludedIds: ReadonlySet<number>;
  hasNextPage?: boolean;
  isFetching: boolean;
  isError: boolean;
  fetchNextPage: (options: { cancelRefetch: false }) => unknown;
}) {
  const scrolledScope = useRef<string | null>(null);
  const [window, setWindow] = useState({ scope, chunks: 1 });
  const gate = useRef({ scope, chunks: 1, active: false, epoch: 0, loading: false });
  if (window.scope !== scope) {
    gate.current = { scope, chunks: 1, active: false, epoch: 0, loading: false };
    scrolledScope.current = null;
    setWindow({ scope, chunks: 1 });
  }
  const chunks = window.scope === scope ? window.chunks : 1;
  const generation = gate.current;
  const activation = generation.epoch;
  useEffect(() => {
    generation.active = true;
    return () => {
      generation.active = false;
      generation.epoch++;
      generation.chunks = 1;
      generation.loading = false;
      if (gate.current === generation) {
        scrolledScope.current = null;
        // Publish even the first chunk again so StrictMode refreshes captured epochs.
        setWindow({ scope, chunks: 1 });
      }
    };
  }, [generation, scope]);
  const { items, hasCachedMore } = useMemo(
    () => gamePickerWindow(pages, chunks, excludedIds),
    [pages, chunks, excludedIds],
  );
  const loadMore = useCallback(async () => {
    if (
      gate.current !== generation ||
      !generation.active ||
      generation.epoch !== activation ||
      generation.chunks !== chunks ||
      generation.loading
    )
      return;
    if (!hasCachedMore && (!hasNextPage || isFetching || isError)) return;
    generation.chunks++;
    setWindow((current) =>
      gate.current === generation && generation.epoch === activation
        ? { scope, chunks: chunks + 1 }
        : current,
    );
    if (!hasCachedMore) {
      generation.loading = true;
      try {
        await fetchNextPage({ cancelRefetch: false });
      } finally {
        if (gate.current === generation && generation.epoch === activation)
          generation.loading = false;
      }
    }
  }, [
    scope,
    generation,
    activation,
    hasCachedMore,
    hasNextPage,
    isFetching,
    isError,
    fetchNextPage,
    chunks,
  ]);
  const beginScroll = useCallback(() => {
    if (gate.current === generation && generation.active && generation.epoch === activation)
      scrolledScope.current = scope;
  }, [scope, generation, activation]);
  const endReached = useCallback(() => {
    if (scrolledScope.current === scope) loadMore();
  }, [scope, loadMore]);
  return {
    items,
    hasCachedMore,
    hasMore: hasCachedMore || hasNextPage,
    loadMore,
    beginScroll,
    endReached,
  };
}
