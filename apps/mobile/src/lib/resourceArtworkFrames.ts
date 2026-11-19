import { type ArtworkPlacement, artworkLayerTransform } from "./resourceArtworkLayers";
import {
  ARTWORK_CYCLE_MS,
  type ArtworkMotion,
  interpolateArtworkMotion,
} from "./resourceArtworkMotion";

/** Match RN TimingAnimation's 60 Hz native frame table, including its final loop frame. */
export function resourceArtworkFrames(
  motion: ArtworkMotion,
  placement: ArtworkPlacement,
  size: number,
  easing: (value: number) => number,
) {
  const frameCount = Math.round(ARTWORK_CYCLE_MS / (1000 / 60));
  const inputRange = Array.from({ length: frameCount + 1 }, (_, index) => index / frameCount);
  const samples = inputRange.map((progress) => {
    const { matrix, opacity } = interpolateArtworkMotion(motion, progress, easing, true);
    const display = artworkLayerTransform(matrix, placement, size / 240);
    return {
      x: display[12],
      y: display[13],
      rotation: `${Math.atan2(display[1], display[0])}rad` as `${number}rad`,
      opacity,
    };
  });
  return {
    inputRange,
    translateX: samples.map((sample) => sample.x),
    translateY: samples.map((sample) => sample.y),
    rotate: samples.map((sample) => sample.rotation),
    opacity: samples.map((sample) => sample.opacity),
  };
}
