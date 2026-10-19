"use client";
import { useLingui } from "@lingui/react/macro";
import { Check, HelpCircle, Minus, X } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
export function EventVoteLegend() {
  const { t } = useLingui();
  return (
    <HelpPopover label={t`Voting legend`} title={t`Voting legend`}>
      <div className="space-y-3">
        {[
          { Icon: Check, label: t`Yes` },
          { Icon: Minus, label: t`If needed` },
          { Icon: X, label: t`No` },
          { Icon: HelpCircle, label: t`Unknown` },
        ].map(({ Icon, label }) => (
          <p key={label} className="flex items-center gap-2">
            <Icon className="size-4" aria-hidden />
            {label}
          </p>
        ))}
        <p className="text-sm text-default-500">{t`Pending invitations reserve a place but do not vote or count toward agreement. Accepted waiting players may vote.`}</p>
      </div>
    </HelpPopover>
  );
}
