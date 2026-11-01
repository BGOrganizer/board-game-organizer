import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function NotificationCountBadge({
  count,
  corner = false,
}: {
  count?: number;
  corner?: boolean;
}) {
  const t = useT();
  if (!count) return null;
  return (
    <View
      accessible
      accessibilityLabel={`${t("Notifications")}: ${count}`}
      pointerEvents="none"
      className="bg-danger"
      style={{
        position: corner ? "absolute" : "relative",
        top: corner ? -8 : undefined,
        right: corner ? -8 : undefined,
        zIndex: 2,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        paddingHorizontal: 3,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography
        className="text-danger-foreground"
        style={{ fontSize: 9, fontWeight: "700", lineHeight: 11 }}
      >
        {count > 99 ? "99+" : String(count)}
      </Typography>
    </View>
  );
}
