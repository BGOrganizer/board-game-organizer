"use client";

import { useEffect, useState } from "react";
/** A boundary timer, not list polling. Long waits are capped by the timer API. */
export function useEventCutoff(cutoff: string | undefined, publicGroup: boolean) {
  const [, refresh] = useState(0),
    at = cutoff ? Date.parse(cutoff) : NaN;
  useEffect(() => {
    if (!publicGroup || !Number.isFinite(at) || at <= Date.now()) return;
    let timer: ReturnType<typeof setTimeout>;
    function boundary() {
      const remaining = at - Date.now();
      if (remaining <= 0) {
        refresh((value) => value + 1);
        return;
      }
      timer = setTimeout(boundary, Math.min(2147483647, remaining));
    }
    boundary();
    return () => clearTimeout(timer);
  }, [at, publicGroup]);
  return publicGroup && Number.isFinite(at) && Date.now() >= at;
}
