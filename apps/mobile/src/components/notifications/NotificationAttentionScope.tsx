import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  NotificationAttentionProvider,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

/** Source attention and observable errors only; navigation/focus never acknowledges changes. */
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
    t = useT();
  return attention?.error ? (
    <View accessibilityRole="alert">
      <Typography className="text-danger">{t("Could not load notifications")}</Typography>
      <Button variant="secondary" onPress={() => void attention.refetch()}>
        <Button.Label>{t("Try again")}</Button.Label>
      </Button>
    </View>
  ) : null;
}
