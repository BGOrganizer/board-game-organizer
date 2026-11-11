"use client";
import type { useEventRecordForm } from "@board-game-organizer/shared";
import { Card, Radio, RadioGroup } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Hand, Sparkles, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
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
      label: t`Mode`,
      help: t`Manual: managers arrange the seats. Assisted: the app seeks agreement and arranges players automatically. Both apply to every table, protect locked seats and pending invitations, compact the queue after departures, and require manual confirmation.`,
      change: chooseMode,
      options: [
        {
          value: "MANUAL",
          label: t`Manual`,
          icon: Hand,
        },
        {
          value: "ASSISTED",
          label: t`Assisted`,
          icon: Sparkles,
        },
      ],
    },
    {
      value: draft.playerPreference ?? "MORE_PLAYERS",
      name: t`Player count`,
      label: t`Preference`,
      help: t`Players prioritizes the largest number of participants. BGG Best prioritizes the player count preferred by the BGG community and allows fewer seated players in Assisted mode. Manual mode never removes players automatically.`,
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
        },
        {
          value: "BEST",
          label: t`BGG Best`,
          icon: Trophy,
        },
      ],
    },
  ];
  return (
    <section className="space-y-3">
      {groups.map((group) => (
        <div key={group.name} className="space-y-2">
          <SearchHelpLabel label={group.label} helpTitle={t`Field help`} help={group.help} />
          <RadioGroup
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
                </div>
              </Card>
            ))}
          </RadioGroup>
        </div>
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
