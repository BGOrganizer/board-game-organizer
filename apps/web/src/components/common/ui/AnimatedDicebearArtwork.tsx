"use client";

import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import landscape from "@dicebear/styles/landscape.json" with { type: "json" };
import planets from "@dicebear/styles/planets.json" with { type: "json" };
import shapes from "@dicebear/styles/shapes.json" with { type: "json" };
import waves from "@dicebear/styles/waves.json" with { type: "json" };
import { useMemo } from "react";

const styles = {
  landscape: new Style(landscape),
  planets: new Style(planets),
  shapes: new Style(shapes),
  waves: new Style(waves),
};

export function AnimatedDicebearArtwork({
  seed,
  variant,
  size = 64,
}: {
  seed: string;
  variant: keyof typeof styles;
  size?: number;
}) {
  const src = useMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(new DiceBearAvatar(styles[variant], { seed, size: size + 8 }).toString())}`,
    [seed, variant, size],
  );
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-xl bg-accent/10"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* biome-ignore lint/performance/noImgElement: Locally generated DiceBear SVG. */}
      <img
        src={src}
        alt=""
        width={size + 8}
        height={size + 8}
        className={`dicebear-artwork relative -top-1 -left-1 ${variant === "waves" ? "match-waves" : variant === "shapes" ? "table-shapes" : ""}`}
      />
    </span>
  );
}
