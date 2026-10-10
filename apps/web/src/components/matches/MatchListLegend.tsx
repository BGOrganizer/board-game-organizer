"use client";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Crown } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

export function MatchListLegend() {
  const { t } = useLingui();
  return (
    <div className="mb-3 flex items-center gap-1">
      <span className="text-sm font-medium">{t`Table list`}</span>
      <HelpPopover label={t`Table list`} title={t`Table list`}>
        <div className="max-w-xs space-y-3">
          <p className="flex items-start gap-2">
            <Crown className="size-4 shrink-0 text-warning" aria-hidden />
            {t`The crown identifies the match administrator.`}
          </p>
          <p className="flex items-start gap-2">
            <CalendarDays className="size-4 shrink-0 text-accent" aria-hidden />
            {t`The calendar identifies a table belonging to an event.`}
          </p>
        </div>
      </HelpPopover>
    </div>
  );
}
