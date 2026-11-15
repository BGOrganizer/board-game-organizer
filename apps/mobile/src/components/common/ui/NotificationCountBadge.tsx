import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function NotificationCountBadge({
  count,
  corner = false,
  counted = false,
}: {
  count?: number;
  corner?: boolean;
  counted?: boolean;
}) {
  const t = useT();
  if (!count) return null;
  return (
    <View
      accessible
      accessibilityLabel={counted ? `${t("Notifications")}: ${count}` : t("Needs attention")}
      pointerEvents="none"
      className="bg-danger"
      style={{
        position: corner ? "absolute" : "relative",
        top: corner ? (counted ? -8 : -4) : undefined,
        right: corner ? (counted ? -8 : -4) : undefined,
        zIndex: 2,
        minWidth: counted ? 16 : 8,
        height: counted ? 16 : 8,
        borderRadius: counted ? 8 : 4,
        paddingHorizontal: counted ? 3 : 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {counted ? (
        <Typography
          className="text-danger-foreground"
          style={{ fontSize: 9, fontWeight: "700", lineHeight: 11 }}
        >
          {count > 99 ? "99+" : String(count)}
        </Typography>
      ) : null}
    </View>
  );
}
