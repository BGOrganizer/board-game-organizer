import type { MatchVoteCounts } from "@board-game-organizer/schemas";

import { Typography } from "heroui-native/text";

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
      <Typography className="text-xs text-muted">- {counts.notChosen}</Typography>
    </View>
  );
}
