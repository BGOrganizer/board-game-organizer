"use client";

import type {
  ChangeEventStateInput,
  ChangeEventVoteInput,
  DecideTableRegistrationInput,
  DeletedPlannedEventResponse,
  DeletePlannedRecordInput,
  FinalizeEventInput,
  JoinTableInput,
  PlannedEventResponse,
  PlannedTableResponse,
  TableInviteeResponse,
  TableRegistration,
  TableRegistrationReceipt,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { tableRegistrationReceiptSchema } from "@board-game-organizer/schemas";
import {
  hashKey,
  type MutationFunctionContext,
  notifyManager,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { withClientRequestId } from "../../common/clientMutation";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import type { MutationFeedbackAction } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  cancelOptimisticResource,
  optimisticBaseData,
  optimisticFailureAction,
  optimisticMutationSignal,
  optimisticOperationSignal,
  updateOptimisticBase,
} from "../../common/optimisticOperation";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import {
  filterCommunityPages,
  mapCommunityCache,
  versionedCommunityChange,
} from "../../community/queryCache";
import { groupRecordDetailQuery, groupRecordKeys } from "../../groups/hooks/useGroupRecords";
import {
  captureEventConsent,
  type EventConsentSnapshot,
  rebaseEventConsent,
} from "../eventConsentVersion";
import { projectEventRemoval } from "../eventDeletionCache";
import {
  type CreateEventVariables,
  type EditEventVariables,
  eventCreationMatches,
} from "../eventOptimisticCreation";
import { optimisticEventVote } from "../eventOptimisticVote";
import { acknowledgeTableRegistration } from "../eventRegistrationCache";
import { eventRecordKeys, eventRecordQuery, eventRecordsQuery } from "./useEventRecords";

type Row =
  | PlannedEventResponse
  | PlannedTableResponse
  | TableSeatResponse
  | (TableInviteeResponse & { optimisticInvited?: boolean });
export function useEventRecordActions(o: CommunityApiOptions, id: string) {
  const client = useQueryClient(),
    root = eventRecordKeys.root(o),
    mutationKey = eventRecordKeys.mutation(o, id);
  const resource = [...root, id || "new"];
  const resourceBusy = useOptimisticBusy(resource);
  const busy = resourceBusy();
  const blocking = resourceBusy([...resource, "write"]);
  const queue = JSON.stringify(["event-actions", ...resource]);
  const scope = { id: queue };
  const write = async <T>(
    path: string,
    method: string,
    input: unknown,
    context?: MutationFunctionContext,
    variables: unknown = input,
  ) =>
    communityRequest<T>(
      o,
      path,
      method,
      input,
      context
        ? await optimisticMutationSignal(client, context.mutationKey, variables)
        : optimisticOperationSignal(client, resource),
    );
  const affected = (key: readonly unknown[], eventId = id) =>
    key[3] === "list" ||
    (key[3] === "tables" && (key[4] === null || key[4] === eventId)) ||
    (["detail", "table", "seats", "leaderboard", "invitees"].includes(String(key[3])) &&
      key[4] === eventId);
  async function begin(
    action: MutationFeedbackAction,
    change: (row: Row, key: readonly unknown[]) => Row = (row) => row,
    lane: QueryKey = ["write"],
    project?: (data: unknown, key: QueryKey) => unknown,
    eventId = id,
    dependencies: readonly QueryKey[] = [],
  ) {
    const guarded = versionedCommunityChange<Row>(
      change,
      (row) =>
        `${"dates" in row ? "event" : "gameIds" in row ? "table" : "tableId" in row ? "seat" : "invitee"}:${row.id}`,
    );
    const target = [...root, eventId || "new"];
    const targetQueue = JSON.stringify(["event-actions", ...target]);
    const operation = await beginOptimisticOperation(
      client,
      [...target, ...lane],
      { queryKey: root, predicate: (q) => affected(q.queryKey, eventId) },
      project ?? guarded.change,
      [],
      undefined,
      targetQueue,
      dependencies,
    );
    guarded.seal();
    const announced = true;
    o.feedback?.onOptimisticUpdate?.(action);
    return {
      action,
      operation,
      guarded,
      announced,
      owner: o,
      eventId,
      receipt: undefined as PlannedEventResponse | undefined,
      acknowledgedVersion: undefined as number | undefined,
      consent: undefined as EventConsentSnapshot | undefined,
      afterRemovalId: undefined as number | undefined,
    };
  }
  async function failure(error: Error, context: Awaited<ReturnType<typeof begin>> | undefined) {
    if (context?.operation.active)
      context.owner.feedback?.onError?.(error, optimisticFailureAction(error, context.action));
    await context?.operation.reject(error);
    // An unknown outcome holds background FIFO, not the screen or the next intent.
    if (context?.operation.active) await context.operation.wait();
  }
  function settle(
    _data: unknown,
    _error: Error | null,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    if (context?.operation.signal.aborted) return;
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
    context.operation.commit((_data, key) => optimisticBaseData(client, key));
    if (!context.announced) context.owner.feedback?.onSuccess?.(context.action);
  }
  function eventSuccess(
    value: PlannedEventResponse,
    _input: unknown,
    context: Awaited<ReturnType<typeof begin>> | undefined,
  ) {
    if (!context?.operation.active) return;
    context.operation.acknowledge();
    let saved = value;
    for (const [key] of client.getQueriesData({
      queryKey: eventRecordKeys.root(context.owner),
      predicate: (q) => q.queryKey[3] === "detail" || q.queryKey[3] === "list",
    }))
      mapCommunityCache<PlannedEventResponse>(optimisticBaseData(client, key), (row) => {
        if (row.id === value.id && row.version > saved.version) saved = row;
        return row;
      });
    context.receipt = saved;
    notifyManager.batch(() => {
      updateOptimisticBase(client, eventRecordKeys.detail(context.owner, saved.id), (current) => {
        const previous = current as PlannedEventResponse | undefined;
        return previous?.version === saved.version ? { ...previous, ...saved } : saved;
      });
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
          mapCommunityCache<PlannedTableResponse>(current, (row) => {
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
  function eventReceiptSuccess(...args: Parameters<typeof eventSuccess>) {
    const [value, , context] = args;
    if (context?.operation.active && value.id === context.eventId)
      context.acknowledgedVersion = value.version;
    return eventSuccess(...args);
  }
  function registrationSuccess(
    value: TableRegistrationReceipt,
    availability: JoinTableInput["availability"] | undefined,
    context: Awaited<ReturnType<typeof begin>> | undefined,
    expected: Pick<TableRegistration, "tableId" | "userId"> | Pick<TableRegistration, "id">,
  ) {
    const { eventVersion, ...registration } = value;
    const matches =
      "id" in expected
        ? value.id === expected.id
        : value.tableId === expected.tableId && value.userId === expected.userId;
    if (context?.operation.active && value.eventId === context.eventId && matches)
      context.acknowledgedVersion = eventVersion;
    return reconcileRegistration(registration, availability, context);
  }
  function currentEvent() {
    let current = optimisticBaseData(client, eventRecordKeys.detail(o, id)) as
      | PlannedEventResponse
      | undefined;
    for (const [key] of client.getQueriesData({
      queryKey: root,
      predicate: (q) => q.queryKey[3] === "detail" || q.queryKey[3] === "list",
    }))
      mapCommunityCache<PlannedEventResponse>(optimisticBaseData(client, key), (row) => {
        if (row.id === id && "dates" in row && (!current || row.version > current.version))
          current = row;
        return row;
      });
    return current;
  }
  function currentTable(tableId: string | undefined, registrationId?: string) {
    let current: PlannedTableResponse | undefined;
    for (const [key] of client.getQueriesData({
      queryKey: root,
      predicate: (q) => q.queryKey[3] === "table" || q.queryKey[3] === "tables",
    }))
      mapCommunityCache<PlannedTableResponse>(optimisticBaseData(client, key), (row) => {
        if (
          "games" in row &&
          row.eventId === id &&
          (tableId ? row.id === tableId : row.myRegistration?.id === registrationId) &&
          (!current || row.updatedAt > current.updatedAt)
        )
          current = row;
        return row;
      });
    return current;
  }
  async function participationRequest(context: MutationFunctionContext, variables: unknown) {
    const signal = await optimisticMutationSignal(client, context.mutationKey, variables);
    const mutation = client
      .getMutationCache()
      .findAll({ mutationKey: context.mutationKey, exact: true, status: "pending" })
      .find(
        (value) =>
          value.state.variables === variables &&
          (value.state.context as Awaited<ReturnType<typeof begin>> | undefined)?.operation.active,
      );
    const local = mutation?.state.context as Awaited<ReturnType<typeof begin>> | undefined;
    if (!local?.operation.active) throw new Error("MUTATION_OWNER_CHANGED");
    return { signal, local };
  }
  function preparedConsent(input: JoinTableInput, context: Awaited<ReturnType<typeof begin>>) {
    const event = currentEvent();
    const table = currentTable(context.consent?.tableId);
    const owned = client
      .getMutationCache()
      .getAll()
      .some(
        (mutation) =>
          mutation.state.status === "success" &&
          mutation.options.scope?.id === queue &&
          (mutation.state.context as Awaited<ReturnType<typeof begin>> | undefined)
            ?.acknowledgedVersion === event?.version,
      );
    return rebaseEventConsent(
      input,
      context.consent,
      event,
      table,
      owned ? event?.version : undefined,
    );
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
        if (["PENDING", "ACCEPTED"].includes(value.status))
          for (const [key] of client.getQueriesData({
            queryKey: eventRecordKeys.root(context.owner),
            predicate: (q) =>
              q.queryKey[3] === "invitees" &&
              q.queryKey[4] === value.eventId &&
              q.queryKey[5] === value.tableId,
          }))
            updateOptimisticBase(client, key, (data) =>
              filterCommunityPages<{ id: string }>(data, (person) => person.id !== value.userId),
            );
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
                  ...(!["PENDING", "ACCEPTED"].includes(value.status) &&
                  current.some(
                    (registration) =>
                      registration.id === value.id && registration.status === "ACCEPTED",
                  ) &&
                  !current.some(
                    (registration) =>
                      registration.tableId !== value.tableId && registration.status === "ACCEPTED",
                  )
                    ? { participantCount: Math.max(0, row.participantCount - 1), canVote: false }
                    : {}),
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
      // The atomic receipt proves its parent epoch, not the complete capabilities,
      // counts or agreement. Canonical detail and materialized roster reads still gate FIFO.
      const query = eventRecordQuery(context.owner, value.eventId);
      const rosters = client.getQueryCache().findAll({
        queryKey: eventRecordKeys.root(context.owner),
        predicate: (cached) =>
          cached.queryKey[3] === "seats" &&
          cached.queryKey[4] === value.eventId &&
          cached.queryKey[5] === value.tableId &&
          !cached.isDisabled() &&
          typeof cached.options.queryFn === "function",
      });
      const [eventRead, rosterReads] = await Promise.allSettled([
        context.operation.read(query.queryKey, () =>
          client.fetchQuery({ ...query, staleTime: 0, retry: false }),
        ),
        Promise.allSettled(
          rosters.map((roster) =>
            context.operation.read(roster.queryKey, () =>
              client.fetchQuery({
                ...roster.options,
                queryKey: roster.queryKey,
                staleTime: 0,
                retry: false,
                networkMode: "always",
              }),
            ),
          ),
        ),
      ] as const);
      if (eventRead.status === "rejected") throw eventRead.reason;
      if (rosterReads.status === "rejected") throw rosterReads.reason;
      for (const read of rosterReads.value) if (read.status === "rejected") throw read.reason;
      eventSuccess(eventRead.value, undefined, context);
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
      if (context.operation.active) await context.operation.wait();
    }
  }
  const create = useMutation({
    mutationKey: eventRecordKeys.mutation(o, "", "create"),
    scope: { id: JSON.stringify(["event-actions", ...root, "new"]) },
    gcTime: 30 * 60_000,
    networkMode: "always",
    mutationFn: async (variables: CreateEventVariables, context) => {
      const signal = await optimisticMutationSignal(client, context.mutationKey, variables);
      if (variables.groupId) {
        const parent = [...groupRecordKeys.root(o), variables.groupId];
        try {
          const group = await client.fetchQuery({
            ...groupRecordDetailQuery(o, variables.groupId),
            staleTime: 0,
            retry: false,
          });
          if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
          if (
            group.id !== variables.groupId ||
            group.role !== "admin" ||
            !group.canInvite ||
            !group.canEdit
          )
            throw new CommunityApiError(403, "GROUP_ADMIN_REQUIRED");
        } catch (error) {
          if (!signal.aborted && communityAccessDenied(error)) {
            o.feedback?.onError?.(
              error instanceof Error ? error : new Error("GROUP_NOT_FOUND"),
              "create_event",
            );
            cancelOptimisticResource(client, parent, true);
          }
          throw error;
        }
      }
      const {
        clientDraft: _draft,
        clientGroup: _group,
        clientInitialGroupId: _initialGroup,
        ...input
      } = variables;
      return write<PlannedEventResponse>("events", "POST", input, context, variables);
    },
    onMutate: (input) =>
      begin(
        "create_event",
        undefined,
        ["create"],
        undefined,
        "",
        input.groupId ? [[...groupRecordKeys.root(o), input.groupId]] : [],
      ),
    onSuccess: async (saved, input, context) => {
      if (!context?.operation.active) return;
      context.operation.acknowledge();
      context.receipt = saved;
      const detail = eventRecordQuery(context.owner, saved.id);
      client
        .getQueryCache()
        .build(client, { ...detail, queryKey: eventRecordKeys.detail(context.owner, saved.id) });
      updateOptimisticBase(client, detail.queryKey, (current) =>
        current && (current as PlannedEventResponse).version >= saved.version ? current : saved,
      );
      try {
        let canonical = saved;
        const choose = (row: PlannedEventResponse) => {
          if (row.id === saved.id && row.version >= canonical.version)
            canonical = { ...(row.version === canonical.version ? canonical : {}), ...row };
          return row;
        };
        const list = eventRecordsQuery(
          context.owner,
          saved.groupId ? { groupId: saved.groupId } : {},
        );
        const page = await context.operation.read(list.queryKey, () =>
          client.fetchInfiniteQuery({ ...list, staleTime: 0, retry: false, networkMode: "always" }),
        );
        mapCommunityCache<PlannedEventResponse>(page, choose);
        context.receipt = canonical;
        const visible = client.getQueryCache().findAll({
          queryKey: eventRecordKeys.root(context.owner),
          predicate: (query) => {
            if (
              query.queryKey[3] !== "list" ||
              query.queryHash === hashKey(list.queryKey) ||
              !query.isActive() ||
              typeof query.options.queryFn !== "function"
            )
              return false;
            if (
              !query.queryKey[4] ||
              typeof query.queryKey[4] !== "object" ||
              Array.isArray(query.queryKey[4])
            )
              return false;
            const filters = query.queryKey[4] as {
              groupId?: string | null;
              query?: string;
              periods?: ("past" | "future")[];
            };
            return eventCreationMatches(canonical, {
              ...filters,
              groupId: filters.groupId ?? undefined,
            });
          },
        });
        const reads = await Promise.allSettled(
          visible.map(async (query) => {
            const data = await context.operation.read(query.queryKey, () =>
              client.fetchQuery({
                ...query.options,
                queryKey: query.queryKey,
                staleTime: 0,
                retry: false,
                networkMode: "always",
              }),
            );
            mapCommunityCache<PlannedEventResponse>(data, choose);
          }),
        );
        const failed = reads.find((read) => read.status === "rejected");
        if (failed) throw failed.reason;
        eventSuccess(canonical, input, context);
      } catch (error) {
        if (!context.operation.active) return;
        if (communityAccessDenied(error)) {
          context.receipt = undefined;
          client.removeQueries({
            queryKey: eventRecordKeys.detail(context.owner, saved.id),
            exact: true,
          });
        }
        context.owner.feedback?.onError?.(
          error instanceof Error ? error : new Error("Refresh failed"),
          "refresh_saved_changes",
        );
        await context.operation.reject(
          error instanceof Error ? error : new Error("Refresh failed"),
        );
        if (context.operation.active) await context.operation.wait();
      }
    },
    onError: async (error, input, context) => {
      if (context?.operation.active && input.groupId && communityAccessDenied(error)) {
        try {
          await client.fetchQuery({
            ...groupRecordDetailQuery(context.owner, input.groupId),
            staleTime: 0,
            retry: false,
          });
        } catch (parentError) {
          if (context.operation.active && communityAccessDenied(parentError)) {
            context.owner.feedback?.onError?.(error, "create_event");
            cancelOptimisticResource(
              client,
              [...groupRecordKeys.root(context.owner), input.groupId],
              true,
            );
          }
        }
      }
      await failure(error, context);
    },
    onSettled: settle,
  });
  const update = useMutation({
    mutationKey: [...mutationKey, "update"],
    gcTime: 30 * 60_000,
    scope,
    networkMode: "always",
    mutationFn: (variables: EditEventVariables, context) => {
      const { clientDraft: _draft, ...input } = variables;
      return write<PlannedEventResponse>(`events/${id}`, "PATCH", input, context, variables);
    },
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
    onSuccess: eventReceiptSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationKey: [...mutationKey, "remove"],
    scope,
    networkMode: "always",
    mutationFn: async (input: DeletePlannedRecordInput, context) => {
      const value = await write<DeletedPlannedEventResponse>(
        `events/${id}`,
        "DELETE",
        input,
        context,
      );
      if (value.id !== id) throw new Error("MUTATION_READ_UNVERIFIED");
      return value;
    },
    onMutate: (input) =>
      begin("delete_event", undefined, ["write"], (data, key) =>
        projectEventRemoval(data, key, id, input.version),
      ),
    onSuccess: (deleted, _input, context) => {
      if (!context?.operation.active || deleted.id !== context.eventId) return;
      context.operation.acknowledge();
      context.operation.commit();
      const ownerRoot = eventRecordKeys.root(context.owner);
      cancelOptimisticResource(client, [...ownerRoot, deleted.id]);
      const ownedDetails = {
        queryKey: ownerRoot,
        predicate: (query: { queryKey: QueryKey }) =>
          query.queryKey[4] === deleted.id && query.queryKey[3] !== "list",
      };
      void client.cancelQueries(ownedDetails);
      client.removeQueries(ownedDetails);
      void client.invalidateQueries({
        queryKey: ["notifications", context.owner.apiUrl, context.owner.userId],
      });
    },
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const removeTable = useMutation({
    mutationKey: [...mutationKey, "remove-table"],
    scope,
    networkMode: "always",
    mutationFn: async (input: DeletePlannedRecordInput & { tableId: string }, context) => {
      const value = await write<PlannedEventResponse>(
        `events/${id}/tables/${encodeURIComponent(input.tableId)}`,
        "DELETE",
        { version: input.version },
        context,
        input,
      );
      if (value.id !== id || value.version !== input.version + 1)
        throw new Error("MUTATION_READ_UNVERIFIED");
      return value;
    },
    onMutate: (input) =>
      begin("delete_table", undefined, ["write"], (data, key) =>
        projectEventRemoval(data, key, id, input.version, input.tableId),
      ),
    onSuccess: (saved, input, context) => {
      if (!context?.operation.active || saved.id !== context.eventId) return;
      const ownerRoot = eventRecordKeys.root(context.owner);
      for (const [key] of client.getQueriesData({
        queryKey: ownerRoot,
        predicate: (query) => query.queryKey[3] === "tables",
      }))
        updateOptimisticBase(client, key, (data) =>
          filterCommunityPages<PlannedTableResponse>(
            data,
            (row) => row.eventId !== saved.id || row.id !== input.tableId,
          ),
        );
      eventReceiptSuccess(saved, input, context);
      for (const mutation of client
        .getMutationCache()
        .findAll({ mutationKey: eventRecordKeys.mutation(context.owner, saved.id) })) {
        const variables = mutation.state.variables as { tableId?: string } | undefined;
        const active = mutation.state.context as Awaited<ReturnType<typeof begin>> | undefined;
        if (variables?.tableId === input.tableId && active?.operation.active)
          cancelOptimisticResource(client, active.operation.resource);
      }
      const ownedDetails = {
        queryKey: ownerRoot,
        predicate: (query: { queryKey: QueryKey }) =>
          ["table", "seats", "invitees", "leaderboard"].includes(String(query.queryKey[3])) &&
          query.queryKey[4] === saved.id &&
          query.queryKey[5] === input.tableId,
      };
      void client.cancelQueries(ownedDetails);
      client.removeQueries(ownedDetails);
    },
    onError: (error, _input, context) => failure(error, context),
    onSettled: settle,
  });
  const vote = useMutation({
    mutationKey: [...mutationKey, "vote"],
    scope,
    networkMode: "always",
    mutationFn: (input: ChangeEventVoteInput, context) =>
      write<PlannedEventResponse>(`events/${id}/votes`, "PATCH", input, context),
    onMutate: (input) =>
      begin("set_event_vote", undefined, ["vote"], (data) =>
        optimisticEventVote(data, id, o.userId, input),
      ),
    onSuccess: eventReceiptSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const register = useMutation({
    mutationKey: [...mutationKey, "register"],
    gcTime: 30 * 60_000,
    scope,
    networkMode: "always",
    mutationFn: async (variables: JoinTableInput & { tableId: string }, context) => {
      const { signal, local } = await participationRequest(context, variables);
      const { tableId, ...input } = variables;
      return communityRequest<TableRegistrationReceipt>(
        o,
        `events/${id}/tables/${tableId}/registrations`,
        "POST",
        preparedConsent(input, local),
        signal,
      );
    },
    onMutate: async (value) => {
      const consent = captureEventConsent(value, currentEvent(), currentTable(value.tableId));
      const context = await begin(
        "join_table",
        (row) =>
          "canRegister" in row && row.id === value.tableId ? { ...row, canRegister: false } : row,
        ["registration", value.tableId],
      );
      context.consent = consent;
      return context;
    },
    onSuccess: (value, input, context) =>
      registrationSuccess(value, input.availability, context, {
        tableId: input.tableId,
        userId: o.userId ?? "",
      }),
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const invite = useMutation({
    mutationKey: [...mutationKey, "invite"],
    scope,
    networkMode: "always",
    mutationFn: async (
      variables: {
        tableId: string;
        userId: string;
        person?: Pick<TableInviteeResponse, "name" | "username" | "avatarUrl">;
      },
      context,
    ) => {
      const { signal, local } = await participationRequest(context, variables);
      if (local.afterRemovalId !== undefined) {
        const removal = client
          .getMutationCache()
          .getAll()
          .find((mutation) => mutation.mutationId === local.afterRemovalId);
        const removed = removal?.state.variables as
          | Parameters<typeof respond.mutate>[0]
          | undefined;
        const receipt = tableRegistrationReceiptSchema.safeParse(removal?.state.data);
        if (
          removal?.state.status !== "success" ||
          !receipt.success ||
          receipt.data.id !== removed?.registrationId ||
          receipt.data.version !== (removed?.input.version ?? 0) + 1 ||
          receipt.data.eventId !== id ||
          receipt.data.tableId !== variables.tableId ||
          receipt.data.userId !== variables.userId ||
          receipt.data.status !== "CANCELLED"
        )
          throw new CommunityApiError(409, "EVENT_CHANGED");
      }
      return communityRequest<TableRegistrationReceipt>(
        o,
        `events/${id}/tables/${variables.tableId}/invitations`,
        "POST",
        { userId: variables.userId },
        signal,
      );
    },
    onMutate: async ({ tableId, userId }) => {
      const removal = client
        .getMutationCache()
        .findAll({ mutationKey: [...mutationKey, "respond"], status: "pending" })
        .reverse()
        .find((mutation) => {
          const value = mutation.state.variables as Parameters<typeof respond.mutate>[0];
          return (
            value.tableId === tableId &&
            value.input.action === "remove" &&
            value.person?.userId === userId
          );
        });
      const context = await begin(
        "invite_event_player",
        (row, key) =>
          key[3] === "invitees" && key[5] === tableId && row.id === userId
            ? { ...row, optimisticInvited: true }
            : row,
        ["invite", tableId, userId],
      );
      context.afterRemovalId = removal?.mutationId;
      return context;
    },
    onSuccess: (value, input, context) =>
      registrationSuccess(value, undefined, context, {
        tableId: input.tableId,
        userId: input.userId,
      }),
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const respond = useMutation({
    mutationKey: [...mutationKey, "respond"],
    gcTime: 30 * 60_000,
    scope,
    networkMode: "always",
    mutationFn: async (
      variables: {
        registrationId: string;
        tableId?: string;
        person?: Pick<TableSeatResponse, "userId" | "name" | "username" | "avatarUrl">;
        input: DecideTableRegistrationInput;
      },
      context,
    ) => {
      const { signal, local } = await participationRequest(context, variables);
      const input =
        variables.input.action === "accept"
          ? {
              ...variables.input,
              participation: preparedConsent(variables.input.participation, local),
            }
          : variables.input;
      return communityRequest<TableRegistrationReceipt>(
        o,
        `table-registrations/${variables.registrationId}`,
        "PATCH",
        input,
        signal,
      );
    },
    onMutate: async ({ registrationId, tableId, input }) => {
      if (resourceBusy([...resource, "registration", registrationId]))
        throw new Error("MUTATION_IN_PROGRESS");
      const table = currentTable(tableId, registrationId);
      const consent =
        input.action === "accept" && table?.myRegistration?.id === registrationId
          ? captureEventConsent(input.participation, currentEvent(), table)
          : undefined;
      const context = await begin(
        (
          {
            accept: "accept_event_invitation",
            decline: "decline_event_invitation",
            cancel: "leave_table",
            remove: "remove_event_player",
          } as const
        )[input.action],
        (row) => {
          const negative = input.action !== "accept";
          const status =
            input.action === "decline" ? ("DECLINED" as const) : ("CANCELLED" as const);
          if (negative && "dates" in row && row.id === id) {
            const mine = row.myRegistrations?.find(
              (registration) =>
                registration.id === registrationId && registration.userId === o.userId,
            );
            if (!mine) return row;
            const remaining = row.myRegistrations.filter(
              (registration) => registration.id !== registrationId,
            );
            const accepted = remaining.some((registration) => registration.status === "ACCEPTED");
            return {
              ...row,
              myRegistrations: remaining,
              canVote: row.canVote && accepted,
              participantCount:
                mine.status === "ACCEPTED" && !accepted
                  ? Math.max(0, row.participantCount - 1)
                  : row.participantCount,
            };
          }
          if ("myRegistration" in row && row.myRegistration?.id === registrationId)
            return {
              ...row,
              canRespond: false,
              canLeave: false,
              ...(negative
                ? { myPosition: null, myRegistration: { ...row.myRegistration, status } }
                : {}),
            };
          return negative && "tableId" in row && row.id === registrationId
            ? { ...row, status }
            : row;
        },
        ["registration", registrationId],
      );
      context.consent = consent;
      return context;
    },
    onSuccess: (value, { registrationId, input }, context) =>
      registrationSuccess(
        value,
        input.action === "accept" ? input.participation.availability : undefined,
        context,
        { id: registrationId },
      ),
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const transition = useMutation({
    mutationKey: [...mutationKey, "transition"],
    scope,
    networkMode: "always",
    mutationFn: (input: ChangeEventStateInput, context) =>
      write<PlannedEventResponse>(`events/${id}/state`, "PATCH", input, context),
    onMutate: (input) =>
      begin(input.action === "confirm" ? "confirm_event" : "replan_event", (row) =>
        "dates" in row && row.id === id ? { ...row, canConfirm: false, canReplan: false } : row,
      ),
    onSuccess: eventReceiptSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const finalize = useMutation({
    mutationKey: [...mutationKey, "finalize"],
    gcTime: 30 * 60_000,
    scope,
    networkMode: "always",
    mutationFn: (input: FinalizeEventInput, context) =>
      write<PlannedEventResponse>(`events/${id}/results`, "POST", input, context),
    onMutate: () =>
      begin("finalize_event", (row) =>
        "dates" in row && row.id === id ? { ...row, canFinalize: false } : row,
      ),
    onSuccess: eventReceiptSuccess,
    onError: (e, _v, c) => failure(e, c),
    onSettled: settle,
  });
  const isInviting = (tableId: string, userId: string) =>
    resourceBusy([...resource, "invite", tableId, userId]);
  const isResponding = (registrationId: string) =>
    resourceBusy([...resource, "registration", registrationId]);
  const creation = {
    ...create,
    mutate: (...args: Parameters<typeof create.mutate>) =>
      create.mutate(withClientRequestId(args[0]), args[1]),
    mutateAsync: (...args: Parameters<typeof create.mutateAsync>) =>
      create.mutateAsync(withClientRequestId(args[0]), args[1]),
  };
  return {
    create: creation,
    update,
    remove,
    removeTable,
    vote,
    register,
    invite,
    respond,
    transition,
    finalize,
    busy,
    blocking,
    isInviting,
    isResponding,
  };
}
