import { Typography } from "heroui-native/text";
import { UserRound, UsersRound } from "lucide-react-native";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { useT } from "@/lib/i18n";
import { recordUserRoleIcons } from "@/lib/recordUserRoleIcons";

export function EventTableParticipantsHelp({ planning }: { planning: boolean }) {
  const t = useT();
  return (
    <HelpSectionCard
      title={t("Participants")}
      label={t("Table participants help")}
      icon={UsersRound}
    >
      <IconLegend
        items={[
          { icon: recordUserRoleIcons.accepted, description: t("Accepted player") },
          { icon: recordUserRoleIcons.invitation, description: t("Invitation pending") },
          { icon: recordUserRoleIcons.waiting, description: t("Player on the waiting list") },
          { icon: recordUserRoleIcons.demonstrator, description: t("Demonstrator") },
          { icon: UserRound, description: t("Guest") },
        ]}
      />
      {planning ? (
        <>
          <Typography className="text-foreground">
            {t(
              "When registration is open, select a free place or the waiting list, complete any required votes and confirm.",
            )}
          </Typography>
          <Typography className="text-foreground">
            {t("If all seats are taken, new players join the waiting list.")}
          </Typography>
          <Typography className="text-foreground">
            {t(
              "Accepted players on the waiting list can vote. A manager or the app can assign them a seat under the table's rules.",
            )}
          </Typography>
          <Typography className="text-foreground">
            {t("Pending invitations do not count toward agreement.")}
          </Typography>
        </>
      ) : (
        <Typography className="text-foreground">
          {t("Only players with a confirmed seat take part at this table.")}
        </Typography>
      )}
    </HelpSectionCard>
  );
}
