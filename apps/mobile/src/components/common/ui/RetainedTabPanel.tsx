import { Activity, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ListActivityContext } from "@/lib/listActivity";

/** Keep visited tab views; hidden effects disconnect without discarding their UI state. */
export function RetainedTabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  const activity = useRef(active);
  useLayoutEffect(() => {
    activity.current = active;
    return () => {
      activity.current = false;
    };
  }, [active]);
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);
  if (!active && !visited) return null;
  return (
    <ListActivityContext value={activity}>
      <Activity mode={active ? "visible" : "hidden"}>{children}</Activity>
    </ListActivityContext>
  );
}
