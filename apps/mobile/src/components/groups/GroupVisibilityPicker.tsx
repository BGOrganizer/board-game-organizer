import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Radio } from "heroui-native/radio";
import { RadioGroup } from "heroui-native/radio-group";
import { Typography } from "heroui-native/text";
import { Globe, LockKeyhole } from "lucide-react-native";
import { View } from "react-native";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useT } from "@/lib/i18n";

export function GroupVisibilityPicker({
  value,
  disabled,
  onChange,
}: {
  value: "PRIVATE" | "PUBLIC";
  disabled: boolean;
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
        label={t("Group visibility")}
        helpTitle={t("Field help")}
        help={t(
          "Private groups are invitation-only. Public groups are searchable and visible to all registered users after approval.",
        )}
      />
      <RadioGroup
        accessibilityLabel={t("Group visibility")}
        value={value}
        isDisabled={disabled}
        onValueChange={(next) => onChange(next as "PRIVATE" | "PUBLIC")}
        style={{ flexDirection: "row", gap: 12 }}
      >
        {choices.map((choice) => (
          <RadioGroup.Item
            key={choice.value}
            value={choice.value}
            accessibilityLabel={choice.label}
            testID={choice.value === "PRIVATE" ? "group-private-radio" : "group-public-radio"}
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
    </View>
  );
}
