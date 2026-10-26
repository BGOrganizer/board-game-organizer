"use client";

import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserRoundPlus, X } from "lucide-react";

export function GroupJoinRequest({
  pending,
  busy,
  onRequest,
  onCancel,
}: {
  pending: boolean;
  busy: boolean;
  onRequest: () => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="mx-auto mt-4 flex w-full max-w-md flex-col items-center gap-3 text-center">
      {pending ? (
        <p>{t`Membership pending. Events, rankings and group social actions are unavailable until acceptance.`}</p>
      ) : null}
      <Button
        isDisabled={busy}
        variant={pending ? "danger-soft" : "primary"}
        onPress={pending ? onCancel : onRequest}
      >
        {pending ? (
          <X className="size-4" aria-hidden />
        ) : (
          <UserRoundPlus className="size-4" aria-hidden />
        )}
        {pending ? t`Cancel request` : t`Request membership`}
      </Button>
    </div>
  );
}
