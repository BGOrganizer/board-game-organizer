import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Radio } from "heroui-native/radio";
import { RadioGroup } from "heroui-native/radio-group";
import { Typography } from "heroui-native/text";
import { Globe, LockKeyhole } from "lucide-react-native";
import { View } from "react-native";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useT } from "@/lib/i18n";

export function EventVisibilityPicker({
  value,
  publicAllowed,
  locked,
  busy,
  onChange,
}: {
  value: "PRIVATE" | "PUBLIC";
  publicAllowed: boolean;
  locked: boolean;
  busy: boolean;
  onChange: (value: "PRIVATE" | "PUBLIC") => void;
}) {
  const t = useT();
  const [muted, accent] = useThemeColor(["muted", "accent"]);
  const choices = [
    { value: "PRIVATE" as const, label: t("Private"), icon: LockKeyhole, color: muted },
    { value: "PUBLIC" as const, label: t("Public"), icon: Globe, color: accent },
  ];
  return (
    <View style={{ gap: 8 }}>
      <SearchHelpLabel
        label={t("Event visibility")}
        helpTitle={t("Field help")}
        help={t(
          "Public events require an approved public group. Private events remain private when you change groups.",
        )}
      />
      <RadioGroup
        accessibilityLabel={t("Event visibility")}
        value={value}
        isDisabled={busy || locked}
        style={{ flexDirection: "row", gap: 12 }}
        onValueChange={(next) => {
          if (!locked && (next === "PRIVATE" || publicAllowed))
            onChange(next as "PRIVATE" | "PUBLIC");
        }}
      >
        {choices.map((choice) => (
          <RadioGroup.Item
            key={choice.value}
            value={choice.value}
            accessibilityLabel={choice.label}
            testID={choice.value === "PRIVATE" ? "event-private-radio" : "event-public-radio"}
            isDisabled={choice.value === "PUBLIC" && !publicAllowed}
            style={{ flex: 1, minWidth: 0 }}
          >
            <Card
              pointerEvents="none"
              variant={value === choice.value ? "secondary" : "default"}
              className={value === choice.value ? "border-accent" : "border-transparent"}
              style={{ width: "100%", minHeight: 112, padding: 12, borderWidth: 2 }}
            >
              <Card.Body style={{ gap: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <View
                    className="bg-default"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <choice.icon size={20} color={choice.color} accessible={false} />
                  </View>
                  <Radio
                    accessible={false}
                    pointerEvents="none"
                    importantForAccessibility="no-hide-descendants"
                  />
                </View>
                <Typography className="font-semibold text-foreground">{choice.label}</Typography>
              </Card.Body>
            </Card>
          </RadioGroup.Item>
        ))}
      </RadioGroup>
      <Typography className="text-sm text-muted">
        {locked
          ? t("Event visibility cannot be changed after creation.")
          : !publicAllowed
            ? t("Public events require an approved public group.")
            : t(
                "Private events are visible only to accepted group members. Public-group scheduling rules still apply.",
              )}
      </Typography>
    </View>
  );
}
