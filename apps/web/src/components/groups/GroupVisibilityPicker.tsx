"use client";

import { Card, Radio, RadioGroup } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Globe, LockKeyhole } from "lucide-react";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";

export function GroupVisibilityPicker({
  value,
  disabled,
  onChange,
}: {
  value: "PRIVATE" | "PUBLIC";
  disabled: boolean;
  onChange: (value: "PRIVATE" | "PUBLIC") => void;
}) {
  const { t } = useLingui();
  const choices = [
    { value: "PRIVATE" as const, label: t`Private`, icon: LockKeyhole, color: "text-muted" },
    { value: "PUBLIC" as const, label: t`Public`, icon: Globe, color: "text-accent" },
  ];
  return (
    <div className="space-y-2">
      <SearchHelpLabel
        label={t`Group visibility`}
        helpTitle={t`Field help`}
        help={t`Private groups are invitation-only. Public groups are searchable and visible to all registered users after approval.`}
      />
      <RadioGroup
        name="group-visibility"
        aria-label={t`Group visibility`}
        value={value}
        isDisabled={disabled}
        onChange={(next) => onChange(next as "PRIVATE" | "PUBLIC")}
        orientation="horizontal"
        className="grid grid-cols-2 gap-3"
      >
        {choices.map((choice) => (
          <Card
            key={choice.value}
            variant={value === choice.value ? "secondary" : "default"}
            className={`min-w-0 border-2 p-0 ${value === choice.value ? "border-accent" : "border-transparent"}`}
          >
            <Radio value={choice.value} className="w-full">
              <Radio.Content
                aria-label={choice.label}
                className="flex min-h-[112px] w-full flex-col items-stretch gap-2 p-[12px]"
              >
                <span className="inline-flex w-full items-center justify-between gap-2">
                  <span
                    className={`inline-flex size-[36px] shrink-0 items-center justify-center rounded-lg bg-default ${choice.color}`}
                  >
                    <choice.icon className="size-[20px]" aria-hidden />
                  </span>
                  <Radio.Control className="size-[20px] shrink-0">
                    <Radio.Indicator />
                  </Radio.Control>
                </span>
                <span className="break-words font-semibold text-foreground">{choice.label}</span>
              </Radio.Content>
            </Radio>
          </Card>
        ))}
      </RadioGroup>
    </div>
  );
}
