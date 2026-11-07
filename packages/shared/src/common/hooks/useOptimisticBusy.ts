"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { optimisticOperationState } from "../optimisticOperation";

/** Writing/uncertain resources only; ordinary background reconciliation does not block UI. */
export function useOptimisticBusy(resource: QueryKey) {
  const client = useQueryClient();
  const current = useRef(resource);
  current.current = resource;
  const state = useMemo(() => optimisticOperationState(client, []), [client]);
  useSyncExternalStore(state.subscribe, state.snapshot, state.snapshot);
  return useCallback((target?: QueryKey) => state.busy(target ?? current.current), [state]);
}
