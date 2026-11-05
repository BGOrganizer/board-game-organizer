import type { BggPickerItem } from "@board-game-organizer/schemas";

export const GAME_PICKER_CHUNK_SIZE = 8;

/** Limit presentation, not the canonical Query cache or its source cursors. */
export function gamePickerWindow(
  pages: readonly { items: readonly BggPickerItem[] }[] | undefined,
  chunkCount: number,
  excludedIds: ReadonlySet<number>,
) {
  const items: BggPickerItem[] = [];
  let remaining = chunkCount;
  let hasCachedMore = false;
  for (const page of pages ?? []) {
    if (remaining <= 0) {
      hasCachedMore = true;
      break;
    }
    const take = Math.min(page.items.length, remaining * GAME_PICKER_CHUNK_SIZE);
    items.push(...page.items.slice(0, take).filter((item) => !excludedIds.has(item.id)));
    // Empty/excluded pages must not trigger an unbounded scan on initial entry.
    remaining -= Math.max(1, Math.ceil(take / GAME_PICKER_CHUNK_SIZE));
    if (take < page.items.length) {
      hasCachedMore = true;
      break;
    }
  }
  return { items, hasCachedMore };
}
