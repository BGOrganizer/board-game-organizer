"use client";

import type { BggAccountResponse } from "@board-game-organizer/schemas";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiHeaders, withProtectionBypass } from "../../common/api";
import type { MutationFeedback } from "../../common/mutationFeedback";

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
  if (!token) throw new Error("No session token");
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
    throw new Error(response.status === 404 ? "BGG user not found" : `HTTP ${response.status}`);
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
  const request = (method = "GET", path = "account", input?: unknown) =>
    requestBggAccount(options, method, path, input);
  const account = useQuery({
    ...query,
    enabled: enabled && Boolean(userId),
    refetchInterval: (query) => (query.state.data?.pending?.status === "syncing" ? 5000 : false),
  });
  const link = useMutation({
    mutationFn: (username: string) => request("POST", "account", { username }),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const sync = useMutation({
    mutationFn: (retry: boolean) => request("POST", `account/sync${retry ? "?retry=true" : ""}`),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      if (data.active) void client.invalidateQueries({ queryKey: ["bgg-picker"] });
    },
  });
  const unlink = useMutation({
    mutationFn: () => request("DELETE"),
    onMutate: () => {
      const previous = client.getQueryData<BggAccountResponse>(key);
      if (previous) client.setQueryData(key, empty);
      feedback?.onOptimisticUpdate?.("disconnect_bgg");
      return previous;
    },
    onError: (error, _variables, previous) => {
      if (previous) client.setQueryData(key, previous);
      feedback?.onError?.(error, "disconnect_bgg");
    },
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: ["bgg-picker"] });
    },
  });
  useEffect(() => {
    const pending = account.data?.pending;
    if (!enabled || !pending || pending.status !== "syncing" || sync.isPending) return;
    const delay = Math.max(5000, (Date.parse(pending.nextAttemptAt ?? "") || 0) - Date.now());
    const timer = setTimeout(() => sync.mutate(false), delay);
    return () => clearTimeout(timer);
  }, [enabled, account.data, sync.isPending, sync.mutate]);
  return { account, link, sync, unlink };
}
