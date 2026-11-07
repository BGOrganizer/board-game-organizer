import type { BggPickerItem } from "@board-game-organizer/schemas";
import { useCallback, useMemo, useRef, useState } from "react";
import { gamePickerWindow } from "./gamePickerWindow";

/** One bounded native presentation workflow; canonical Query pages remain untouched. */
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
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const scrolledScope = useRef<string | null>(null);
  const [window, setWindow] = useState({ scope, chunks: 1 });
  if (window.scope !== scope) {
    scrolledScope.current = null;
    setWindow({ scope, chunks: 1 });
  }
  const chunks = window.scope === scope ? window.chunks : 1;
  const { items, hasCachedMore } = useMemo(
    () => gamePickerWindow(pages, chunks, excludedIds),
    [pages, chunks, excludedIds],
  );
  const loadMore = useCallback(() => {
    if (scopeRef.current !== scope) return;
    if (!hasCachedMore && (!hasNextPage || isFetching || isError)) return;
    setWindow((current) =>
      current.scope === scope && current.chunks < chunks + 1
        ? { scope, chunks: chunks + 1 }
        : current,
    );
    if (!hasCachedMore) void fetchNextPage({ cancelRefetch: false });
  }, [scope, hasCachedMore, hasNextPage, isFetching, isError, fetchNextPage, chunks]);
  const beginScroll = useCallback(() => {
    if (scopeRef.current === scope) scrolledScope.current = scope;
  }, [scope]);
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
