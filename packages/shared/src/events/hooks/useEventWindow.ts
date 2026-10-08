"use client";

import type { EventResponse } from "@board-game-organizer/schemas";
import { useEffect, useState } from "react";
import { canModifyEvent } from "../eventPolicy";
export function useEventWindow(event: EventResponse | undefined) {
  const [now, setNow] = useState(Date.now);
  const status = event?.status;
  const cutoff = event?.bookingClosesAt;
  useEffect(() => {
    if ((status !== "PUBLISHED" && status !== "DRAFT") || !cutoff) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const time = Date.now();
      setNow(time);
      const remaining = Date.parse(cutoff) - time;
      if (remaining > 0) timer = setTimeout(refresh, Math.min(remaining, 2147483647));
    };
    refresh();
    return () => clearTimeout(timer);
  }, [status, cutoff]);
  return Boolean(
    event && canModifyEvent(event, now) && (event.status !== "DRAFT" || event.canModify),
  );
}
