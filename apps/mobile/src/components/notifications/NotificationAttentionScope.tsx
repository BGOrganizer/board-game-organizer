import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  NotificationAttentionProvider,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { useFocusEffect } from "expo-router";
import { Button } from "heroui-native/button";
import { Typography } from "heroui-native/text";
import { type ReactNode, useCallback, useRef } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

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
    t = useT();
  const current = useRef({ attention, target });
  current.current = { attention, target };
  const kind = target?.kind,
    id = target?.id;
  useFocusEffect(
    useCallback(() => {
      const { attention, target } = current.current;
      if (target && attention?.owner === owner && target.kind === kind && target.id === id)
        attention.read(target);
    }, [owner, kind, id]),
  );
  return attention?.error ? (
    <View accessibilityRole="alert">
      <Typography className="text-danger">{t("Could not load notifications")}</Typography>
      <Button variant="secondary" onPress={() => void attention.refetch()}>
        <Button.Label>{t("Try again")}</Button.Label>
      </Button>
    </View>
  ) : null;
}
