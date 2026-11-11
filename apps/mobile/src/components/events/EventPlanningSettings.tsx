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
import { HelpPopover } from "@/components/common/ui/HelpPopover";
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
      change: chooseMode,
      options: [
        {
          value: "MANUAL",
          label: t("Manual"),
          icon: Hand,
          help: t(
            "Manual planning keeps the current seats. Every seated player must agree before a manager can confirm.",
          ),
        },
        {
          value: "ASSISTED",
          label: t("Assisted"),
          icon: Sparkles,
          help: t(
            "Assistance recalculates the allocation when planning changes. Switching to Assisted can change the allocation; confirmation always requires a manager.",
          ),
        },
      ],
    },
    {
      value: draft.playerPreference ?? "MORE_PLAYERS",
      name: t("Player count"),
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
          help: t("Maximize participation before preferring BGG player-count recommendations."),
        },
        {
          value: "BEST",
          label: t("BGG Best"),
          icon: Trophy,
          help: t(
            "Prefer the player count rated Best by the BGG community. Selecting BGG Best allows Assisted planning to reduce the seated group to reach that count. Locked seats and pending invitations remain protected; Manual planning never removes players automatically.",
          ),
        },
      ],
    },
  ];
  return (
    <View style={{ gap: 12 }}>
      <SearchHelpLabel
        label={t("Settings")}
        helpTitle={t("Field help")}
        help={t(
          "These settings apply to every table. Confirmation is always manual. Pending invitations keep their reserved positions. Locked players keep their exact seats; departures and removals compact everyone and promote the queue.",
        )}
      />
      {groups.map((group) => (
        <RadioGroup
          key={group.name}
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
                <HelpPopover label={`${option.label}: ${t("Field help")}`} title={option.label}>
                  {option.help}
                </HelpPopover>
              </View>
            </Card>
          ))}
        </RadioGroup>
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
