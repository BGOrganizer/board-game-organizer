"use client";
import { useLingui } from "@lingui/react/macro";
import { Mail, UserRoundCheck } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
export function EventSeatListHeading({ waiting }: { waiting: boolean }) {
  const { t } = useLingui();
  const title = waiting ? t`Waiting list` : t`Seats list`;
  return (
    <div className="flex items-center gap-1">
      <h2 className="font-semibold">{title}</h2>
      <HelpPopover label={`${title}: ${t`Field help`}`} title={title}>
        {waiting ? (
          <p>{t`Accepted players on the waiting list can vote. They may play if an administrator or the app selects them according to the table's rules.`}</p>
        ) : (
          <>
            <IconLegend
              items={[
                { icon: UserRoundCheck, description: t`Accepted player` },
                { icon: Mail, description: t`Invitation pending` },
              ]}
            />
            <p className="mt-3 text-sm">{t`Pending invitations do not count toward agreement.`}</p>
          </>
        )}
      </HelpPopover>
    </div>
  );
}
