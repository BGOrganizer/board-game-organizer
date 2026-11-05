import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import { type GroupPersonAction, groupPersonActions } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Ban, ShieldMinus, ShieldPlus, UserRoundMinus } from "lucide-react-native";
import { MemberActions } from "@/components/common/ui/MemberActions";
import { useT } from "@/lib/i18n";

export function GroupMemberActions({
  group,
  person,
  busy,
  onAction,
  onOpenChange,
}: {
  group: GroupRecordResponse;
  person: GroupPersonResponse;
  busy: boolean;
  onAction: (action: GroupPersonAction) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT(),
    foreground = useThemeColor("foreground");
  const allowed = groupPersonActions(group, person);
  const items = [
    {
      action: "ban",
      label: t("Ban from group"),
      icon: <Ban size={20} color={foreground} accessible={false} />,
    },
    {
      action: "remove",
      label: t("Remove member"),
      icon: <UserRoundMinus size={20} color={foreground} accessible={false} />,
    },
    {
      action: "promote",
      label: t("Make moderator"),
      icon: <ShieldPlus size={20} color={foreground} accessible={false} />,
    },
    {
      action: "demote",
      label: t("Demote to member"),
      icon: <ShieldMinus size={20} color={foreground} accessible={false} />,
    },
  ] as const;
  return (
    <MemberActions
      title={`${t("Manage member")}: ${person.username || person.name || t("Username unavailable")}`}
      busy={busy}
      items={items.filter((item) => allowed.includes(item.action))}
      onAction={onAction}
      onOpenChange={onOpenChange}
    />
  );
}
