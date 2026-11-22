"use client";
import { useLingui } from "@lingui/react/macro";
import { UserRound, UsersRound } from "lucide-react";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { recordUserRoleIcons } from "@/lib/recordUserRoleIcons";

export function EventTableParticipantsHelp({ planning }: { planning: boolean }) {
  const { t } = useLingui();
  return (
    <HelpSectionCard title={t`Participants`} label={t`Table participants help`} icon={UsersRound}>
      <IconLegend
        items={[
          { icon: recordUserRoleIcons.accepted, description: t`Accepted player` },
          { icon: recordUserRoleIcons.invitation, description: t`Invitation pending` },
          { icon: recordUserRoleIcons.waiting, description: t`Player on the waiting list` },
          { icon: recordUserRoleIcons.demonstrator, description: t`Demonstrator` },
          { icon: UserRound, description: t`Guest` },
        ]}
      />
      {planning ? (
        <>
          <p>{t`When registration is open, select a free place or the waiting list, complete any required votes and confirm.`}</p>
          <p>{t`If all seats are taken, new players join the waiting list.`}</p>
          <p>{t`Accepted players on the waiting list can vote. A manager or the app can assign them a seat under the table's rules.`}</p>
          <p>{t`Pending invitations do not count toward agreement.`}</p>
        </>
      ) : (
        <p>{t`Only players with a confirmed seat take part at this table.`}</p>
      )}
    </HelpSectionCard>
  );
}
