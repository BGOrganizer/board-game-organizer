import type { BggAccountResponse } from "@board-game-organizer/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiHeaders, withProtectionBypass } from "../api";
import type { MutationFeedback } from "../mutationFeedback";

const empty: BggAccountResponse = { active: null, pending: null };

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
  const key = ["bgg-account", apiUrl, userId] as const;
  const request = async (method = "GET", path = "account", input?: unknown) => {
    const token = await getToken();
    if (!token) throw new Error("No session token");
    const response = await fetch(
      withProtectionBypass(`${apiUrl}/api/bgg/${path}`, protectionBypass),
      {
        method,
        headers: apiHeaders(token),
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      },
    );
    if (!response.ok) {
      const code = response.status;
      throw new Error(code === 404 ? "BGG user not found" : `HTTP ${code}`);
    }
    return (await response.json()) as BggAccountResponse;
  };
  const account = useQuery({
    queryKey: key,
    queryFn: () => request(),
    enabled: enabled && Boolean(userId),
    refetchInterval: (query) => (query.state.data?.pending?.status === "syncing" ? 5000 : false),
  });
  const link = useMutation({
    mutationFn: (username: string) => request("POST", "account", { username }),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      feedback?.onOptimisticUpdate?.("sync_bgg");
    },
    onError: (error) => feedback?.onError?.(error, "sync_bgg"),
  });
  const sync = useMutation({
    mutationFn: (retry: boolean) => request("POST", `account/sync${retry ? "?retry=true" : ""}`),
    onMutate: (retry) => {
      if (retry) feedback?.onOptimisticUpdate?.("sync_bgg");
    },
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
