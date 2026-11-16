"use client";
import { useLingui } from "@lingui/react/macro";
import { Check, Minus, X } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
export function EventVoteLegend({
  label,
  scope = "event",
}: {
  label: string;
  scope?: "event" | "table";
}) {
  const { t } = useLingui();
  return (
    <HelpPopover label={`${label}: ${t`Voting legend`}`} title={label}>
      <div className="space-y-3">
        {[
          { Icon: Check, label: t`Yes`, color: "text-success" },
          { Icon: Minus, label: t`If needed`, color: "text-warning" },
          { Icon: X, label: t`No`, color: "text-danger" },
        ].map(({ Icon, label, color }) => (
          <p key={label} className="flex items-center gap-2">
            <Icon className={`size-4 ${color}`} aria-hidden />
            {label}
          </p>
        ))}
        <p className="text-sm text-muted">
          {scope === "table"
            ? t`You can vote only if you are an accepted participant at this table.`
            : t`You can vote only if you are an accepted participant in at least one table in the event.`}
        </p>
        <p className="text-sm text-muted">{t`Choose at least one "Yes" or "If needed" option in this category.`}</p>
      </div>
    </HelpPopover>
  );
}
