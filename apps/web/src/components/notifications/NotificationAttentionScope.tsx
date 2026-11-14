"use client";
import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  NotificationAttentionProvider,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

/** Source attention and observable errors only; rendering/navigation never reads changes. */
export function NotificationAttentionScope({
  options,
  targets,
  children,
}: {
  options: CommunityApiOptions;
  targets: readonly NotificationAttentionTarget[];
  children: ReactNode;
}) {
  return (
    <NotificationAttentionProvider options={options} targets={targets}>
      {children}
      <AttentionState />
    </NotificationAttentionProvider>
  );
}
function AttentionState() {
  const attention = useNotificationAttentionContext(),
    { t } = useLingui();
  return attention?.error ? (
    <div role="alert">
      <p className="text-danger">{t`Could not load notifications`}</p>
      <Button variant="outline" onPress={() => void attention.refetch()}>{t`Try again`}</Button>
    </div>
  ) : null;
}
