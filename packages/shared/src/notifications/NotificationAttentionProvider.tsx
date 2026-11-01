"use client";

import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { useScopedMutations } from "../common/hooks/useScopedMutations";
import type { CommunityApiOptions } from "../community/communityApi";
import {
  useNotificationAttention,
  useReadNotificationAttention,
} from "./hooks/useNotificationAttention";
import { attentionKey } from "./notificationAttention";

type AttentionContext = ReturnType<typeof useNotificationAttention> &
  Pick<ReturnType<typeof useReadNotificationAttention>, "read"> & { owner: string };
const Context = createContext<AttentionContext | null>(null);
/** One batched Query workflow for visible cards. Context derives Query data; it does not mirror it. */
export function NotificationAttentionProvider({
  options,
  targets,
  children,
}: {
  options: CommunityApiOptions;
  targets: readonly NotificationAttentionTarget[];
  children: ReactNode;
}) {
  const parent = useContext(Context);
  const client = useQueryClient();
  const attention = useNotificationAttention(options, targets);
  const { read } = useReadNotificationAttention(options);
  const owner = JSON.stringify([options.apiUrl, options.userId]);
  const failed = useScopedMutations({
    mutationKey: ["notifications", options.apiUrl, options.userId, "attention-read"],
    status: "error",
  })
    .reverse()
    .find((item) => {
      const target = (item.state.variables as { target?: NotificationAttentionTarget } | undefined)
        ?.target;
      const context = item.state.context as
        | { operation?: { signal: AbortSignal; uncertain: boolean } }
        | undefined;
      return (
        target &&
        !context?.operation?.signal.aborted &&
        targets.some((value) => attentionKey(value) === attentionKey(target)) &&
        (context?.operation?.uncertain || (attention.get(target)?.direct ?? 0) > 0)
      );
    });
  const refetch = async () => {
    const results = await attention.refetch();
    // Explicit retry only. An uncertain operation remains busy and permits reads,
    // never another PATCH; a session replacement removes the original mutation.
    if (
      failed &&
      results.every((result) => !result.isError) &&
      client.getMutationCache().getAll().includes(failed)
    ) {
      const target = (failed.state.variables as { target: NotificationAttentionTarget }).target;
      read(target);
    }
    return results;
  };
  return (
    <Context.Provider
      value={{
        ...attention,
        error: attention.error ?? failed?.state.error ?? undefined,
        refetch,
        read,
        owner,
        get: (target) =>
          attention.get(target) ?? (parent?.owner === owner ? parent.get(target) : undefined),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useNotificationAttentionContext() {
  return useContext(Context);
}
