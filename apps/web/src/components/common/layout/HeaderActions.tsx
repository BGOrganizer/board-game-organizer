"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Route-owned actions in the persistent app header; unmounting removes stale actions. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById("page-header-actions"));
  }, []);
  return target ? createPortal(children, target) : null;
}
