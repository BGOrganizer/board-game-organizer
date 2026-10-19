import { useLingui } from "@lingui/react";

import { Typography } from "heroui-native/text";
import { ArrowDown, ArrowUp, ChartNoAxesCombined, Clock3, Equal } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function GameRating({
  rating,
  showDelta = false,
}: {
  rating?: { score: number; provisional: boolean; delta?: number };
  showDelta?: boolean;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const delta = Number((rating?.delta ?? 0).toFixed(2)) || 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={rating?.provisional ? t("Provisional game rating") : t("Game rating")}
        style={{ width: 16, height: 16 }}
      >
        <ChartNoAxesCombined size={14} color="#737373" />
        {rating?.provisional && (
          <View style={{ position: "absolute", right: -3, bottom: -3 }}>
            <Clock3 size={9} color="#f5a524" />
          </View>
        )}
      </View>
      <Typography className="text-xs text-muted">
        {rating ? format.format(rating.score) : t("Not rated")}
      </Typography>
      {showDelta && (
        <View
          accessible
          accessibilityLabel={`${delta > 0 ? t("Rating increased") : delta < 0 ? t("Rating decreased") : t("Rating unchanged")}: ${delta > 0 ? "+" : ""}${format.format(delta)}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          {delta > 0 ? (
            <ArrowUp size={12} color="#17c964" />
          ) : delta < 0 ? (
            <ArrowDown size={12} color="#f31260" />
          ) : (
            <Equal size={12} color="#f5a524" />
          )}
          <Typography
            className={`text-xs ${delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-warning"}`}
          >
            {delta > 0 ? "+" : ""}
            {format.format(delta)}
          </Typography>
        </View>
      )}
    </View>
  );
}
