"use client";

import type {
  ChangeEventStateInput,
  ChangeEventVoteInput,
  CreatePlannedEventInput,
  DecideTableRegistrationInput,
  EditPlannedEventInput,
  FinalizeEventInput,
  JoinTableInput,
  PlannedEventResponse,
  PlannedTableResponse,
  TableInviteeResponse,
  TableRegistration,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { notifyManager, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import type { MutationFeedbackAction } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  optimisticBaseData,
  optimisticFailureAction,
  optimisticOperationSignal,
  updateOptimisticBase,
} from "../../common/optimisticOperation";
import {
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { mapCommunityCache, versionedCommunityChange } from "../../community/queryCache";
import { acknowledgeTableRegistration } from "../eventRegistrationCache";
import { changeEventVoteCounts } from "../eventVotes";
import { eventRecordKeys, eventRecordQuery } from "./useEventRecords";

type Row =
  | PlannedEventResponse
  | PlannedTableResponse
  | TableSeatResponse
  | (TableInviteeResponse & { optimisticInvited?: boolean });
export function useEventRecordActions(o: CommunityApiOptions, id: string) {
  const client = useQueryClient(),
    root = eventRecordKeys.root(o),
    mutationKey = [...root, "mutation", id];
  const resource = [...root, id || "new"];
  const busy = useOptimisticBusy(resource)();
  const write = <T>(path: string, method: string, input: unknown) =>
    communityRequest<T>(o, path, method, input, optimisticOperationSignal(client, resource));
  const affected = (key: readonly unknown[], eventId = id) =>
    key[3] === "list" ||
    (key[3] === "tables" && (key[4] === null || key[4] === eventId)) ||
    (["detail", "table", "seats", "leaderboard", "invitees"].includes(String(key[3])) &&
      key[4] === eventId);
  async function begin(
    action: MutationFeedbackAction,
    change: (row: Row, key: readonly unknown[]) => Row = (row) => row,
  ) {
    const guarded = versionedCommunityChange<Row>(
      change,
      (row) =>
        `${"dates" in row ? "event" : "gameIds" in row ? "table" : "tableId" in row ? "seat" : "invitee"}:${row.id}`,
    );
    const operation = await beginOptimisticOperation(
      client,
      [...root, id || "new"],
      { queryKey: root, predicate: (q) => affected(q.queryKey) },
      guarded.change,
    );
    guarded.seal();
    const announced =
      operation.modified &&
      ["update_event", "set_event_vote", "invite_event_player"].includes(action);
    if (announced) o.feedback?.onOptimisticUpdate?.(action);
    return { action, operation, guarded, announced, owner: o, eventId: id };
  }
  async function failure(error: Error, context: Awaited<ReturnType<typeof begin>> | undefined) {
    if (context?.operation.active)
      context.owner.feedback?.onError?.(error, optimisticFailureAction(error, context.action));
    await context?.operation.reject(error);
  }
  function settle(
    _data: unknown,
    _error: Error | null,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    const owner = context?.owner ?? o;
    // These refreshes are not part of the write and must never turn a committed write into failure.
    void client.invalidateQueries(
      {
        queryKey: eventRecordKeys.root(owner),
        predicate: (q) => affected(q.queryKey, context?.eventId ?? id),
      },
      { cancelRefetch: false },
    );
    void client.invalidateQueries({
      queryKey: ["groups", owner.apiUrl, owner.userId],
      refetchType: "active",
    });
  }
  function complete(context: Awaited<ReturnType<typeof begin>> | undefined) {
    if (!context?.operation.active) return;
    context.operation.commit();
    if (!context.announced) context.owner.feedback?.onSuccess?.(context.action);
  }
  function eventSuccess(
    value: PlannedEventResponse,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    if (!context?.operation.active) return;
    let saved = value;
    for (const [key] of client.getQueriesData({
      queryKey: eventRecordKeys.root(context.owner),
      predicate: (q) => q.queryKey[3] === "detail" || q.queryKey[3] === "list",
    }))
      mapCommunityCache<PlannedEventResponse>(optimisticBaseData(client, key), (row) => {
        if (row.id === value.id && row.version > saved.version) saved = row;
        return row;
      });
    notifyManager.batch(() => {
      updateOptimisticBase(client, eventRecordKeys.detail(context.owner, saved.id), () => saved);
      for (const [key] of client.getQueriesData({
        queryKey: eventRecordKeys.root(context.owner),
        predicate: (q) => q.queryKey[3] === "list",
      }))
        updateOptimisticBase(client, key, (current) =>
          mapCommunityCache<PlannedEventResponse>(current, (row) =>
            row.id === saved.id ? saved : row,
          ),
        );
      for (const [key] of client.getQueriesData({
        queryKey: eventRecordKeys.root(context.owner),
        predicate: (q) => q.queryKey[3] === "table" || q.queryKey[3] === "tables",
      }))
        updateOptimisticBase(client, key, (current) =>
          context.guarded.apply<PlannedTableResponse>(current, key, (row) => {
            if (row.eventId !== saved.id) return row;
            return saved.myRegistrations.reduce(
              (table, registration) =>
                acknowledgeTableRegistration(table, registration, context.owner.userId),
              row,
            );
          }),
        );
      complete(context);
    });
  }
  function registrationSuccess(...args: Parameters<typeof reconcileRegistration>) {
    void reconcileRegistration(...args);
  }
  async function reconcileRegistration(
    value: TableRegistration,
    availability: JoinTableInput["availability"] | undefined,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    if (!context?.operation.active) return;
    try {
      context.operation.acknowledge();
      notifyManager.batch(() => {
        if (value.userId === context.owner.userId) {
          for (const [key] of client.getQueriesData({
            queryKey: eventRecordKeys.root(context.owner),
            predicate: (q) => q.queryKey[3] === "detail" || q.queryKey[3] === "list",
          }))
            updateOptimisticBase(client, key, (currentData) =>
              context.guarded.apply<PlannedEventResponse>(currentData, key, (row) => {
                if (row.id !== value.eventId) return row;
                const current = row.myRegistrations ?? [];
                if (
                  current.some(
                    (registration) =>
                      registration.tableId === value.tableId &&
                      registration.version > value.version,
                  )
                )
                  return row;
                return {
                  ...row,
                  myRegistrations: [
                    ...current.filter((registration) => registration.tableId !== value.tableId),
                    ...(["PENDING", "ACCEPTED"].includes(value.status) ? [value] : []),
                  ],
                  ...(availability && row.version <= availability.version
                    ? {
                        myVotes: {
                          ...row.myVotes,
                          dateVotes: availability.dateVotes,
                          locationVotes: availability.locationVotes,
                        },
                      }
                    : {}),
                };
              }),
            );
        }
        for (const [key] of client.getQueriesData({
          queryKey: eventRecordKeys.root(context.owner),
          predicate: (q) => q.queryKey[3] === "table" || q.queryKey[3] === "tables",
        }))
          updateOptimisticBase(client, key, (currentData) =>
            context.guarded.apply<PlannedTableResponse>(currentData, key, (row) =>
              acknowledgeTableRegistration(row, value, context.owner.userId),
            ),
          );
      });
      if (!context.announced) {
        context.owner.feedback?.onSuccess?.(context.action);
        context.announced = true;
      }
      // Registration responses do not contain the incremented Event version. Only this
      // authoritative detail is required before another versioned action can start.
      const query = eventRecordQuery(context.owner, value.eventId);
      const current = await context.operation.read(query.queryKey, () =>
        client.fetchQuery({
          ...query,
          staleTime: 0,
          retry: false,
        }),
      );
      eventSuccess(current, undefined, context);
    } catch (error) {
      if (!context.operation.active) return;
      // The acknowledgement is already in the base. Keep a resource-only read barrier
      // if its new version cannot be verified; never restore pre-commit participation.
      if (!context.announced) context.owner.feedback?.onSuccess?.(context.action);
      if (!communityAccessDenied(error))
        context.owner.feedback?.onError?.(
          error instanceof Error ? error : new Error("Refresh failed"),
          "refresh_saved_changes",
        );
      await context.operation.reject(error instanceof Error ? error : new Error("Refresh failed"));
    }
  }
  const create = useMutation({
    mutationKey,
    mutationFn: (input: CreatePlannedEventInput) =>
      write<PlannedEventResponse>("events", "POST", input),
    onMutate: () => begin("create_event"),
    onSuccess: eventSuccess,
    onError: (error, _v, c) => failure(error, c),
    onSettled: settle,
  });
  const update = useMutation({
    mutationKey,
    mutationFn: (input: EditPlannedEventInput) =>
      write<PlannedEventResponse>(`events/${id}`, "PATCH", input),
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
      write<PlannedEventResponse>(`events/${id}/votes`, "PATCH", input),
    onMutate: (input) =>
      begin("set_event_vote", (row) => {
        if (input.kind !== "game" && "dates" in row && row.id === id) {
          const field = input.kind === "date" ? "dateVotes" : "locationVotes";
          return {
            ...row,
            ...(row.voteCounts
              ? {
                  voteCounts: {
                    ...row.voteCounts,
                    [input.kind === "date" ? "dates" : "locations"]: changeEventVoteCounts(
                      row.voteCounts[input.kind === "date" ? "dates" : "locations"],
                      input.optionId,
                      row.myVotes?.[field][input.optionId] ?? "UNKNOWN",
                      input.vote,
                    ),
                  },
                }
              : {}),
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
            ...(row.gameVoteCounts
              ? {
                  gameVoteCounts: changeEventVoteCounts(
                    row.gameVoteCounts,
                    String(input.gameId),
                    row.myRegistration.gameVotes[String(input.gameId)] ?? "UNKNOWN",
                    input.vote,
                  ),
                }
              : {}),
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
    mutationFn: ({ tableId, ...input }: JoinTableInput & { tableId: string }) =>
      write<TableRegistration>(`events/${id}/tables/${tableId}/registrations`, "POST", input),
    onMutate: (value) =>
      begin("join_table", (row) =>
        "canRegister" in row && row.id === value.tableId ? { ...row, canRegister: false } : row,
      ),
    onSuccess: (value, input, context) => registrationSuccess(value, input.availability, context),
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const invite = useMutation({
    mutationKey,
    mutationFn: ({ tableId, userId }: { tableId: string; userId: string }) =>
      write<TableRegistration>(`events/${id}/tables/${tableId}/invitations`, "POST", {
        userId,
      }),
    onMutate: ({ tableId, userId }) =>
      begin("invite_event_player", (row, key) =>
        key[3] === "invitees" && key[5] === tableId && row.id === userId
          ? { ...row, optimisticInvited: true }
          : row,
      ),
    onSuccess: (value, _input, context) => registrationSuccess(value, undefined, context),
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
    }) => write<TableRegistration>(`table-registrations/${registrationId}`, "PATCH", input),
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
                // Keep the invitation's sheet mounted until acceptance actually commits.
                canRespond: input.action === "accept" ? row.canRespond : false,
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
    onSuccess: (value, { input }, context) =>
      registrationSuccess(
        value,
        input.action === "accept" ? input.participation.availability : undefined,
        context,
      ),
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const transition = useMutation({
    mutationKey,
    mutationFn: (input: ChangeEventStateInput) =>
      write<PlannedEventResponse>(`events/${id}/state`, "PATCH", input),
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
      write<PlannedEventResponse>(`events/${id}/results`, "POST", input),
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
