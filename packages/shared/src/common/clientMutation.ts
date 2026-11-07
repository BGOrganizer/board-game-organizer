import { optimisticFailureAction } from "./optimisticOperation";

export type ClientRecordState = { draftId: string; phase: "saving" | "failed" | "verifying" };
export type ClientRecord<T> = T & { optimistic?: ClientRecordState };
export type CreationIntent<T, R> = {
  draftId: string;
  submittedAt: number;
  variables: T;
  status: "pending" | "error";
  error: Error | null;
  context?: { operation?: { uncertain: boolean; signal?: AbortSignal }; receipt?: R };
};

/** Correlation only, never a credential, resource ID or automatic write retry key. */
export function withClientRequestId<T extends { clientRequestId?: string }>(input: T): T {
  if (input.clientRequestId) return input;
  const id =
    globalThis.crypto?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (digit) => {
      const random = Math.floor(Math.random() * 16);
      return (digit === "x" ? random : (random & 3) | 8).toString(16);
    });
  return { ...input, clientRequestId: id };
}

export function clientMutationPhase(
  status: "pending" | "error",
  error: Error | null,
  uncertain?: boolean,
): ClientRecordState["phase"] {
  return status === "pending"
    ? uncertain
      ? "verifying"
      : "saving"
    : optimisticFailureAction(error ?? new Error("Unknown outcome"), "create_event") ===
        "verify_saved_changes"
      ? "verifying"
      : "failed";
}
/** A newer canonical epoch fences the old versioned write, not proof that it succeeded. */
export function clientMutationSuperseded(variables: unknown, canonicalVersion?: number): boolean {
  const value = variables as { version?: number; input?: { version?: number } } | undefined;
  const version = value?.version ?? value?.input?.version;
  return (
    typeof version === "number" &&
    Number.isSafeInteger(version) &&
    version > 0 &&
    typeof canonicalVersion === "number" &&
    Number.isSafeInteger(canonicalVersion) &&
    canonicalVersion > version
  );
}

export function creationState<T, R>(intent: CreationIntent<T, R>): ClientRecordState {
  return {
    draftId: intent.draftId,
    phase: clientMutationPhase(intent.status, intent.error, intent.context?.operation?.uncertain),
  };
}

/** Mutations own local request drafts, Query owns authorized server records. */
export function mergeCreationIntents<T extends { id: string; clientRequestId?: string }>(
  records: readonly T[],
  local: readonly T[],
): T[] {
  const ids = new Set(records.map((row) => row.id));
  const requests = new Set(
    records.flatMap((row) => (row.clientRequestId ? [row.clientRequestId] : [])),
  );
  return [
    ...local.filter((row) => {
      if (ids.has(row.id) || (row.clientRequestId && requests.has(row.clientRequestId)))
        return false;
      ids.add(row.id);
      if (row.clientRequestId) requests.add(row.clientRequestId);
      return true;
    }),
    ...records,
  ];
}
