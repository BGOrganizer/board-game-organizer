"use client";

import type { PendingAction, RecordUserRole } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { IdCard } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";

/** One neutral identity control; an invitation remains a separate explicit decision in details. */
export function EventRolePopover({
  roles,
  action,
  pending = false,
}: {
  roles: readonly RecordUserRole[];
  action?: PendingAction | null;
  pending?: boolean;
}) {
  const { t, i18n } = useLingui();
  return (
    <HelpPopover
      label={t`Roles and participation`}
      title={t`Roles and participation`}
      icon={IdCard}
      tone="muted"
      size="compact"
      triggerClassName="bg-default"
    >
      <ul className="space-y-2">
        {roles.map((role) => (
          <li key={role}>{i18n._(recordUserRoleMessages[role])}</li>
        ))}
      </ul>
      {!roles.length ? <p>{pending ? t`Loading…` : t`You are not registered.`}</p> : null}
      {action ? (
        <p className="mt-2">{t`Open details to accept or decline your invitation.`}</p>
      ) : null}
    </HelpPopover>
  );
}
