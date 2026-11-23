import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Check, Minus, X } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function EventVoteLegendContent({
  scope,
  multipleCategories = false,
  singleOption,
}: {
  scope: "event" | "table";
  multipleCategories?: boolean;
  singleOption?: "only" | "mixed";
}) {
  const t = useT(),
    [yes, needed, no] = useThemeColor(["success", "warning", "danger"]);
  return (
    <View style={{ gap: 10 }}>
      {[
        { Icon: Check, label: t("Yes"), color: yes },
        { Icon: Minus, label: t("If needed"), color: needed },
        { Icon: X, label: t("No"), color: no },
      ].map(({ Icon, label, color }) => (
        <View key={label} style={{ flexDirection: "row", gap: 8 }}>
          <Icon size={18} color={color} />
          <Typography className="text-foreground">{label}</Typography>
        </View>
      ))}
      <Typography className="text-muted">
        {scope === "table"
          ? t("You can vote only if you are an accepted participant at this table.")
          : t(
              "You can vote only if you are an accepted participant in at least one table in the event.",
            )}
      </Typography>
      {singleOption ? (
        <Typography className="text-muted">
          {t(
            "Vote again on the changed option. A No keeps you registered and blocks agreement if you have a seat.",
          )}
        </Typography>
      ) : null}
      {singleOption !== "only" ? (
        <Typography className="text-muted">
          {singleOption === "mixed"
            ? t("For a category with several options, choose at least one Yes or If needed.")
            : multipleCategories
              ? t('Choose at least one "Yes" or "If needed" option in each category.')
              : t('Choose at least one "Yes" or "If needed" option in this category.')}
        </Typography>
      ) : null}
    </View>
  );
}
