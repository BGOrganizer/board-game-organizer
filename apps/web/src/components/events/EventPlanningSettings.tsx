"use client";
import type { useEventRecordForm } from "@board-game-organizer/shared";
import { Card, Radio, RadioGroup } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Hand, Sparkles, Trophy, Users } from "lucide-react";
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
          icon: Hand,
          help: t`Manual planning keeps the current seats. Every seated player must agree before a manager can confirm.`,
        },
        {
          value: "ASSISTED",
          label: t`Assisted`,
          icon: Sparkles,
          help: t`Assistance recalculates the allocation when planning changes. Switching to Assisted can change the allocation; confirmation always requires a manager.`,
        },
      ],
    },
    {
      value: draft.playerPreference ?? "MORE_PLAYERS",
      name: t`Player count`,
      change: (value: string) =>
        form.patch({
          playerPreference: value as "MORE_PLAYERS" | "BEST",
          allowBestReduction: value === "BEST",
        }),
      options: [
        {
          value: "MORE_PLAYERS",
          label: t`Players`,
          icon: Users,
          help: t`Maximize participation before preferring BGG player-count recommendations.`,
        },
        {
          value: "BEST",
          label: t`BGG Best`,
          icon: Trophy,
          help: t`Prefer the player count rated Best by the BGG community. Selecting BGG Best allows Assisted planning to reduce the seated group to reach that count. Locked seats and pending invitations remain protected; Manual planning never removes players automatically.`,
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
              className={`min-h-28 min-w-0 border-2 p-0 ${group.value === option.value ? "border-accent" : "border-transparent"}`}
              variant={group.value === option.value ? "secondary" : "default"}
            >
              <Radio
                id={`event-setting-${option.value}`}
                value={option.value}
                aria-label={option.label}
                className="w-full"
              >
                <Radio.Content className="flex w-full flex-col items-stretch p-3 pb-0">
                  <span className="inline-flex w-full items-center justify-between gap-2">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-default text-accent">
                      <option.icon className="size-5" aria-hidden />
                    </span>
                    <Radio.Control className="size-5 shrink-0">
                      <Radio.Indicator />
                    </Radio.Control>
                  </span>
                </Radio.Content>
              </Radio>
              <div className="flex min-w-0 items-center gap-1 px-3 pb-3">
                <label
                  htmlFor={`event-setting-${option.value}`}
                  className="min-w-0 break-words font-semibold text-foreground"
                >
                  {option.label}
                </label>
                <HelpPopover label={`${option.label}: ${t`Field help`}`} title={option.label}>
                  {option.help}
                </HelpPopover>
              </div>
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
