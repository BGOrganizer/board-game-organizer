"use client";
import { FieldError, Input, Label, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Clock3 } from "lucide-react";
import { useId } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";

export function EventDateTimeField({
  label,
  value,
  mode,
  day,
  onChange,
  min,
  max,
  error,
  help,
}: {
  label: string;
  value: string;
  mode: "date" | "time";
  day?: string;
  min?: string;
  max?: string;
  error?: string;
  help?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const id = useId();
  const part = (wall: string) => (mode === "date" ? wall.slice(0, 10) : wall.slice(11, 16));
  const Icon = mode === "date" ? CalendarDays : Clock3;
  return (
    <TextField
      value={part(value)}
      isInvalid={Boolean(error)}
      onChange={(selected) => {
        const next = selected ? (mode === "date" ? `${selected}T00:00` : `${day}T${selected}`) : "";
        if (!next || ((!min || next >= min) && (!max || next <= max))) onChange(next);
      }}
    >
      {help ? (
        <SearchHelpLabel label={label} help={help} helpTitle={t`Field help`} htmlFor={id} />
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <GroupedList>
        <GroupedRow className="gap-2 focus-within:ring-2 focus-within:ring-primary">
          <Icon className="size-5 shrink-0 text-default-500" aria-hidden />
          <Input
            id={id}
            name={mode === "date" ? "event-date" : "event-time"}
            type={mode}
            min={min ? part(min) : undefined}
            max={max ? part(max) : undefined}
            disabled={Boolean((mode === "time" && !day) || (min && max && min > max))}
            className="min-h-11 min-w-0 flex-1 border-0 bg-transparent"
            onClick={(event) => event.currentTarget.showPicker?.()}
          />
        </GroupedRow>
      </GroupedList>
      <FieldError>
        <span role="alert">{error}</span>
      </FieldError>
    </TextField>
  );
}
