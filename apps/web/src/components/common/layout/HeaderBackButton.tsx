"use client";

import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import type { Ref } from "react";
import { HEADER_ICON_CLASS, headerButtonProps } from "./headerStyles";

export function HeaderBackButton({
  onPress,
  isDisabled,
  ref,
}: {
  onPress: () => void;
  isDisabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const { t } = useLingui();
  return (
    <Button
      {...headerButtonProps}
      ref={ref}
      variant="ghost"
      aria-label={t`Back`}
      isDisabled={isDisabled}
      onPress={onPress}
    >
      <ArrowLeft className={HEADER_ICON_CLASS} aria-hidden />
    </Button>
  );
}
