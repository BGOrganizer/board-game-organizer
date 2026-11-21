import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { InputScrollTarget } from "./inputScrollContext";

/** Check only rows waiting for their first appearance in this scroll viewport. */
export function useScrollVisibility(viewport: RefObject<InputScrollTarget | null>) {
  const waiting = useRef(new Map<InputScrollTarget, () => void>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const checkVisibility = useCallback(() => {
    if (!waiting.current.size || timer.current !== undefined) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      viewport.current?.measureInWindow((_x, top, width, height) => {
        if (width <= 0 || height <= 0) return;
        for (const [target, appeared] of waiting.current) {
          target.measureInWindow((_x, rowTop, rowWidth, rowHeight) => {
            if (
              waiting.current.get(target) !== appeared ||
              rowWidth <= 0 ||
              rowHeight <= 0 ||
              rowTop >= top + height ||
              rowTop + rowHeight <= top
            )
              return;
            waiting.current.delete(target);
            appeared();
          });
        }
      });
    }, 100);
  }, [viewport]);
  const observeVisibility = useCallback(
    (target: InputScrollTarget, appeared: () => void) => {
      waiting.current.set(target, appeared);
      checkVisibility();
      return () => {
        if (waiting.current.get(target) === appeared) waiting.current.delete(target);
      };
    },
    [checkVisibility],
  );
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      waiting.current.clear();
    },
    [],
  );
  return { checkVisibility, observeVisibility };
}
