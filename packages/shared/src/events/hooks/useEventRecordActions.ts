"use client";

import type {
  ChangeEventStateInput,
  ChangeEventVoteInput,
  CreatePlannedEventInput,
  DecideTableRegistrationInput,
  EditPlannedEventInput,
  FinalizeEventInput,
  PlannedEventResponse,
  PlannedTableResponse,
  TableRegistration,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MutationFeedbackAction } from "../../common/mutationFeedback";
import { type CommunityApiOptions, communityRequest } from "../../community/communityApi";
import { mapCommunityCache, restoreCommunityFields } from "../../community/queryCache";
import { eventRecordKeys } from "./useEventRecords";

type Row = PlannedEventResponse | PlannedTableResponse | TableSeatResponse;
export function useEventRecordActions(o: CommunityApiOptions, id: string) {
  const client = useQueryClient(),
    root = eventRecordKeys.root(o),
    mutationKey = [...root, "mutation", id],
    busy = useIsMutating({ mutationKey }) > 0;
  const affected = (key: readonly unknown[]) =>
    key[3] === "list" ||
    (key[3] === "tables" && (key[4] === null || key[4] === id)) ||
    (["detail", "table", "seats"].includes(String(key[3])) && key[4] === id);
  async function begin(action: MutationFeedbackAction, change: (row: Row) => Row = (row) => row) {
    await client.cancelQueries({ queryKey: root, predicate: (q) => affected(q.queryKey) });
    const undo: Array<() => void> = [];
    for (const [key, data] of client.getQueriesData({
      queryKey: root,
      predicate: (q) => affected(q.queryKey),
    })) {
      client.setQueryData(
        key,
        mapCommunityCache<Row>(data, (row) => {
          const next = change(row);
          if (next !== row)
            undo.push(() =>
              client.setQueryData(key, (current: unknown) =>
                mapCommunityCache<Row>(current, (value) =>
                  value.id === row.id ? restoreCommunityFields(value, row, next) : value,
                ),
              ),
            );
          return next;
        }),
      );
    }
    o.feedback?.onOptimisticUpdate?.(action);
    return { action, undo };
  }
  function failure(error: Error, context: Awaited<ReturnType<typeof begin>> | undefined) {
    context?.undo.forEach((run) => {
      run();
    });
    if (context) o.feedback?.onError?.(error, context.action);
  }
  async function settle() {
    await client.invalidateQueries({ queryKey: root, predicate: (q) => affected(q.queryKey) });
    await client.invalidateQueries({
      queryKey: ["groups", o.apiUrl, o.userId],
      refetchType: "active",
    });
  }
  function eventSuccess(value: PlannedEventResponse) {
    client.setQueryData(eventRecordKeys.detail(o, value.id), value);
    for (const [key, data] of client.getQueriesData({
      queryKey: root,
      predicate: (q) => q.queryKey[3] === "list",
    }))
      client.setQueryData(
        key,
        mapCommunityCache<PlannedEventResponse>(data, (row) => (row.id === value.id ? value : row)),
      );
  }
  function registrationSuccess(value: TableRegistration) {
    for (const [key, data] of client.getQueriesData({
      queryKey: root,
      predicate: (q) => q.queryKey[3] === "table" || q.queryKey[3] === "tables",
    }))
      client.setQueryData(
        key,
        mapCommunityCache<PlannedTableResponse>(data, (row) =>
          row.id === value.tableId && value.userId === o.userId
            ? {
                ...row,
                myRegistration: value,
                ...(value.status === "CANCELLED" || value.status === "DECLINED"
                  ? { myPosition: null }
                  : {}),
              }
            : row,
        ),
      );
  }
  const create = useMutation({
    mutationKey,
    mutationFn: (input: CreatePlannedEventInput) =>
      communityRequest<PlannedEventResponse>(o, "events", "POST", input),
    onMutate: () => begin("create_event"),
    onSuccess: eventSuccess,
    onError: (error, _v, c) => failure(error, c),
    onSettled: settle,
  });
  const update = useMutation({
    mutationKey,
    mutationFn: (input: EditPlannedEventInput) =>
      communityRequest<PlannedEventResponse>(o, `events/${id}`, "PATCH", input),
    onMutate: (input) =>
      begin("update_event", (row) =>
        "dates" in row && row.id === id
          ? {
              ...row,
              name: input.name,
              dates: input.dates,
              locations: input.locations,
              startTime: input.startTime,
            }
          : row,
      ),
    onSuccess: eventSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const vote = useMutation({
    mutationKey,
    mutationFn: (input: ChangeEventVoteInput) =>
      communityRequest<PlannedEventResponse>(o, `events/${id}/votes`, "PATCH", input),
    onMutate: (input) =>
      begin("set_event_vote", (row) => {
        if (input.kind !== "game" && "dates" in row && row.id === id) {
          const field = input.kind === "date" ? "dateVotes" : "locationVotes";
          return {
            ...row,
            myVotes: {
              dateVotes: { ...row.myVotes?.dateVotes },
              locationVotes: { ...row.myVotes?.locationVotes },
              [field]: { ...row.myVotes?.[field], [input.optionId]: input.vote },
            },
          };
        }
        if (
          input.kind === "game" &&
          "myRegistration" in row &&
          row.id === input.tableId &&
          row.myRegistration
        )
          return {
            ...row,
            myRegistration: {
              ...row.myRegistration,
              gameVotes: { ...row.myRegistration.gameVotes, [input.gameId]: input.vote },
            },
          };
        return row;
      }),
    onSuccess: eventSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const register = useMutation({
    mutationKey,
    mutationFn: (tableId: string) =>
      communityRequest<TableRegistration>(
        o,
        `events/${id}/tables/${tableId}/registrations`,
        "POST",
      ),
    onMutate: (tableId) =>
      begin("join_table", (row) =>
        "canRegister" in row && row.id === tableId ? { ...row, canRegister: false } : row,
      ),
    onSuccess: registrationSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const invite = useMutation({
    mutationKey,
    mutationFn: ({ tableId, userId }: { tableId: string; userId: string }) =>
      communityRequest<TableRegistration>(o, `events/${id}/tables/${tableId}/invitations`, "POST", {
        userId,
      }),
    onMutate: () => begin("invite_event_player"),
    onSuccess: registrationSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const respond = useMutation({
    mutationKey,
    mutationFn: ({
      registrationId,
      input,
    }: {
      registrationId: string;
      input: DecideTableRegistrationInput;
    }) =>
      communityRequest<TableRegistration>(
        o,
        `table-registrations/${registrationId}`,
        "PATCH",
        input,
      ),
    onMutate: ({ registrationId, input }) =>
      begin(
        (
          {
            accept: "accept_event_invitation",
            decline: "decline_event_invitation",
            cancel: "leave_table",
            remove: "remove_event_player",
          } as const
        )[input.action],
        (row) =>
          "myRegistration" in row && row.myRegistration?.id === registrationId
            ? {
                ...row,
                canRespond: false,
                canLeave: false,
                ...(input.action === "cancel" || input.action === "remove"
                  ? { myPosition: null }
                  : {}),
              }
            : "tableId" in row &&
                row.id === registrationId &&
                (input.action === "cancel" || input.action === "remove")
              ? { ...row, status: "CANCELLED" }
              : row,
      ),
    onSuccess: registrationSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const transition = useMutation({
    mutationKey,
    mutationFn: (input: ChangeEventStateInput) =>
      communityRequest<PlannedEventResponse>(o, `events/${id}/state`, "PATCH", input),
    onMutate: (input) =>
      begin(input.action === "confirm" ? "confirm_event" : "replan_event", (row) =>
        "dates" in row && row.id === id ? { ...row, canConfirm: false, canReplan: false } : row,
      ),
    onSuccess: eventSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const finalize = useMutation({
    mutationKey,
    mutationFn: (input: FinalizeEventInput) =>
      communityRequest<PlannedEventResponse>(o, `events/${id}/results`, "POST", input),
    onMutate: () =>
      begin("finalize_event", (row) =>
        "dates" in row && row.id === id ? { ...row, canFinalize: false } : row,
      ),
    onSuccess: eventSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  return { create, update, vote, register, invite, respond, transition, finalize, busy };
}
