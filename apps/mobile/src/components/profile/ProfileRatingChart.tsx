import type { ProfileRatingPoint } from "@board-game-organizer/schemas";
import { profileRatingPath } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { useT } from "@/lib/i18n";
export function ProfileRatingChart({ points }: { points: ProfileRatingPoint[] }) {
  const t = useT(),
    accent = useThemeColor("accent");
  if (points.length < 2)
    return (
      <Typography className="text-sm text-muted">
        {t("Not enough ranked games for a chart")}
      </Typography>
    );
  return (
    <View style={{ gap: 8 }}>
      <Svg
        width="100%"
        height={160}
        viewBox="0 0 300 160"
        accessible
        accessibilityLabel={t("OpenSkill rating history")}
      >
        <Polyline
          points={profileRatingPath(points, 300, 160)}
          fill="none"
          stroke={accent}
          strokeWidth={2}
        />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Typography className="text-xs text-muted">{points[0].ordinal}</Typography>
        <Typography className="text-xs text-muted">{t("Classified games")}</Typography>
        <Typography className="text-xs text-muted">{points[points.length - 1].ordinal}</Typography>
      </View>
    </View>
  );
}
