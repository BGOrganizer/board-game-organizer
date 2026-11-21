"use client";

import { useLingui } from "@lingui/react/macro";
import { UserRound } from "lucide-react";
import { IconBadge } from "@/components/common/ui/IconBadge";

export function EventGuestBadge() {
  const { t } = useLingui();
  return (
    <IconBadge icon={UserRound} label={t`Guest`} title={t`Guest`} color="accent">
      <p>{t`This player is a guest. An organizer can vote on their behalf.`}</p>
    </IconBadge>
  );
}
