/** Ignore adjacent native pixels so content measurement cannot resize its own viewport forever. */
export function stableTabContentWidth(previous: number, measured: number, pixelRatio: number) {
  return Math.abs(Math.round(previous * pixelRatio) - Math.round(measured * pixelRatio)) <= 1
    ? previous
    : measured;
}

/** Reveal only clipped tabs; centering an already visible tab shifts retained headers twice. */
export function revealedTabOffset(
  offset: number,
  tabX: number,
  tabWidth: number,
  viewportWidth: number,
  contentWidth: number,
) {
  if (viewportWidth <= 0 || tabWidth <= 0 || contentWidth <= 0) return offset;
  const max = Math.max(0, contentWidth - viewportWidth);
  const current = Math.max(0, Math.min(offset, max));
  const target =
    tabWidth > viewportWidth || tabX < current
      ? tabX
      : tabX + tabWidth > current + viewportWidth
        ? tabX + tabWidth - viewportWidth
        : current;
  return Math.max(0, Math.min(target, max));
}
