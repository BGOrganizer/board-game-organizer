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
          <>
            <p>{t`When all places are reserved, new players join the waiting list. Priority is preserved, and a place may become available when another player leaves.`}</p>
            <p className="mt-2 text-sm">{t`Accepted waiting players may vote. Pending invitations do not vote or count toward agreement.`}</p>
            <p className="mt-2 text-sm">{t`Only the organizer and recipient can see pending invitation identities.`}</p>
          </>
        ) : (
          <>
            <IconLegend
              items={[
                { icon: UserRoundCheck, description: t`Accepted player` },
                { icon: Mail, description: t`Invitation pending` },
              ]}
            />
            <p className="mt-3 text-sm">{t`Pending invitations reserve a place but do not vote or count toward agreement.`}</p>
            <p className="mt-2 text-sm">{t`Free places allow joining or invitations. Places are not assigned physical seats.`}</p>
            <p className="mt-2 text-sm">{t`Only the organizer and recipient can see pending invitation identities.`}</p>
          </>
        )}
      </HelpPopover>
    </div>
  );
}
