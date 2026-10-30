"use client";
import type { MutationKey } from "@tanstack/react-query";
import type { CreationIntent } from "../clientMutation";
import { useScopedMutations } from "./useScopedMutations";

export function useOptimisticCreations<T extends { clientRequestId?: string }, R>(
  mutationKey: MutationKey,
): CreationIntent<T, R>[] {
  const sources = useScopedMutations({ mutationKey, exact: true }).map((mutation) => ({
    draftId: String(mutation.mutationId),
    submittedAt: mutation.state.submittedAt,
    variables: mutation.state.variables as T | undefined,
    status: mutation.state.status,
    error: mutation.state.error,
    context: mutation.state.context as CreationIntent<T, R>["context"],
  }));
  const seen = new Set<string>();
  return [...sources]
    .sort((a, b) => Number(b.draftId) - Number(a.draftId))
    .flatMap((source): CreationIntent<T, R>[] => {
      const variables = source.variables;
      if (!variables || source.context?.operation?.signal?.aborted) return [];
      if (variables.clientRequestId) {
        if (seen.has(variables.clientRequestId)) return [];
        seen.add(variables.clientRequestId);
      }
      // A successful replacement suppresses its old rejected draft, even after deletion.
      return source.status === "pending" || source.status === "error"
        ? [{ ...source, variables, status: source.status }]
        : [];
    });
}
