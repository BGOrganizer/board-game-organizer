"use client";
import {
  type EventProposalPayload,
  type EventProposalResponse,
  type ReviewEventProposalInput,
  type ReviewEventProposalResponse,
  submitEventProposalSchema,
} from "@board-game-organizer/schemas";
import { notifyManager, useMutation, useQueryClient } from "@tanstack/react-query";
import { withClientRequestId } from "../../common/clientMutation";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import { useOptimisticCreations } from "../../common/hooks/useOptimisticCreations";
import type { MutationFeedbackAction } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  optimisticBaseData,
  optimisticFailureAction,
  optimisticMutationSignal,
  updateOptimisticBase,
} from "../../common/optimisticOperation";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityRequest,
} from "../../community/communityApi";
import { mapCommunityCache } from "../../community/queryCache";
import {
  commitProposalCreation,
  commitProposalReceipt,
  type EventProposalCategory,
  eventProposalKeys,
  projectProposalReview,
  reconcileProposalAccessError,
  revokeProposalReview,
} from "../eventProposalCache";
import { eventRecordKeys } from "./useEventRecords";

type ClientOwner = {
  apiUrl: string;
  userId: string | null | undefined;
  eventId: string;
  groupId: string;
};
export type SubmitEventProposalVariables = {
  eventVersion: number;
  payload: EventProposalPayload;
  clientRequestId?: string;
  clientLabel: string;
  clientReplaces?: string;
  clientOwner?: ClientOwner;
};
type ReviewVariables = ReviewEventProposalInput & { proposalId: string; clientOwner?: ClientOwner };
function creationKey(
  o: CommunityApiOptions,
  eventId: string,
  kind?: EventProposalCategory,
  tableId?: string,
) {
  return [
    ...eventRecordKeys.mutation(o, eventId, "propose"),
    kind ?? null,
    kind === "game" ? (tableId ?? null) : null,
  ];
}
export function useEventProposalIntents(
  o: CommunityApiOptions,
  eventId: string,
  kind?: EventProposalCategory,
  tableId?: string,
) {
  return useOptimisticCreations<SubmitEventProposalVariables, EventProposalResponse>(
    creationKey(o, eventId, kind, tableId),
  );
}
export function useEventProposalActions(
  o: CommunityApiOptions,
  eventId: string,
  groupId: string,
  kind?: EventProposalCategory,
  tableId?: string,
) {
  const client = useQueryClient(),
    resource = [...eventRecordKeys.root(o), eventId];
  const resourceBusy = useOptimisticBusy(resource),
    busy = resourceBusy();
  const owner: ClientOwner = { apiUrl: o.apiUrl, userId: o.userId, eventId, groupId };
  const filters = (who: ClientOwner) => ({
    queryKey: eventRecordKeys.root(who),
    predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[4] === who.eventId,
  });
  function check(who: ClientOwner | undefined) {
    if (
      !who ||
      who.apiUrl !== o.apiUrl ||
      who.userId !== o.userId ||
      who.eventId !== eventId ||
      who.groupId !== groupId
    )
      throw new Error("MUTATION_OWNER_CHANGED");
  }
  async function begin(
    action: MutationFeedbackAction,
    who: ClientOwner | undefined,
    review?: ReviewVariables,
  ) {
    check(who);
    const captured = who as ClientOwner;
    const operation = await beginOptimisticOperation(
      client,
      [...eventRecordKeys.root(captured), eventId, "write"],
      filters(captured),
      review
        ? (data) =>
            projectProposalReview(
              data,
              eventId,
              review.proposalId,
              review.eventVersion,
              review.version,
              review.action,
            )
        : (data) => data,
      review
        ? [
            eventProposalKeys.reviewResource(captured, eventId),
            eventProposalKeys.groupReviewResource(captured, groupId),
          ]
        : [],
      undefined,
      JSON.stringify(["event-actions", ...eventRecordKeys.root(captured), eventId]),
      [["groups", o.apiUrl, o.userId, groupId]],
    );
    o.feedback?.onOptimisticUpdate?.(action);
    return { operation, owner: captured, options: o, action };
  }
  type Context = Awaited<ReturnType<typeof begin>>;
  async function failure(error: Error, c: Context | undefined) {
    if (!c?.operation.active) return;
    c.options.feedback?.onError?.(error, optimisticFailureAction(error, c.action));
    await c.operation.reject(error);
    reconcileProposalAccessError(client, c.owner, c.owner, error);
    if (c.operation.active) await c.operation.wait();
  }
  function settle(_data: unknown, _error: Error | null, _v: unknown, c: Context | undefined) {
    if (!c || c.operation.signal.aborted) return;
    const approved = c.action === "accept_event_proposal";
    void client.invalidateQueries(
      {
        ...filters(c.owner),
        predicate: (q) =>
          q.queryKey[4] === c.owner.eventId && (approved || q.queryKey[3] === "proposals"),
      },
      { cancelRefetch: false },
    );
    if (approved) {
      void client.invalidateQueries(
        {
          queryKey: eventRecordKeys.root(c.owner),
          predicate: (q) =>
            q.queryKey[3] === "list" || (q.queryKey[3] === "tables" && q.queryKey[4] === null),
        },
        { cancelRefetch: false },
      );
      void client.invalidateQueries(
        { queryKey: ["groups", c.owner.apiUrl, c.owner.userId] },
        { cancelRefetch: false },
      );
    }
    void client.invalidateQueries({ queryKey: ["notifications", c.owner.apiUrl, c.owner.userId] });
    void client.invalidateQueries({
      queryKey: ["notification-attention", c.owner.apiUrl, c.owner.userId],
    });
  }
  const scope = { id: JSON.stringify(["event-actions", ...eventRecordKeys.root(o), eventId]) };
  const submit = useMutation({
    mutationKey: creationKey(o, eventId, kind, tableId),
    scope,
    gcTime: 30 * 60_000,
    networkMode: "always",
    mutationFn: async (input: SubmitEventProposalVariables, context) => {
      check(input.clientOwner);
      const body = submitEventProposalSchema.parse({
        eventVersion: input.eventVersion,
        clientRequestId: input.clientRequestId,
        payload: input.payload,
      });
      const signal = await optimisticMutationSignal(client, context.mutationKey, input);
      let saved: EventProposalResponse;
      try {
        saved = await communityRequest<EventProposalResponse>(
          o,
          `events/${encodeURIComponent(eventId)}/proposals`,
          "POST",
          body,
          signal,
        );
      } catch (error) {
        if (signal.aborted || (error instanceof CommunityApiError && error.status < 500))
          throw error;
        const params = new URLSearchParams({
          mode: "mine",
          kind: body.payload.kind,
          clientRequestId: body.clientRequestId,
          limit: "1",
        });
        if (body.payload.kind === "game") params.set("tableId", body.payload.tableId);
        const receipt = await communityRequest<
          import("@board-game-organizer/schemas").EventProposalsResponse
        >(o, `events/${encodeURIComponent(eventId)}/proposals?${params}`, "GET", undefined, signal);
        const found = receipt.items.find((row) => row.clientRequestId === body.clientRequestId);
        if (!found) throw new CommunityApiError(409, "PROPOSAL_NOT_SAVED");
        saved = found;
      }
      if (
        saved.eventId !== eventId ||
        saved.userId !== o.userId ||
        saved.clientRequestId !== input.clientRequestId
      )
        throw new Error("MUTATION_READ_UNVERIFIED");
      return saved;
    },
    onMutate: async (input) => {
      const context = await begin("propose_event_option", input.clientOwner);
      if (input.clientReplaces) {
        const prior = client
          .getMutationCache()
          .findAll({ mutationKey: creationKey(o, eventId, kind, tableId), exact: true })
          .find(
            (mutation) =>
              String(mutation.mutationId) === input.clientReplaces &&
              mutation.state.status === "error",
          );
        if (prior) client.getMutationCache().remove(prior);
      }
      return context;
    },
    onSuccess: (saved, _input, c) => {
      if (!c?.operation.active) return;
      c.operation.acknowledge();
      notifyManager.batch(() => {
        for (const [key] of client.getQueriesData({
          queryKey: eventProposalKeys.root(c.owner),
          predicate: (q) => q.queryKey[4] === c.owner.eventId,
        }))
          updateOptimisticBase(client, key, (data) =>
            commitProposalCreation(data, key, saved, c.owner.userId),
          );
        c.operation.commit((data, key) => optimisticBaseData(client, key));
      });
    },
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const review = useMutation({
    mutationKey: eventRecordKeys.mutation(o, eventId, "review-proposal"),
    scope,
    networkMode: "always",
    mutationFn: async (input: ReviewVariables, context) => {
      check(input.clientOwner);
      const signal = await optimisticMutationSignal(client, context.mutationKey, input);
      const path = `events/${encodeURIComponent(eventId)}/proposals/${encodeURIComponent(input.proposalId)}`;
      let saved: ReviewEventProposalResponse;
      try {
        saved = await communityRequest<ReviewEventProposalResponse>(
          o,
          path,
          "POST",
          { action: input.action, version: input.version, eventVersion: input.eventVersion },
          signal,
        );
      } catch (error) {
        if (signal.aborted || (error instanceof CommunityApiError && error.status < 500))
          throw error;
        const receipt = await communityRequest<ReviewEventProposalResponse>(
          o,
          path,
          "GET",
          undefined,
          signal,
        );
        if (
          receipt.proposal.version !== input.version + 1 ||
          receipt.proposal.status !== (input.action === "accept" ? "ACCEPTED" : "REJECTED")
        )
          throw new CommunityApiError(409, "PROPOSAL_CHANGED");
        saved = receipt;
      }
      if (
        saved.event.id !== eventId ||
        saved.proposal.id !== input.proposalId ||
        saved.proposal.eventId !== eventId ||
        saved.proposal.version !== input.version + 1 ||
        saved.proposal.status !== (input.action === "accept" ? "ACCEPTED" : "REJECTED")
      )
        throw new Error("MUTATION_READ_UNVERIFIED");
      return saved;
    },
    onMutate: (input) =>
      begin(
        input.action === "accept" ? "accept_event_proposal" : "reject_event_proposal",
        input.clientOwner,
        input,
      ),
    onSuccess: (saved, _v, c) => {
      if (!c?.operation.active) return;
      c.operation.acknowledge();
      notifyManager.batch(() => {
        for (const [key] of client.getQueriesData(filters(c.owner)))
          updateOptimisticBase(client, key, (data) =>
            key[3] === "proposals" ? commitProposalReceipt(data, saved.proposal) : data,
          );
        updateOptimisticBase(client, eventRecordKeys.detail(c.owner, c.owner.eventId), (data) =>
          !data || (data as { version: number }).version <= saved.event.version
            ? { ...(data as object), ...saved.event }
            : data,
        );
        for (const [key] of client.getQueriesData({
          queryKey: eventRecordKeys.root(c.owner),
          predicate: (q) => q.queryKey[3] === "list",
        }))
          updateOptimisticBase(client, key, (data) =>
            mapCommunityCache<ReviewEventProposalResponse["event"]>(data, (row) =>
              row.id === c.owner.eventId && row.version <= saved.event.version ? saved.event : row,
            ),
          );
        c.operation.commit((data, key) => optimisticBaseData(client, key));
      });
      if (saved.event.canManage === false)
        revokeProposalReview(client, c.owner, { eventId: c.owner.eventId });
    },
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  return {
    busy,
    submit,
    review,
    propose: (input: Omit<SubmitEventProposalVariables, "clientOwner">) =>
      submit.mutate({ ...withClientRequestId(input), clientOwner: owner }),
    decide: (input: Omit<ReviewVariables, "clientOwner">) =>
      review.mutate({ ...input, clientOwner: owner }),
  };
}
