import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Armchair, LayoutGrid, LockKeyhole, Trophy, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { useT } from "@/lib/i18n";

export function EventTableHeading({
  name,
  ratingsEnabled,
}: {
  name: string;
  ratingsEnabled: boolean;
}) {
  const t = useT();
  const foreground = useThemeColor("foreground");
  const accent = useThemeColor("accent-foreground");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <LayoutGrid size={18} color={foreground} />
          <Typography className="text-sm font-semibold text-foreground" style={{ flexShrink: 1 }}>
            {t("Table name")}
          </Typography>
          <HelpPopover label={t("Table name help")} title={t("Table name")}>
            <IconLegend
              items={[
                { icon: UsersRound, description: t("Confirmed players.") },
                { icon: Armchair, description: t("Maximum seats here; free places in Seats.") },
                {
                  icon: LockKeyhole,
                  description: t("Reserved places, including pending requests."),
                },
              ]}
            />
          </HelpPopover>
        </View>
        <Typography accessibilityRole="header" className="text-xl font-semibold text-foreground">
          {name}
        </Typography>
      </View>
      {ratingsEnabled ? (
        <Chip
          color="accent"
          variant="primary"
          size="sm"
          accessibilityLabel={t("Global ratings enabled")}
        >
          <Trophy size={16} color={accent} />
          <Chip.Label>{t("Rating")}</Chip.Label>
        </Chip>
      ) : null}
    </View>
  );
}
