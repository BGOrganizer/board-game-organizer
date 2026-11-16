export const ARTWORK_CYCLE_MS = 4800;

type Frame = readonly [time: number, y: number, rotation: number, opacity: number];
export type ArtworkMotion = {
  frames: readonly Frame[];
  origin: readonly [number, number];
  phase: number;
};
const sway: readonly Frame[] = [
  [0, 0, -1.4, 1],
  [0.5, 0, 1.4, 1],
  [1, 0, -1.4, 1],
];
const lift: readonly Frame[] = [
  [0, 0, 0, 1],
  [0.5, -4, 0, 1],
  [1, 0, 0, 1],
];
const meet: readonly Frame[] = [
  [0, 0, 0, 1],
  [0.35, -4, 0, 1],
  [0.7, 0, 0, 1],
  [1, 0, 0, 1],
];
const bannerOrigins = { bunting: [105, 26], flag: [179, 34], stars: [170, 35] } as const;

/** Native equivalents of the approved definitions' medium CSS; geometry stays in their SVG. */
export function resourceArtworkMotion(
  className: string,
  celebrationVariant?: string,
): ArtworkMotion | undefined {
  if (className === "bgo-events-calendar") return { frames: sway, origin: [109, 178], phase: 0 };
  if (className === "bgo-events-banner") {
    const origin = Object.hasOwn(bannerOrigins, celebrationVariant ?? "")
      ? bannerOrigins[celebrationVariant as keyof typeof bannerOrigins]
      : undefined;
    return origin ? { frames: sway, origin, phase: 0 } : undefined;
  }
  if (className === "bgo-events-accessory") return { frames: lift, origin: [0, 0], phase: 0 };
  if (className === "bgo-tables-die")
    return {
      frames: [
        [0, 0, 0, 1],
        [0.25, -3, -9, 1],
        [0.45, 0, 7, 1],
        [0.65, 0, 0, 1],
        [1, 0, 0, 1],
      ],
      origin: [0, 3],
      phase: 0,
    };
  if (className === "bgo-tables-token")
    return {
      frames: [
        [0, 0, 0, 1],
        [0.3, -5, 0, 1],
        [0.6, 0, 0, 1],
        [1, 0, 0, 1],
      ],
      origin: [0, 0],
      phase: 0,
    };
  if (className === "bgo-groups-member-0") return { frames: meet, origin: [0, 0], phase: 0 };
  if (className === "bgo-groups-member-1")
    return { frames: meet, origin: [0, 0], phase: 0.7 / 4.8 };
  if (className === "bgo-groups-member-2")
    return { frames: meet, origin: [0, 0], phase: 1.4 / 4.8 };
  if (className === "bgo-groups-badge")
    return {
      frames: [
        [0, 0, 0, 1],
        [0.5, 0, 0, 0.65],
        [1, 0, 0, 1],
      ],
      origin: [0, 0],
      phase: 0,
    };
  return undefined;
}

/** SVG matrices stay in the original 240-unit coordinate system, below existing parent transforms. */
export function interpolateArtworkMotion(
  motion: ArtworkMotion,
  progress: number,
  easing: (value: number) => number,
  enabled: boolean,
) {
  "worklet";
  if (!enabled) return { matrix: [1, 0, 0, 1, 0, 0], opacity: 1 };
  const phase = (progress + motion.phase) % 1;
  let index = 0;
  while (index + 1 < motion.frames.length - 1 && phase >= motion.frames[index + 1][0]) index++;
  const from = motion.frames[index],
    to = motion.frames[index + 1];
  const amount = easing((phase - from[0]) / (to[0] - from[0]));
  const y = from[1] + (to[1] - from[1]) * amount;
  const angle = ((from[2] + (to[2] - from[2]) * amount) * Math.PI) / 180;
  const opacity = from[3] + (to[3] - from[3]) * amount;
  const cos = Math.cos(angle),
    sin = Math.sin(angle),
    [x, originY] = motion.origin;
  return {
    matrix: [
      cos,
      sin,
      -sin,
      cos,
      x - x * cos + originY * sin,
      y + originY - x * sin - originY * cos,
    ],
    opacity,
  };
}
