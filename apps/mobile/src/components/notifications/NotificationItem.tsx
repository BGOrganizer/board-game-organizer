import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { useLocalSearchParams } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Check } from "lucide-react-native";
import { type ReactNode, useContext, useRef } from "react";
import { View } from "react-native";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";
import { ScrollTargetContext } from "@/components/common/ui/ScrollTargetContext";
import { useT } from "@/lib/i18n";

export function NotificationItem({
  itemId,
  readOnly = false,
  children,
}: {
  itemId?: string;
  readOnly?: boolean;
  children: ReactNode;
}) {
  const t = useT(),
    attention = useNotificationAttentionContext(),
    scroll = useContext(ScrollTargetContext);
  const { attention: requested } = useLocalSearchParams<{ attention?: string }>();
  const ref = useRef<View>(null),
    positioned = useRef<string | null>(null);
  const foreground = useThemeColor("foreground");
  const target = itemId ? { kind: "item" as const, id: itemId } : undefined;
  const count = target ? attention?.get(target)?.count : undefined;
  if (!target) return <>{children}</>;
  return (
    <View
      ref={ref}
      style={{ width: "100%", flexDirection: "row", gap: 8, alignItems: "center" }}
      onLayout={() => {
        if (requested !== itemId || positioned.current === requested || !scroll?.current) return;
        ref.current?.measureLayout(scroll.current.getInnerViewNode(), (_x, y) => {
          positioned.current = target.id;
          scroll.current?.scrollTo({ y: Math.max(0, y - 16), animated: false });
        });
      }}
    >
      <NotificationCountBadge count={count} />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {readOnly && count ? (
        <Button
          isIconOnly
          size="sm"
          variant="secondary"
          accessibilityLabel={t("Mark as read")}
          style={{ minWidth: 44, minHeight: 44 }}
          onPress={() => attention?.read(target)}
        >
          <Check size={18} color={foreground} />
        </Button>
      ) : null}
    </View>
  );
}
