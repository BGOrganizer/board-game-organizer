/** Ignore adjacent native pixels so content measurement cannot resize its own viewport forever. */
export function stableTabContentWidth(previous: number, measured: number, pixelRatio: number) {
  return Math.abs(Math.round(previous * pixelRatio) - Math.round(measured * pixelRatio)) <= 1
    ? previous
    : measured;
}
