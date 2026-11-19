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
    {
      value: "PUBLIC" as const,
      label: t("Public"),
      icon: Globe,
      color: publicAllowed ? accent : muted,
    },
  ];
  return (
    <View style={{ gap: 8 }}>
      <SearchHelpLabel
        label={t("Event visibility")}
        helpTitle={t("Field help")}
        help={t(
          "Public events are visible to everyone and can be joined without group membership. Select an approved public group to enable this option.",
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
              className={
                choice.value === "PUBLIC" && !publicAllowed
                  ? "border-separator"
                  : value === choice.value
                    ? "border-accent"
                    : "border-transparent"
              }
              style={{
                width: "100%",
                alignSelf: "stretch",
                minHeight: 112,
                padding: 12,
                borderWidth: 2,
                borderStyle: choice.value === "PUBLIC" && !publicAllowed ? "dashed" : "solid",
              }}
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
                <Typography
                  className={
                    choice.value === "PUBLIC" && !publicAllowed
                      ? "font-semibold text-muted"
                      : "font-semibold text-foreground"
                  }
                >
                  {choice.label}
                </Typography>
              </Card.Body>
            </Card>
          </RadioGroup.Item>
        ))}
      </RadioGroup>
      {locked || !publicAllowed ? (
        <Typography className="text-sm text-muted">
          {locked
            ? t("Event visibility cannot be changed after creation.")
            : t("Select an approved public group to enable public events.")}
        </Typography>
      ) : null}
    </View>
  );
}
