"use client";
import { useLingui } from "@lingui/react/macro";
import { Clock3, ListOrdered, UserRoundCheck, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";

export function TableListHeading() {
  const { t } = useLingui();
  return (
    <div className="flex items-center gap-1">
      <h2 className="font-semibold">{t`Table list`}</h2>
      <HelpPopover label={t`Table legend`} title={t`Table legend`}>
        <IconLegend
          items={[
            { icon: UserRoundMinus, description: t`Minimum players` },
            { icon: UserRoundPlus, description: t`Maximum players` },
            { icon: UserRoundCheck, description: t`Accepted players, including the waiting list.` },
            { icon: ListOrdered, description: t`Waiting list` },
            {
              icon: Clock3,
              description: t`Pending players, including reserved waiting-list places.`,
            },
          ]}
        />
      </HelpPopover>
    </div>
  );
}
