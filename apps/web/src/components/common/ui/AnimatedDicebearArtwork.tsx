"use client";

import {
  createResourceArtwork,
  type ResourceArtworkKind,
} from "@board-game-organizer/shared/artwork";
import { useMemo, useSyncExternalStore } from "react";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const prefersReducedMotion = () => window.matchMedia(motionQuery).matches;
const serverReducedMotion = () => true;

export function AnimatedDicebearArtwork({
  seed,
  variant,
  size = 64,
  presentation = "thumbnail",
}: {
  seed: string;
  variant: ResourceArtworkKind;
  size?: number;
  presentation?: "thumbnail" | "background" | "cover";
}) {
  // SVG-as-image media queries do not reliably honor the host's motion preference.
  const reduceMotion = useSyncExternalStore(
    subscribeMotion,
    prefersReducedMotion,
    serverReducedMotion,
  );
  const src = useMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(createResourceArtwork(variant, seed, reduceMotion ? "none" : "medium").svg)}`,
    [seed, variant, reduceMotion],
  );
  return (
    <span
      data-theme="light"
      data-slot="resource-artwork"
      data-artwork-kind={variant}
      className={`light block shrink-0 overflow-hidden rounded-xl bg-surface ${presentation !== "thumbnail" ? "absolute inset-0" : ""}`}
      style={presentation !== "thumbnail" ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      {/* biome-ignore lint/performance/noImgElement: Locally generated DiceBear SVG. */}
      <img
        src={src}
        alt=""
        width={240}
        height={240}
        loading="lazy"
        decoding="async"
        className={`dicebear-artwork h-full w-full rounded-xl object-contain ${presentation === "cover" ? "p-1" : ""}`}
      />
    </span>
  );
}
