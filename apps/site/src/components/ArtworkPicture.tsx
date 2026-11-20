"use client";

import { createContext, useContext } from "react";

export const ArtworkMotion = createContext<{ enabled: boolean; toggle?: () => void }>({
  enabled: true,
});
export type ArtworkSources = readonly [still: string, animated: string];

/** Source selection follows the browser setting and the site's pause control. */
export function ArtworkPicture({
  artwork: [still, animated],
  size,
  className,
}: {
  artwork: ArtworkSources;
  size: number;
  className: string;
}) {
  const { enabled } = useContext(ArtworkMotion);
  return (
    <picture className="contents">
      {enabled ? (
        <source media="(prefers-reduced-motion: no-preference)" srcSet={animated} />
      ) : null}
      <img alt="" src={still} width={size} height={size} decoding="async" className={className} />
    </picture>
  );
}
