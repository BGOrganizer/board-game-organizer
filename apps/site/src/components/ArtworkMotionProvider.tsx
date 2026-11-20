"use client";

import { type ReactNode, useState } from "react";
import { ArtworkMotion } from "./ArtworkPicture";

export function ArtworkMotionProvider({ children }: { children: ReactNode }) {
  const [motion, setMotion] = useState(true);
  return (
    <ArtworkMotion value={{ enabled: motion, toggle: () => setMotion((current) => !current) }}>
      <div data-artwork-motion={motion ? "on" : "off"}>{children}</div>
    </ArtworkMotion>
  );
}
