import { Chip } from "heroui-native/chip";
import { Medal, Trophy } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { IconBadge } from "./IconBadge";

export function RankPositionBadge({ rank }: { rank: number | null }) {
  const t = useT();
  const position = rank === null ? t("ND") : `#${rank}`;
  const label = `${t("Position")}: ${position}`;

  if (rank === 1) return <IconBadge icon={Trophy} color="warning" label={label} />;
  if (rank === 2) return <IconBadge icon={Medal} color="accent" label={label} />;
  if (rank === 3) return <IconBadge icon={Medal} label={label} />;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} pointerEvents="none">
      <Chip
        size="sm"
        color="default"
        variant="secondary"
        disabled
        accessible={false}
        style={{
          minHeight: 22,
          minWidth: 22,
          paddingHorizontal: 4,
          paddingVertical: 0,
          justifyContent: "center",
        }}
      >
        <Chip.Label>{position}</Chip.Label>
      </Chip>
    </View>
  );
}
