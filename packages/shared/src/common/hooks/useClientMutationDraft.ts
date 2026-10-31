"use client";
import type { MutationKey } from "@tanstack/react-query";
import { clientMutationPhase, clientMutationSuperseded } from "../clientMutation";
import { useScopedMutations } from "./useScopedMutations";

/** Request drafts only. Latest success suppresses older failures; unknown outcomes are not retries. */
export function useClientMutationDraft<T>(
  mutationKey: MutationKey,
  canonicalVersion?: number,
  include?: (variables: T | undefined) => boolean,
) {
  const latest = useScopedMutations({ mutationKey, exact: true })
    .filter((mutation) => !include || include(mutation.state.variables as T | undefined))
    .sort((a, b) => b.mutationId - a.mutationId)[0];
  if (!latest || (latest.state.status !== "pending" && latest.state.status !== "error"))
    return undefined;
  const phase = clientMutationPhase(
    latest.state.status,
    latest.state.error,
    (latest.state.context as { operation?: { uncertain: boolean } } | undefined)?.operation
      ?.uncertain,
  );
  // Version-guarded edits cannot commit later once an authorized canonical epoch
  // advances. Stop replaying the uncertain draft; do not call it success/rejection,
  // remove pending work, or retry its structural Table writes.
  if (
    latest.state.status === "error" &&
    phase === "verifying" &&
    clientMutationSuperseded(latest.state.variables, canonicalVersion)
  )
    return undefined;
  return { id: latest.mutationId, variables: latest.state.variables as T | undefined, phase };
}
