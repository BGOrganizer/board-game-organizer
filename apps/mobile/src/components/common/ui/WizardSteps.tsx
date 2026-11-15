import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function WizardSteps({ current, count }: { current: number; count: number }) {
  const t = useT();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t("Steps")}
      accessibilityValue={{ min: 1, max: count, now: current }}
      style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 }}
    >
      {Array.from({ length: count }, (_, i) => i + 1).map((step) => (
        <View
          key={step}
          className={current === step ? "bg-accent" : "bg-surface-secondary"}
          style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}
        >
          <Typography
            className={current === step ? "text-accent-foreground" : "text-muted"}
            style={{ fontSize: 13 }}
          >
            {step}
          </Typography>
        </View>
      ))}
    </View>
  );
}
