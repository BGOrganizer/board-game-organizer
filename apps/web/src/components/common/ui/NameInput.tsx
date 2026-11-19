"use client";

import { RESOURCE_NAME_MAX_LENGTH, RESOURCE_NAME_MIN_LENGTH } from "@board-game-organizer/schemas";
import { generateName, type NameCategory } from "@board-game-organizer/shared";
import { Button, InputGroup } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Dices } from "lucide-react";
import type { ComponentProps } from "react";

export function NameInput({
  category,
  onGenerate,
  isDisabled,
  maxLength = RESOURCE_NAME_MAX_LENGTH,
  ...props
}: ComponentProps<typeof InputGroup.Input> & {
  category: NameCategory;
  onGenerate: (name: string) => void;
  isDisabled?: boolean;
}) {
  const { t, i18n } = useLingui();
  return (
    <InputGroup fullWidth>
      <InputGroup.Input
        {...props}
        minLength={RESOURCE_NAME_MIN_LENGTH}
        maxLength={maxLength}
        disabled={isDisabled}
      />
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
          <Dices className="size-5 text-accent" aria-hidden />
        </Button>
      </InputGroup.Suffix>
    </InputGroup>
  );
}
