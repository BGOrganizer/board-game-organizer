"use client";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, X } from "lucide-react";
import { ListCard } from "@/components/common/ui/ListCard";
export function GroupInvitationCard({
  busy,
  onAccept,
  onDecline,
}: {
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="mx-auto mt-4 w-full max-w-md">
      <ListCard>
        <div className="space-y-3 p-4 text-center">
          <h2 className="font-semibold">{t`Invitation received`}</h2>
          <p className="text-sm text-default-500">{t`Membership pending. Events, rankings and group social actions are unavailable until acceptance.`}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" isDisabled={busy} onPress={onAccept}>
              <Check className="size-4" aria-hidden />
              {t`Accept`}
            </Button>
            <Button variant="danger-soft" isDisabled={busy} onPress={onDecline}>
              <X className="size-4" aria-hidden />
              {t`Decline`}
            </Button>
          </div>
        </div>
      </ListCard>
    </div>
  );
}
