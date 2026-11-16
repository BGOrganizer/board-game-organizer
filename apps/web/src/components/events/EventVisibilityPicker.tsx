"use client";

import { Card, Radio, RadioGroup } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Globe, LockKeyhole } from "lucide-react";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";

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
  const { t } = useLingui();
  const choices = [
    { value: "PRIVATE" as const, label: t`Private`, icon: LockKeyhole, color: "text-muted" },
    {
      value: "PUBLIC" as const,
      label: t`Public`,
      icon: Globe,
      color: publicAllowed ? "text-accent" : "text-muted",
    },
  ];
  return (
    <section className="space-y-2">
      <SearchHelpLabel
        label={t`Event visibility`}
        helpTitle={t`Field help`}
        help={t`Public events are visible to everyone and can be joined without group membership. Select an approved public group to enable this option.`}
      />
      <RadioGroup
        name="event-visibility"
        aria-label={t`Event visibility`}
        value={value}
        isDisabled={busy || locked}
        orientation="horizontal"
        className="grid grid-cols-2 gap-3"
        onChange={(next) => {
          if (!locked && (next === "PRIVATE" || publicAllowed))
            onChange(next as "PRIVATE" | "PUBLIC");
        }}
      >
        {choices.map((choice) => (
          <Card
            key={choice.value}
            variant={value === choice.value ? "secondary" : "default"}
            className={`min-w-0 border-2 p-0 ${choice.value === "PUBLIC" && !publicAllowed ? "border-dashed border-separator" : value === choice.value ? "border-accent" : "border-transparent"}`}
          >
            <Radio
              value={choice.value}
              isDisabled={choice.value === "PUBLIC" && !publicAllowed}
              className="w-full"
            >
              <Radio.Content
                aria-label={choice.label}
                className="flex min-h-28 w-full flex-col items-stretch gap-2 p-3"
              >
                <span className="inline-flex w-full items-center justify-between gap-2">
                  <span
                    className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-default ${choice.color}`}
                  >
                    <choice.icon className="size-5" aria-hidden />
                  </span>
                  <Radio.Control className="size-5 shrink-0">
                    <Radio.Indicator />
                  </Radio.Control>
                </span>
                <span
                  className={`break-words font-semibold ${choice.value === "PUBLIC" && !publicAllowed ? "text-muted" : "text-foreground"}`}
                >
                  {choice.label}
                </span>
              </Radio.Content>
            </Radio>
          </Card>
        ))}
      </RadioGroup>
      {locked || !publicAllowed ? (
        <p className="text-sm text-muted">
          {locked
            ? t`Event visibility cannot be changed after creation.`
            : t`Select an approved public group to enable public events.`}
        </p>
      ) : null}
    </section>
  );
}
