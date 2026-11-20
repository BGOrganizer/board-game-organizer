"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserPlus, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { GroupedList } from "./GroupedList";
import { GroupedRow } from "./GroupedRow";

export function GuestNameRow({
  maxLength,
  isDisabled = false,
  onAdd,
}: {
  maxLength: number;
  isDisabled?: boolean;
  onAdd: (name: string) => void;
}) {
  const { t } = useLingui();
  const [value, setValue] = useState("");
  const name = value.trim();
  const valid = !isDisabled && name.length > 0 && name.length <= maxLength;
  function add() {
    if (valid) onAdd(name);
  }
  return (
    <GroupedList>
      <GroupedRow className="items-end">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-default">
          <UserRoundPlus className="size-5 text-muted" aria-hidden />
        </span>
        <TextField
          isDisabled={isDisabled}
          value={value}
          onChange={setValue}
          className="min-w-0 flex-1"
        >
          <Label>{t`Guest name`}</Label>
          <Input
            maxLength={maxLength}
            placeholder={t`Add a guest`}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                add();
              }
            }}
          />
        </TextField>
        <Button
          isIconOnly
          size="sm"
          variant="primary"
          className="min-h-11 min-w-11"
          aria-label={t`Add a guest`}
          isDisabled={!valid}
          onPress={add}
        >
          <UserPlus className="size-4" aria-hidden />
        </Button>
      </GroupedRow>
    </GroupedList>
  );
}
