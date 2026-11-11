import type { useEventRecordForm } from "@board-game-organizer/shared";
import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Radio } from "heroui-native/radio";
import { RadioGroup } from "heroui-native/radio-group";
import { Typography } from "heroui-native/text";
import { Hand, Sparkles, Trophy, Users } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useT } from "@/lib/i18n";
export function EventPlanningSettings({
  form,
  busy,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
}) {
  const t = useT();
  const accent = useThemeColor("accent");
  const { draft } = form;
  const [warnAssistance, setWarnAssistance] = useState(false);
  const chooseMode = (value: string) => {
    if (value === "ASSISTED" && draft.planningMode === "MANUAL") setWarnAssistance(true);
    else form.patch({ planningMode: value as "MANUAL" | "ASSISTED" });
  };
  const groups = [
    {
      value: draft.planningMode ?? "ASSISTED",
      name: t("Planning mode"),
      label: t("Mode"),
      help: t(
        "Manual: managers arrange the seats. Assisted: the app seeks agreement and arranges players automatically. Both apply to every table, protect locked seats and pending invitations, compact the queue after departures, and require manual confirmation.",
      ),
      change: chooseMode,
      options: [
        {
          value: "MANUAL",
          label: t("Manual"),
          icon: Hand,
        },
        {
          value: "ASSISTED",
          label: t("Assisted"),
          icon: Sparkles,
        },
      ],
    },
    {
      value: draft.playerPreference ?? "MORE_PLAYERS",
      name: t("Player count"),
      label: t("Preference"),
      help: t(
        "Players prioritizes the largest number of participants. BGG Best prioritizes the player count preferred by the BGG community and allows fewer seated players in Assisted mode. Manual mode never removes players automatically.",
      ),
      change: (value: string) =>
        form.patch({
          playerPreference: value as "MORE_PLAYERS" | "BEST",
          allowBestReduction: value === "BEST",
        }),
      options: [
        {
          value: "MORE_PLAYERS",
          label: t("Players"),
          icon: Users,
        },
        {
          value: "BEST",
          label: t("BGG Best"),
          icon: Trophy,
        },
      ],
    },
  ];
  return (
    <View style={{ gap: 12 }}>
      {groups.map((group) => (
        <View key={group.name} style={{ gap: 8 }}>
          <SearchHelpLabel label={group.label} helpTitle={t("Field help")} help={group.help} />
          <RadioGroup
            accessibilityLabel={group.name}
            value={group.value}
            isDisabled={busy}
            onValueChange={group.change}
            style={{ flexDirection: "row", gap: 12 }}
          >
            {group.options.map((option) => (
              <Card
                key={option.value}
                style={{ flex: 1, minWidth: 0, minHeight: 112, padding: 0, borderWidth: 2 }}
                className={group.value === option.value ? "border-accent" : "border-transparent"}
                variant={group.value === option.value ? "secondary" : "default"}
              >
                <RadioGroup.Item
                  value={option.value}
                  accessibilityLabel={option.label}
                  style={{ width: "100%", padding: 12, paddingBottom: 0 }}
                >
                  <View pointerEvents="none" style={{ width: "100%", gap: 8 }}>
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
                        <option.icon size={20} color={accent} accessible={false} />
                      </View>
                      <Radio
                        accessible={false}
                        pointerEvents="none"
                        importantForAccessibility="no-hide-descendants"
                      />
                    </View>
                  </View>
                </RadioGroup.Item>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingBottom: 12,
                  }}
                >
                  <Typography
                    className="font-semibold text-foreground"
                    style={{ flexShrink: 1 }}
                    onPress={() => {
                      if (!busy) group.change(option.value);
                    }}
                  >
                    {option.label}
                  </Typography>
                </View>
              </Card>
            ))}
          </RadioGroup>
        </View>
      ))}
      {warnAssistance ? (
        <ConfirmDialog
          title={t("Assisted")}
          description={t(
            "Assistance recalculates the allocation when planning changes. Switching to Assisted can change the allocation; confirmation always requires a manager.",
          )}
          busy={busy}
          onCancel={() => setWarnAssistance(false)}
          actions={[
            {
              label: t("Assisted"),
              variant: "primary",
              onPress: () => {
                form.patch({ planningMode: "ASSISTED" });
                setWarnAssistance(false);
              },
            },
          ]}
        />
      ) : null}
    </View>
  );
}
