import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { CircleCheck, CircleX, Clock3 } from "lucide-react-native";
import { useT } from "@/lib/i18n";

export function OrganizationStatusBadge({ organization }: { organization: OrganizationResponse }) {
  const t = useT();
  const rejected = organization.reviewStatus === "REJECTED",
    pending = organization.status !== "CREATED" || organization.reviewStatus === "PENDING";
  const color = useThemeColor(rejected ? "danger" : pending ? "warning" : "success");
  const Icon = rejected ? CircleX : pending ? Clock3 : CircleCheck;
  return (
    <Chip
      size="sm"
      color={rejected ? "danger" : pending ? "warning" : "success"}
      variant="soft"
      style={{
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Icon size={14} color={color} accessible={false} />
      <Chip.Label numberOfLines={1} style={{ flexShrink: 0, paddingEnd: 2 }}>
        {rejected ? t("Changes rejected") : pending ? t("Awaiting review") : t("Approved")}
      </Chip.Label>
    </Chip>
  );
}
