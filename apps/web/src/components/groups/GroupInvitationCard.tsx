"use client";
import { notificationItemId } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, X } from "lucide-react";
import { ListCard } from "@/components/common/ui/ListCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
export function GroupInvitationCard({
  groupId,
  busy,
  onAccept,
  onDecline,
}: {
  groupId: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="mx-auto mt-4 w-full max-w-md">
      <ListCard>
        <div className="space-y-3 p-4 text-center">
          <div className="flex min-w-0 items-center justify-center gap-2">
            <h2 className="min-w-0 font-semibold">{t`Invitation received`}</h2>
            <NotificationItem itemId={notificationItemId(groupId, "invitation")} />
          </div>
          <p className="text-sm text-muted">{t`Membership pending. Events, rankings and group social actions are unavailable until acceptance.`}</p>
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
