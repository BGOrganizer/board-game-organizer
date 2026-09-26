import type { MatchVoteCounts } from "@board-game-organizer/schemas";
import { Text } from "heroui-native/text";
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
      <Text className="text-xs text-muted">✓ {counts.yes}</Text>
      <Text className="text-xs text-muted">× {counts.no}</Text>
      <Text className="text-xs text-muted">~ {counts.ifNeeded}</Text>
      <Text className="text-xs text-muted">? {counts.notChosen}</Text>
    </View>
  );
}

export function VoteLegend() {
  const t = useT();
  return (
    <Text className="text-xs text-muted">
      {`✓ ${t("Yes")} · × ${t("No")} · ~ ${t("If needed")} · ? ${t("Not chosen")}`}
    </Text>
  );
}
