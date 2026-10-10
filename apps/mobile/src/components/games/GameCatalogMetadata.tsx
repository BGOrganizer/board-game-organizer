import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { ListOrdered, Star } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

type Props = {
  year?: number | null;
  average?: number | null;
  rank?: number | null;
};

export function GameCatalogMetadata({ year, average, rank }: Props) {
  const t = useT();
  const { i18n } = useLingui();
  const [warning, muted] = useThemeColor(["warning", "muted"]);
  if (!year && average == null && rank == null) return null;
  const rating = average?.toLocaleString(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const position = rank === 0 ? t("Unranked") : rank?.toLocaleString(i18n.locale);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      {year ? <Typography className="text-xs text-muted">{year}</Typography> : null}
      {rating != null && (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${t("Average")}: ${rating}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <Star size={12} color={warning} fill={warning} />
          <Typography className="text-xs text-muted">{rating}</Typography>
        </View>
      )}
      {position != null && (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${t("Rank")}: ${position}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <ListOrdered size={12} color={muted} />
          <Typography className="text-xs text-muted">{position}</Typography>
        </View>
      )}
    </View>
  );
}
