import type { MatchVoteCounts } from "@board-game-organizer/schemas";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Typography } from "heroui-native/text";
import { CircleHelp } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function VoteCounts({ counts }: { counts: MatchVoteCounts }) {
  const t = useT();
  return (
    <View
      accessible
      accessibilityLabel={`${t("Yes")}: ${counts.yes}, ${t("No")}: ${counts.no}, ${t("If needed")}: ${counts.ifNeeded}, ${t("Not chosen")}: ${counts.notChosen}`}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
    >
      <Typography className="text-xs text-success">✓ {counts.yes}</Typography>
      <Typography className="text-xs text-danger">× {counts.no}</Typography>
      <Typography className="text-xs text-warning">~ {counts.ifNeeded}</Typography>
      <Typography className="text-xs text-muted">? {counts.notChosen}</Typography>
    </View>
  );
}

export function VoteLegend() {
  const t = useT();
  const muted = useThemeColor("muted");
  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          accessibilityLabel={t("Vote count legend")}
          style={{ minHeight: 44, minWidth: 44 }}
        >
          <CircleHelp size={18} color={muted} />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" placement="bottom" align="end" width={190}>
          <Popover.Title>{t("Vote count legend")}</Popover.Title>
          <View style={{ gap: 6 }}>
            <Typography className="text-sm text-success">✓ {t("Yes")}</Typography>
            <Typography className="text-sm text-danger">× {t("No")}</Typography>
            <Typography className="text-sm text-warning">~ {t("If needed")}</Typography>
            <Typography className="text-sm text-muted">? {t("Not chosen")}</Typography>
          </View>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
