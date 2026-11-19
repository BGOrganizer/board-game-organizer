import { createContext, type RefObject, use, useCallback } from "react";

export const ListActivityContext = createContext<RefObject<boolean> | null>(null);

/** Native layout/end events can arrive after an Activity has hidden its list. */
export function useListActivity() {
  const active = use(ListActivityContext);
  return useCallback(() => active?.current ?? true, [active]);
}
