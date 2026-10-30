"use client";

import type { BggAccountResponse } from "@board-game-organizer/schemas";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiHeaders, withProtectionBypass } from "../../common/api";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import type { MutationFeedback } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  optimisticFailureAction,
  optimisticOperationSignal,
} from "../../common/optimisticOperation";
import { CommunityApiError } from "../../community/communityApi";

const empty: BggAccountResponse = { active: null, pending: null };
type BggAccountOptions = {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  protectionBypass?: string | null;
};
async function requestBggAccount(
  options: BggAccountOptions,
  method = "GET",
  path = "account",
  input?: unknown,
  signal?: AbortSignal,
): Promise<BggAccountResponse> {
  const token = await options.getToken();
  if (!token) throw new CommunityApiError(401, "No session token");
  if (signal?.aborted) throw new Error("MUTATION_OWNER_CHANGED");
  const response = await fetch(
    withProtectionBypass(`${options.apiUrl}/api/bgg/${path}`, options.protectionBypass),
    {
      method,
      headers: apiHeaders(token),
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      signal,
    },
  );
  if (!response.ok)
    throw new CommunityApiError(
      response.status,
      response.status === 404 ? "BGG user not found" : `HTTP ${response.status}`,
    );
  return (await response.json()) as BggAccountResponse;
}
export function bggAccountQuery(options: BggAccountOptions) {
  return queryOptions({
    queryKey: ["bgg-account", options.apiUrl, options.userId] as const,
    queryFn: ({ signal }) => requestBggAccount(options, "GET", "account", undefined, signal),
    enabled: Boolean(options.userId),
    staleTime: 5 * 60_000,
  });
}

export function useBggAccount({
  apiUrl,
  getToken,
  userId,
  protectionBypass,
  enabled = true,
  feedback,
}: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  protectionBypass?: string | null;
  enabled?: boolean;
  feedback?: MutationFeedback;
}) {
  const client = useQueryClient();
  const options = { apiUrl, getToken, userId, protectionBypass };
  const query = bggAccountQuery(options);
  const key = query.queryKey;
  const resourceBusy = useOptimisticBusy(key);
  const busy = resourceBusy();
  const begin = (unlink = false) =>
    beginOptimisticOperation(client, key, { queryKey: key, exact: true }, (data) =>
      unlink && data ? empty : data,
    );
  const request = (method = "GET", path = "account", input?: unknown) =>
    requestBggAccount(
      options,
      method,
      path,
      input,
      method === "GET" ? undefined : optimisticOperationSignal(client, key),
    );
  const account = useQuery({
    ...query,
    enabled: enabled && Boolean(userId) && !busy,
    refetchInterval: (query) => (query.state.data?.pending?.status === "syncing" ? 5000 : false),
  });
  const link = useMutation({
    mutationKey: key,
    mutationFn: (username: string) => request("POST", "account", { username }),
    onMutate: () => begin(),
    onSuccess: (data, _input, operation) => {
      if (!operation?.active) return;
      // Linking only stages a validated identity; it is not a published collection yet.
      operation.commit(() => data);
    },
    onError: async (error, _input, operation) => {
      if (operation && !operation.active) return;
      feedback?.onError?.(error, optimisticFailureAction(error, "link_bgg"));
      await operation?.reject(error);
    },
  });
  const sync = useMutation({
    mutationKey: key,
    mutationFn: (input: boolean | { retry: boolean; silent: true }) =>
      request(
        "POST",
        `account/sync${(typeof input === "boolean" ? input : input.retry) ? "?retry=true" : ""}`,
      ),
    onMutate: () => begin(),
    onSuccess: (data, input, operation) => {
      if (!operation?.active) return;
      operation.commit(() => data);
      if (typeof input === "boolean") {
        if (data.pending?.status === "failed")
          feedback?.onError?.(new Error("BGG_SYNC_FAILED"), "sync_bgg");
        else feedback?.onSuccess?.("sync_bgg");
      }
      if (data.active)
        void client.invalidateQueries({
          queryKey: ["bgg-picker", operation.resource[1], operation.resource[2]],
        });
    },
    onError: async (error, input, operation) => {
      if (operation && !operation.active) return;
      if (typeof input === "boolean")
        feedback?.onError?.(error, optimisticFailureAction(error, "sync_bgg"));
      await operation?.reject(error);
    },
  });
  const unlink = useMutation({
    mutationKey: key,
    mutationFn: () => request("DELETE"),
    onMutate: async () => {
      const operation = await begin(true);
      if (operation.modified) feedback?.onOptimisticUpdate?.("disconnect_bgg");
      return operation;
    },
    onError: async (error, _variables, operation) => {
      if (operation && !operation.active) return;
      feedback?.onError?.(error, optimisticFailureAction(error, "disconnect_bgg"));
      await operation?.reject(error);
    },
    onSuccess: (data, _input, operation) => {
      if (!operation?.active) return;
      operation.commit(() => data);
      if (!operation.modified) feedback?.onSuccess?.("disconnect_bgg");
      void client.invalidateQueries({
        queryKey: ["bgg-picker", operation.resource[1], operation.resource[2]],
      });
    },
  });
  useEffect(() => {
    const pending = account.data?.pending;
    if (!enabled || !pending || pending.status !== "syncing" || sync.isPending || busy) return;
    const delay = Math.max(5000, (Date.parse(pending.nextAttemptAt ?? "") || 0) - Date.now());
    const timer = setTimeout(() => sync.mutate({ retry: false, silent: true }), delay);
    return () => clearTimeout(timer);
  }, [enabled, account.data, sync.isPending, sync.mutate, busy]);
  return { account, link, sync, unlink, busy };
}
