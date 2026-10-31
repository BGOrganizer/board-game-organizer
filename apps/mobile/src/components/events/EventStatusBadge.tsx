import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { CalendarCheck, Clock3, Flag } from "lucide-react-native";
import { useT } from "@/lib/i18n";

export function EventStatusBadge({ status }: { status: PlannedEventResponse["status"] }) {
  const t = useT();
  const [warning, success, muted] = useThemeColor(["warning", "success", "muted"]);
  const planning = status === "PLANNING";
  const confirmed = status === "CONFIRMED";
  const Icon = planning ? Clock3 : confirmed ? CalendarCheck : Flag;
  return (
    <Chip size="sm" variant="soft" color={planning ? "warning" : confirmed ? "success" : "default"}>
      <Icon size={14} color={planning ? warning : confirmed ? success : muted} accessible={false} />
      <Chip.Label>
        {planning ? t("Planning") : confirmed ? t("Confirmed") : t("Terminated")}
      </Chip.Label>
    </Chip>
  );
}
