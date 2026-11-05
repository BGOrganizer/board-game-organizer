import type { BggPickerItem } from "@board-game-organizer/schemas";

/** Limit presentation, not the canonical Query cache or its source cursors. */
export function gamePickerWindow(
  pages: readonly { items: readonly BggPickerItem[] }[] | undefined,
  pageCount: number,
  excludedIds: ReadonlySet<number>,
) {
  return {
    items: (pages?.slice(0, pageCount).flatMap((page) => page.items) ?? []).filter(
      (item) => !excludedIds.has(item.id),
    ),
    hasCachedMore: (pages?.length ?? 0) > pageCount,
  };
}
