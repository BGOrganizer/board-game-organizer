"use client";
import { useLingui } from "@lingui/react/macro";
import { CircleOff, Trophy } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

export function EventTableRatingInfo({ enabled }: { enabled: boolean }) {
  const { t } = useLingui();
  return (
    <HelpPopover
      size="compact"
      label={enabled ? t`Rating enabled` : t`Rating disabled`}
      title={t`Rating`}
      icon={enabled ? Trophy : CircleOff}
      tone={enabled ? "accent" : "muted"}
      triggerClassName="bg-default"
    >
      <p>
        {enabled
          ? t`This table contributes to player ratings when eligible results are finalized.`
          : t`This table does not update player ratings.`}
      </p>
    </HelpPopover>
  );
}
