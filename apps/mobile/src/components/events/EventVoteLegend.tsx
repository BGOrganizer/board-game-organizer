import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, HelpCircle, Minus, X } from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";
export function EventVoteLegend() {
  const t = useT(),
    [yes, needed, no, unknown] = useThemeColor(["success", "warning", "danger", "muted"]);
  return (
    <HelpPopover label={t("Voting legend")} title={t("Voting legend")} width={300}>
      <View style={{ gap: 10 }}>
        {[
          { Icon: Check, label: t("Yes"), color: yes },
          { Icon: Minus, label: t("If needed"), color: needed },
          { Icon: X, label: t("No"), color: no },
          { Icon: HelpCircle, label: t("Unknown"), color: unknown },
        ].map(({ Icon, label, color }) => (
          <View key={label} style={{ flexDirection: "row", gap: 8 }}>
            <Icon size={18} color={color} />
            <Typography className="text-foreground">{label}</Typography>
          </View>
        ))}
        <Typography className="text-muted">
          {t(
            "Pending invitations reserve a place but do not vote or count toward agreement. Accepted waiting players may vote.",
          )}
        </Typography>
      </View>
    </HelpPopover>
  );
}
