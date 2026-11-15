"use client";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, X } from "lucide-react";

export function InvitationActions({
  pending,
  onAccept,
  onDecline,
}: {
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useLingui();
  return (
    <span className="flex items-center gap-1">
      <Button
        isIconOnly
        size="sm"
        variant="primary"
        isDisabled={pending}
        aria-label={t`Accept invitation`}
        onPress={onAccept}
      >
        <Check className="size-4" aria-hidden />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="danger-soft"
        isDisabled={pending}
        aria-label={t`Decline invitation`}
        onPress={onDecline}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </span>
  );
}
