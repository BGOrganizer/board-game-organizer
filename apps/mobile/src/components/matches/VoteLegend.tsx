import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

export function VoteLegend() {
  const t = useT();
  return (
    <HelpPopover
      label={t("Vote count legend")}
      title={t("Vote count legend")}
      width={190}
      align="end"
    >
      <View style={{ gap: 6 }}>
        <Typography className="text-sm text-success">✓ {t("Yes")}</Typography>
        <Typography className="text-sm text-danger">× {t("No")}</Typography>
        <Typography className="text-sm text-warning">~ {t("If needed")}</Typography>
        <Typography className="text-sm text-muted">- {t("Not chosen")}</Typography>
      </View>
    </HelpPopover>
  );
}
