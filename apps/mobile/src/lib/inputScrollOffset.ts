export function inputScrollOffset({
  offset,
  fieldTop,
  fieldHeight,
  viewportTop,
  viewportHeight,
  fontScale,
  anchorTop,
}: {
  offset: number;
  fieldTop: number;
  fieldHeight: number;
  viewportTop: number;
  viewportHeight: number;
  fontScale: number;
  anchorTop?: number;
}) {
  const gap = Math.min(64 * fontScale, Math.max(0, viewportHeight - fieldHeight - 16));
  const labelFits =
    anchorTop !== undefined &&
    anchorTop <= fieldTop &&
    fieldTop + fieldHeight - anchorTop <= viewportHeight - 32;
  return Math.max(0, offset + (labelFits ? anchorTop - 16 : fieldTop - gap) - viewportTop);
}
