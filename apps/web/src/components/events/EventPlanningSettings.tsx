"use client";
import type { useEventRecordForm } from "@board-game-organizer/shared";
import { Card, Radio, RadioGroup, Switch } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
export function EventPlanningSettings({
  form,
  busy,
}: {
  form: ReturnType<typeof useEventRecordForm>;
  busy: boolean;
}) {
  const { t } = useLingui();
  const { draft } = form;
  const [warnAssistance, setWarnAssistance] = useState(false);
  const chooseMode = (value: string) => {
    if (value === "ASSISTED" && draft.planningMode === "MANUAL") setWarnAssistance(true);
    else form.patch({ planningMode: value as "MANUAL" | "ASSISTED" });
  };
  const groups = [
    {
      value: draft.planningMode ?? "ASSISTED",
      name: t`Planning mode`,
      change: chooseMode,
      options: [
        {
          value: "MANUAL",
          label: t`Manual`,
          help: t`Manual planning keeps the current seats. Every seated player must agree before a manager can confirm.`,
        },
        {
          value: "ASSISTED",
          label: t`Assisted`,
          help: t`Assistance recalculates the allocation when planning changes. Switching to Assisted can change the allocation; confirmation always requires a manager.`,
        },
      ],
    },
    {
      value: draft.playerPreference ?? "MORE_PLAYERS",
      name: t`Player count`,
      change: (value: string) => form.patch({ playerPreference: value as "MORE_PLAYERS" | "BEST" }),
      options: [
        {
          value: "MORE_PLAYERS",
          label: t`More players`,
          help: t`Maximize participation before preferring BGG player-count recommendations.`,
        },
        {
          value: "BEST",
          label: t`Ideal count (BGG Best)`,
          help: t`Prefer BGG Best player counts. Allow reduction for Best explicitly permits assistance to reduce the seated group; locked players remain protected.`,
        },
      ],
    },
  ];
  return (
    <section className="space-y-3">
      <SearchHelpLabel
        label={t`Settings`}
        helpTitle={t`Field help`}
        help={t`These settings apply to every table. Confirmation is always manual. Pending invitations keep their reserved positions. Locked players keep their exact seats; departures and removals compact everyone and promote the queue.`}
      />
      {groups.map((group) => (
        <RadioGroup
          key={group.name}
          aria-label={group.name}
          value={group.value}
          isDisabled={busy}
          onChange={group.change}
          className="grid grid-cols-2 gap-3"
        >
          {group.options.map((option) => (
            <Card
              key={option.value}
              className="min-w-0 p-3"
              variant={group.value === option.value ? "secondary" : "default"}
            >
              <div className="flex items-center justify-between gap-2">
                <Radio value={option.value} className="min-w-0 flex-1">
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <Radio.Content className="min-w-0 break-words">{option.label}</Radio.Content>
                </Radio>
                <HelpPopover label={`${option.label}: ${t`Field help`}`} title={option.label}>
                  {option.help}
                </HelpPopover>
              </div>
              {option.value === "BEST" && group.value === "BEST" ? (
                <Switch
                  aria-label={t`Allow reduction for Best`}
                  isSelected={draft.allowBestReduction ?? false}
                  isDisabled={busy}
                  onChange={(allowBestReduction) => form.patch({ allowBestReduction })}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    {t`Allow reduction for Best`}
                  </Switch.Content>
                </Switch>
              ) : null}
            </Card>
          ))}
        </RadioGroup>
      ))}
      {warnAssistance ? (
        <ContactConfirmDialog
          title={t`Assisted`}
          description={t`Assistance recalculates the allocation when planning changes. Switching to Assisted can change the allocation; confirmation always requires a manager.`}
          busy={busy}
          onCancel={() => setWarnAssistance(false)}
          actions={[
            {
              label: t`Assisted`,
              variant: "primary",
              onPress: () => {
                form.patch({ planningMode: "ASSISTED" });
                setWarnAssistance(false);
              },
            },
          ]}
        />
      ) : null}
    </section>
  );
}
