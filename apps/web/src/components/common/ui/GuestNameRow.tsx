"use client";

import { Button, Input, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { GroupedList } from "./GroupedList";
import { GroupedRow } from "./GroupedRow";
import { HelpPopover } from "./HelpPopover";

export function GuestNameRow({
  maxLength,
  isDisabled = false,
  onAdd,
}: {
  maxLength: number;
  isDisabled?: boolean;
  onAdd: (name: string, reset: () => void) => void;
}) {
  const { t } = useLingui();
  const [value, setValue] = useState("");
  const name = value.trim();
  const valid = !isDisabled && name.length > 0 && name.length <= maxLength;
  function add() {
    if (valid) onAdd(name, () => setValue(""));
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <UserRound className="size-4 text-muted" aria-hidden />
        <span className="font-semibold">{t`Guest`}</span>
        <HelpPopover label={t`About guests`} title={t`Guest`} size="compact">
          {t`Add someone who does not have a Board Game Organizer account.`}
        </HelpPopover>
      </div>
      <GroupedList>
        <GroupedRow>
          <TextField
            isDisabled={isDisabled}
            value={value}
            onChange={setValue}
            className="min-w-0 flex-1"
          >
            <Input
              aria-label={t`Guest name`}
              className="w-full py-1"
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
            <Plus className="size-4" aria-hidden />
          </Button>
        </GroupedRow>
      </GroupedList>
    </div>
  );
}
