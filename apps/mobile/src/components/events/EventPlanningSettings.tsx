import type { useEventRecordForm } from "@board-game-organizer/shared";
import { Card } from "heroui-native/card";
import { Radio } from "heroui-native/radio";
import { RadioGroup } from "heroui-native/radio-group";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
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
          help: t(
            "Manual planning keeps the current seats. Every seated player must agree before a manager can confirm.",
          ),
        },
        {
          value: "ASSISTED",
          label: t("Assisted"),
          help: t(
            "Assistance recalculates the allocation when planning changes. Switching to Assisted can change the allocation; confirmation always requires a manager.",
          ),
        },
      ],
    },
    {
      value: draft.playerPreference ?? "MORE_PLAYERS",
      name: t("Player count"),
      change: (value: string) => form.patch({ playerPreference: value as "MORE_PLAYERS" | "BEST" }),
      options: [
        {
          value: "MORE_PLAYERS",
          label: t("More players"),
          help: t("Maximize participation before preferring BGG player-count recommendations."),
        },
        {
          value: "BEST",
          label: t("Ideal count (BGG Best)"),
          help: t(
            "Prefer BGG Best player counts. Allow reduction for Best explicitly permits assistance to reduce the seated group; locked players remain protected.",
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
              style={{ flex: 1, minWidth: 0, padding: 12 }}
              variant={group.value === option.value ? "secondary" : "default"}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "space-between",
                }}
              >
                <RadioGroup.Item
                  value={option.value}
                  accessibilityLabel={option.label}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Radio />
                  <Typography style={{ flex: 1, flexShrink: 1 }}>{option.label}</Typography>
                </RadioGroup.Item>
                <HelpPopover label={`${option.label}: ${t("Field help")}`} title={option.label}>
                  {option.help}
                </HelpPopover>
              </View>
              {option.value === "BEST" && group.value === "BEST" ? (
                <View style={{ gap: 8 }}>
                  <Typography>{t("Allow reduction for Best")}</Typography>
                  <Switch
                    accessibilityLabel={t("Allow reduction for Best")}
                    isSelected={draft.allowBestReduction ?? false}
                    isDisabled={busy}
                    onSelectedChange={(allowBestReduction) => form.patch({ allowBestReduction })}
                  />
                </View>
              ) : null}
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
