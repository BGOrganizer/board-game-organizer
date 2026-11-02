import { View } from "react-native";
import { useT } from "@/lib/i18n";

/** Presentation only. Reading/consent belongs to the source workflow, never this marker. */
export function NotificationUnreadDot({ active }: { active: boolean }) {
  const t = useT();
  if (!active) return null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("Unread updates")}
      pointerEvents="none"
      className="bg-danger"
      style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0 }}
    />
  );
}
