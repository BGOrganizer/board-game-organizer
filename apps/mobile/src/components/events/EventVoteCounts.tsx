import type { EventVoteCounts as Counts } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, HelpCircle, Minus, X } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
export function EventVoteCounts({ counts, label }: { counts?: Counts; label: string }) {
  const t = useT(),
    { i18n } = useLingui();
  const [success, warning, danger, unknown] = useThemeColor([
    "success",
    "warning",
    "danger",
    "foreground",
  ]);
  if (!counts) return <Skeleton style={{ width: 112, height: 16, borderRadius: 4 }} />;
  const number = new Intl.NumberFormat(i18n.locale);
  return (
    <View
      accessibilityLabel={`${t("Votes")}: ${label}`}
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}
    >
      {[
        { key: "YES", text: t("Yes"), Icon: Check, color: success },
        { key: "IF_NEEDED", text: t("If needed"), Icon: Minus, color: warning },
        { key: "NO", text: t("No"), Icon: X, color: danger },
        { key: "UNKNOWN", text: t("Unknown"), Icon: HelpCircle, color: unknown },
      ].map(({ key, text, Icon, color }) => (
        <View
          key={key}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${text}: ${number.format(counts[key as keyof Counts])}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          <Icon size={12} color={color} />
          <Typography className="text-xs text-muted">
            {number.format(counts[key as keyof Counts])}
          </Typography>
        </View>
      ))}
    </View>
  );
}
