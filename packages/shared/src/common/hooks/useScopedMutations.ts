"use client";
import { type MutationFilters, useMutationState, useQueryClient } from "@tanstack/react-query";
import { useOptimisticBusy } from "./useOptimisticBusy";

/** Subscribe through the SDK, but never render its previous-filter snapshot on an owner/API switch. */
export function useScopedMutations(filters: MutationFilters) {
  const client = useQueryClient();
  useMutationState({ filters });
  useOptimisticBusy(filters.mutationKey ?? []);
  return client.getMutationCache().findAll(filters);
}
