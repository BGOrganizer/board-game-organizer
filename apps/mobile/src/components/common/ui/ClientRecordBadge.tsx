import type { ClientRecordState } from "@board-game-organizer/shared";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { CircleAlert, Clock3, Save } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function useClientRecordStatus(phase?: ClientRecordState["phase"]) {
  const t = useT();
  return !phase
    ? ""
    : phase === "failed"
      ? t("Not saved. Edit draft")
      : phase === "verifying"
        ? t("Checking saved changes")
        : t("Saving");
}

export function ClientRecordBadge({
  phase,
  iconSize = 14,
  iconOnly = false,
}: {
  phase?: ClientRecordState["phase"];
  iconSize?: number;
  iconOnly?: boolean;
}) {
  const t = useT();
  const label =
      phase === "failed" ? t("Not saved") : phase === "verifying" ? t("Verifying") : t("Saving"),
    failed = phase === "failed",
    Icon = failed ? CircleAlert : phase === "verifying" ? Clock3 : Save;
  const color = useThemeColor(failed ? "danger-soft-foreground" : "warning-soft-foreground");
  const badge = phase ? (
    <Chip
      size="sm"
      variant="soft"
      color={failed ? "danger" : "warning"}
      accessible={iconOnly || undefined}
      accessibilityLabel={iconOnly ? label : undefined}
      style={
        iconOnly
          ? { width: 24, height: 24, paddingHorizontal: 0, justifyContent: "center" }
          : undefined
      }
    >
      <Icon size={iconSize} color={color} accessible={false} />
      {iconOnly ? null : <Chip.Label>{label}</Chip.Label>}
    </Chip>
  ) : null;
  // Reserve the same title space before and after saving; long names must not reflow.
  return iconOnly ? (
    <View style={{ width: 24, height: 24, flexShrink: 0, alignSelf: "flex-start" }}>{badge}</View>
  ) : (
    badge
  );
}
