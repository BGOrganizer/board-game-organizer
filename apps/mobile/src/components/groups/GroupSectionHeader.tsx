import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { isGroupManagerRole } from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
import { CalendarDays, Info, UsersRound } from "lucide-react-native";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { useT } from "@/lib/i18n";

export function GroupSectionHeader({
  group,
  section,
}: {
  group: GroupRecordResponse;
  section: "info" | "members" | "events";
}) {
  const t = useT();
  const isPublic = group.type === "PUBLIC";
  const sections = {
    info: {
      title: t("Details"),
      label: t("Group details help"),
      icon: Info,
      description: isPublic
        ? t("Approved public groups accept membership requests.")
        : t("Private groups are invitation-only."),
    },
    members: {
      title: t("Members"),
      label: t("Group members help"),
      icon: UsersRound,
      description: t("See who belongs to the group and what role each person has."),
    },
    events: {
      title: t("Events"),
      label: t("Group events help"),
      icon: CalendarDays,
      description: isPublic
        ? t(
            "Public events are open to everyone with an account. Private events are for group members.",
          )
        : t("Events in a private group are for its members."),
    },
  };
  const { title, label, icon, description } = sections[section];
  return (
    <HelpSectionCard title={title} label={label} icon={icon}>
      <Typography className="text-foreground">{description}</Typography>
      {section === "info" && group.location ? (
        <Typography className="text-foreground">
          {t("The group's verified venue and full address.")}
        </Typography>
      ) : null}
      {section === "members" && isGroupManagerRole(group.role) && group.canInvite ? (
        <Typography className="text-foreground">
          {isPublic
            ? t("Group managers can invite people and review membership requests.")
            : t("Group managers can invite people.")}
        </Typography>
      ) : null}
      {section === "events" ? (
        <Typography className="text-foreground">
          {t(
            "To take part, choose an event that is accepting registrations and join at least one table.",
          )}
        </Typography>
      ) : null}
    </HelpSectionCard>
  );
}
