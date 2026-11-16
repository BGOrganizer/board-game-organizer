"use client";

import {
  type InviteReviewResponse,
  inviteClaimResponseSchema,
  type JoinTableInput,
} from "@board-game-organizer/schemas";
import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  beginOptimisticOperation,
  optimisticMutationSignal,
} from "../../common/optimisticOperation";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityRequest,
} from "../../community/communityApi";
import type { ClaimResult } from "./useInvites";

export type InviteClaimInput = { participation?: JoinTableInput; consent?: true };

/** All affected caches belong to this API/account; a review is never refreshed after consuming it. */
function ownedClaimKey(key: QueryKey, options: CommunityApiOptions) {
  return key[0] === "contacts"
    ? key[2] === options.apiUrl && key[3] === options.userId
    : [
        "groups",
        "events",
        "profile",
        "notifications",
        "notification-attention",
        "notification-changes",
      ].includes(String(key[0])) &&
        key[1] === options.apiUrl &&
        key[2] === options.userId;
}

export function useInviteClaim(options: CommunityApiOptions, inviteToken: string) {
  const client = useQueryClient();
  const reviewKey = ["invites", options.apiUrl, options.userId, "review", inviteToken] as const;
  const mutationKey = ["invites", options.apiUrl, options.userId, "claim", inviteToken] as const;
  const filters = {
    predicate: ({ queryKey }: { queryKey: QueryKey }) => ownedClaimKey(queryKey, options),
  };
  const claim = useMutation({
    mutationKey,
    retry: false,
    mutationFn: async (input: InviteClaimInput, context): Promise<ClaimResult> => {
      const signal = await optimisticMutationSignal(client, context.mutationKey, input);
      const reviewed = client.getQueryData<InviteReviewResponse>(reviewKey);
      if (!reviewed) throw new CommunityApiError(409, "INVITE_REVIEW_REQUIRED");
      const response = await communityRequest(
        options,
        "invites/claim",
        "POST",
        { token: inviteToken, ...input },
        signal,
      );
      if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
      const parsed = inviteClaimResponseSchema.safeParse(response);
      if (
        !parsed.success ||
        (reviewed.kind === "TABLE" &&
          (!parsed.data.table ||
            parsed.data.table.groupId !== reviewed.group.id ||
            parsed.data.table.eventId !== reviewed.event.id ||
            parsed.data.table.tableId !== reviewed.table.id))
      )
        throw new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN");
      return parsed.data;
    },
    onMutate: async (input) => {
      if (!options.userId || options.enabled === false || !inviteToken)
        throw new CommunityApiError(401, "Unauthorized");
      const reviewed = client.getQueryData<InviteReviewResponse>(reviewKey);
      if (!reviewed || !["FRIEND", "TABLE"].includes(reviewed.kind))
        throw new CommunityApiError(409, "INVITE_REVIEW_REQUIRED");
      if (reviewed.kind === "TABLE" && input.consent !== true)
        throw new CommunityApiError(400, "TABLE_INVITE_CONSENT_REQUIRED");
      await client.cancelQueries({ queryKey: reviewKey, exact: true });
      return beginOptimisticOperation(client, mutationKey, filters, (data) => data);
    },
    onSuccess: (_receipt, _input, operation) => {
      if (!operation?.active) return;
      operation.commit();
      void client.invalidateQueries(filters, { cancelRefetch: false });
    },
    onError: (_error, _input, operation) => {
      // No consent or membership was projected: discard the identity overlay. A lost response
      // remains an observable failure; explicit retry uses the server's idempotent receipt.
      if (operation?.active) operation.rollback();
    },
  });
  const review = useQuery({
    queryKey: reviewKey,
    queryFn: ({ signal }) =>
      communityRequest<InviteReviewResponse>(
        options,
        `invites/${encodeURIComponent(inviteToken)}`,
        "GET",
        undefined,
        signal,
      ),
    // A lost claim response may follow a commit: retain review for an idempotent retry, not a consuming-token GET.
    enabled: Boolean(
      options.apiUrl &&
        options.userId &&
        options.enabled !== false &&
        inviteToken &&
        claim.status === "idle",
    ),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  return { review, claim };
}
