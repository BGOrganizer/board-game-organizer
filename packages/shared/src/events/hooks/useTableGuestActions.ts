"use client";

import type {
  AddTableGuestInput,
  SaveTableGuestVotesInput,
  TableGuestDetails,
  TableGuestVotes,
  TableRegistrationReceipt,
} from "@board-game-organizer/schemas";
import {
  type QueryFilters,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import { withClientRequestId } from "../../common/clientMutation";
import {
  beginOptimisticOperation,
  optimisticMutationSignal,
} from "../../common/optimisticOperation";
import { type CommunityApiOptions, communityRequest } from "../../community/communityApi";
import { eventRecordKeys } from "./useEventRecords";

function guestsPath(eventId: string, tableId: string) {
  return `events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}/guests`;
}

export function tableGuestVotesQuery(
  options: CommunityApiOptions,
  eventId: string,
  tableId: string,
  registrationId: string,
) {
  return queryOptions({
    queryKey: [...eventRecordKeys.root(options), "guest-votes", eventId, tableId, registrationId],
    queryFn: ({ signal }) =>
      communityRequest<TableGuestVotes>(
        options,
        `${guestsPath(eventId, tableId)}/${encodeURIComponent(registrationId)}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: Boolean(
      options.userId && options.apiUrl && options.enabled !== false && registrationId,
    ),
    staleTime: 0,
    gcTime: 0,
  });
}

export function useTableGuestVotes(
  options: CommunityApiOptions,
  eventId: string,
  tableId: string,
  registrationId: string,
) {
  return useQuery(tableGuestVotesQuery(options, eventId, tableId, registrationId));
}

type Write = Awaited<ReturnType<typeof beginOptimisticOperation>>;

export function useTableGuestActions(
  options: CommunityApiOptions,
  eventId: string,
  tableId: string,
) {
  const client = useQueryClient();
  const root = eventRecordKeys.root(options);
  const resource = [...root, eventId];
  const scope = { id: JSON.stringify(["event-actions", ...resource]) };
  const mutationKey = [...eventRecordKeys.mutation(options, eventId), tableId];
  const path = guestsPath(eventId, tableId);
  const request = useRef<{ scope: string; input: AddTableGuestInput } | null>(null);
  const adding = useRef(false);
  const affected: QueryFilters = {
    queryKey: root,
    predicate: ({ queryKey }) =>
      queryKey[3] === "list" ||
      (queryKey[3] === "tables" && queryKey[4] === null) ||
      queryKey[4] === eventId,
  };
  const writes = {
    scope,
    networkMode: "always" as const,
    retry: false,
    onMutate: () =>
      beginOptimisticOperation(
        client,
        [...resource, "write"],
        affected,
        undefined,
        [],
        undefined,
        scope.id,
      ),
  };
  const finish = async (error: unknown, operation?: Write) => {
    if (!operation?.active) return;
    if (error) operation.rollback();
    else operation.commit();
    await client.invalidateQueries(affected);
  };
  const addition = useMutation({
    ...writes,
    mutationKey: [...mutationKey, "add-guest"],
    gcTime: 0,
    mutationFn: async (input: AddTableGuestInput, context) => {
      const signal = await optimisticMutationSignal(client, context.mutationKey, input);
      const receipt = await communityRequest<TableRegistrationReceipt>(
        options,
        path,
        "POST",
        input,
        signal,
      );
      if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
      return receipt;
    },
    onSettled: async (data, error, input, context) => {
      if (data && request.current?.input === input) request.current = null;
      try {
        await finish(error, context);
      } finally {
        adding.current = false;
      }
    },
  });
  const vote = useMutation({
    ...writes,
    mutationKey: [...mutationKey, "vote-guest"],
    mutationFn: async (input: SaveTableGuestVotesInput & { registrationId: string }, context) => {
      const signal = await optimisticMutationSignal(client, context.mutationKey, input);
      const receipt = await communityRequest<TableGuestVotes>(
        options,
        `${path}/${encodeURIComponent(input.registrationId)}/votes`,
        "POST",
        { votes: input.votes },
        signal,
      );
      if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
      return receipt;
    },
    onSettled: (_data, error, _input, context) => finish(error, context),
  });
  return {
    add: addition,
    vote,
    addGuest(details: TableGuestDetails, onSaved: () => void) {
      if (adding.current) return;
      const owner = JSON.stringify([scope.id, tableId]);
      if (
        request.current?.scope !== owner ||
        request.current.input.name !== details.name ||
        request.current.input.email !== details.email
      )
        request.current = {
          scope: owner,
          input: {
            ...details,
            requestId: withClientRequestId({ clientRequestId: "" }).clientRequestId,
          },
        };
      adding.current = true;
      addition.mutate(request.current.input, { onSuccess: onSaved });
    },
  };
}
