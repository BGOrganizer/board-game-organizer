"use client";
import { Input, Label, TextField } from "@heroui/react";
import { CalendarClock } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";

export function EventDateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField value={value} onChange={onChange}>
      <Label>{label}</Label>
      <GroupedList>
        <GroupedRow className="gap-2 focus-within:ring-2 focus-within:ring-primary">
          <CalendarClock className="size-5 shrink-0 text-default-500" aria-hidden />
          <Input
            type="datetime-local"
            className="min-h-11 min-w-0 flex-1 border-0 bg-transparent"
            onClick={(event) => event.currentTarget.showPicker?.()}
          />
        </GroupedRow>
      </GroupedList>
    </TextField>
  );
}
