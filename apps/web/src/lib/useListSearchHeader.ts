"use client";

import { useCallback, useLayoutEffect, useState } from "react";

export function useListSearchHeader(reset: () => void, onActiveChange?: (active: boolean) => void) {
  const [active, setActive] = useState(false);
  useLayoutEffect(() => {
    if (!active || !onActiveChange) return;
    onActiveChange(true);
    return () => onActiveChange(false);
  }, [active, onActiveChange]);
  const open = useCallback(() => {
    if (active) return;
    setActive(true);
    const page = document.scrollingElement;
    if (page) page.scrollTop = 0;
  }, [active]);
  const close = useCallback(() => {
    reset();
    setActive(false);
  }, [reset]);
  return { active, open, close };
}
