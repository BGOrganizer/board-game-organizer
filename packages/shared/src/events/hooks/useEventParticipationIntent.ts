"use client";
import type { DecideTableRegistrationInput, JoinTableInput } from "@board-game-organizer/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { clientMutationPhase } from "../../common/clientMutation";
import { useScopedMutations } from "../../common/hooks/useScopedMutations";
import type { CommunityApiOptions } from "../../community/communityApi";
import type { EventConsentSnapshot } from "../eventConsentVersion";
import { eventRecordKeys } from "./useEventRecords";

/** Local request/recovery metadata only. A pending consent is never a server registration. */
export function useEventParticipationIntent(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  canonicalAccepted = false,
) {
  const client = useQueryClient();
  const intents = useScopedMutations({ mutationKey: eventRecordKeys.mutation(o, eventId) }).map(
    (mutation) => {
      const action = mutation.options.mutationKey?.at(-1);
      const variables = mutation.state.variables as
        | { tableId?: string; registrationId?: string; input?: DecideTableRegistrationInput }
        | undefined;
      const context = mutation.state.context as
        | { operation?: { uncertain: boolean }; consent?: EventConsentSnapshot }
        | undefined;
      if (!variables || (variables.tableId ?? context?.consent?.tableId) !== tableId)
        return undefined;
      const input =
        action === "register"
          ? (mutation.state.variables as JoinTableInput)
          : action === "respond" && variables.input?.action === "accept"
            ? variables.input.participation
            : undefined;
      if (!input) return undefined;
      const status = mutation.state.status;
      return {
        requestId: mutation.mutationId,
        status,
        key: `participation:${mutation.mutationId}`,
        action: action === "register" ? ("join" as const) : ("accept" as const),
        input,
        registrationId: variables.registrationId,
        phase:
          status === "pending" || status === "error"
            ? clientMutationPhase(status, mutation.state.error, context?.operation?.uncertain)
            : undefined,
      };
    },
  );
  useEffect(() => {
    if (!canonicalAccepted) return;
    // Positive authorized state supersedes enrollment recovery metadata. Retire only
    // terminal errors, never queued work or SDK status, and never infer absence = failure.
    // Otherwise a later legitimate departure would resurrect an old uncertain join.
    const obsolete = new Set(
      intents.filter((intent) => intent?.status === "error").map((intent) => intent?.requestId),
    );
    for (const mutation of client.getMutationCache().getAll())
      if (obsolete.has(mutation.mutationId) && mutation.state.status === "error")
        client.getMutationCache().remove(mutation);
  }, [canonicalAccepted, client, intents]);
  // A later success must suppress an older rejected draft, including after the resource leaves a page.
  return intents
    .filter((intent) => intent !== undefined)
    .sort((a, b) => b.requestId - a.requestId)[0];
}
