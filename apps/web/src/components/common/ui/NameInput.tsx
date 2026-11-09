"use client";

import { generateName, type NameCategory } from "@board-game-organizer/shared";
import { Button, InputGroup } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Dices } from "lucide-react";
import type { ComponentProps } from "react";

export function NameInput({
  category,
  onGenerate,
  isDisabled,
  maxLength = 120,
  ...props
}: ComponentProps<typeof InputGroup.Input> & {
  category: NameCategory;
  onGenerate: (name: string) => void;
  isDisabled?: boolean;
}) {
  const { t, i18n } = useLingui();
  return (
    <InputGroup fullWidth>
      <InputGroup.Input {...props} maxLength={maxLength} disabled={isDisabled} />
      <InputGroup.Suffix>
        <Button
          type="button"
          slot={null}
          isIconOnly
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-11"
          isDisabled={isDisabled}
          aria-label={t`Generate a random name`}
          onPress={() =>
            onGenerate(
              generateName(category, i18n.locale.startsWith("it") ? "it" : "en").slice(
                0,
                maxLength,
              ),
            )
          }
        >
          <Dices className="size-4" aria-hidden />
        </Button>
      </InputGroup.Suffix>
    </InputGroup>
  );
}
