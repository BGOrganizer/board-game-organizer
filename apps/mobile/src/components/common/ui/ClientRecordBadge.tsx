import type { ClientRecordState } from "@board-game-organizer/shared";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { CircleAlert, Clock3 } from "lucide-react-native";
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

export function ClientRecordBadge({ phase }: { phase: ClientRecordState["phase"] }) {
  const t = useT();
  const label =
      phase === "failed" ? t("Not saved") : phase === "verifying" ? t("Verifying") : t("Saving"),
    failed = phase === "failed",
    Icon = failed ? CircleAlert : Clock3;
  const color = useThemeColor(failed ? "danger" : "warning");
  return (
    <Chip size="sm" variant="soft" color={failed ? "danger" : "warning"}>
      <Icon size={14} color={color} accessible={false} />
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
