import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, Minus, X } from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
export function EventVoteLegend({
  label,
  scope = "event",
}: {
  label: string;
  scope?: "event" | "table";
}) {
  const t = useT(),
    [yes, needed, no] = useThemeColor(["success", "warning", "danger"]);
  return (
    <HelpPopover label={`${label}: ${t("Voting legend")}`} title={label} width={300}>
      <View style={{ gap: 10 }}>
        {[
          { Icon: Check, label: t("Yes"), color: yes },
          { Icon: Minus, label: t("If needed"), color: needed },
          { Icon: X, label: t("No"), color: no },
        ].map(({ Icon, label, color }) => (
          <View key={label} style={{ flexDirection: "row", gap: 8 }}>
            <Icon size={18} color={color} />
            <Typography className="text-foreground">{label}</Typography>
          </View>
        ))}
        <Typography className="text-muted">
          {scope === "table"
            ? t("You can vote only if you are an accepted participant at this table.")
            : t(
                "You can vote only if you are an accepted participant in at least one table in the event.",
              )}
        </Typography>
        <Typography className="text-muted">
          {t('Choose at least one "Yes" or "If needed" option in this category.')}
        </Typography>
      </View>
    </HelpPopover>
  );
}
