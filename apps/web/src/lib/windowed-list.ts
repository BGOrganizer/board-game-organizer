export function windowedListLayout(
  keys: readonly string[],
  measured: ReadonlyMap<string, number>,
  estimate: number,
  gap: number,
  viewportTop: number,
  viewportHeight: number,
  overscan = 400,
) {
  const offsets: number[] = [];
  const heights: number[] = [];
  let total = 0;
  for (const key of keys) {
    offsets.push(total);
    const height = measured.get(key) ?? estimate;
    heights.push(height);
    total += height + gap;
  }
  if (keys.length) total -= gap;
  const lower = Math.max(0, viewportTop - overscan);
  const upper = Math.max(0, viewportTop + viewportHeight + overscan);
  let start = 0;
  while (start < keys.length && offsets[start] + heights[start] < lower) start++;
  let end = start;
  while (end < keys.length && offsets[end] <= upper) end++;
  return { offsets, start, end, total };
}
