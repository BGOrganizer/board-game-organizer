import { Typography } from "heroui-native/text";
import {
  Clock3,
  ListOrdered,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
} from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { useT } from "@/lib/i18n";

export function TableListHeading() {
  const t = useT();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {t("Table list")}
      </Typography>
      <HelpPopover label={t("Table legend")} title={t("Table legend")}>
        <IconLegend
          items={[
            { icon: UserRoundMinus, description: t("Minimum players") },
            { icon: UserRoundPlus, description: t("Maximum players") },
            {
              icon: UserRoundCheck,
              description: t("Accepted players, including the waiting list."),
            },
            { icon: ListOrdered, description: t("Waiting list") },
            {
              icon: Clock3,
              description: t("Pending players, including reserved waiting-list places."),
            },
          ]}
        />
      </HelpPopover>
    </View>
  );
}
