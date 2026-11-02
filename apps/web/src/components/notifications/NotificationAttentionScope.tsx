"use client";
import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  NotificationAttentionProvider,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect, useRef } from "react";

export function NotificationAttentionScope({
  options,
  targets,
  readOnOpen,
  children,
}: {
  options: CommunityApiOptions;
  targets: readonly NotificationAttentionTarget[];
  readOnOpen?: NotificationAttentionTarget;
  children: ReactNode;
}) {
  return (
    <NotificationAttentionProvider options={options} targets={targets}>
      {children}
      <AttentionState
        target={readOnOpen}
        owner={JSON.stringify([options.apiUrl, options.userId])}
      />
    </NotificationAttentionProvider>
  );
}
function AttentionState({
  target,
  owner,
}: {
  target?: NotificationAttentionTarget;
  owner: string;
}) {
  const attention = useNotificationAttentionContext(),
    { t } = useLingui();
  const current = useRef({ attention, target });
  current.current = { attention, target };
  const kind = target?.kind,
    id = target?.id,
    ready = attention?.ready;
  useEffect(() => {
    const { attention, target } = current.current;
    if (ready && target && attention?.owner === owner && target.kind === kind && target.id === id)
      attention.read(target);
  }, [owner, kind, id, ready]);
  return attention?.error ? (
    <div role="alert">
      <p className="text-danger">{t`Could not load notifications`}</p>
      <Button variant="outline" onPress={() => void attention.refetch()}>{t`Try again`}</Button>
    </div>
  ) : null;
}
