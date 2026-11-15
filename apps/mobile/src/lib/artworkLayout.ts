/** Fit the bitmap itself, so its rounded mask follows real artwork rather than empty letterboxing. */
export function containedArtwork(width: number, height: number, ratio: number, inset = 0) {
  const aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const padding = Math.max(0, inset) * 2;
  const fittedWidth = Math.min(
    Math.max(0, width - padding),
    Math.max(0, height - padding) * aspect,
  );
  return { width: fittedWidth, height: fittedWidth / aspect };
}
