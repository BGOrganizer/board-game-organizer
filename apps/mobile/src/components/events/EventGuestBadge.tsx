import { Typography } from "heroui-native/text";
import { UserRound } from "lucide-react-native";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { useT } from "@/lib/i18n";

export function EventGuestBadge() {
  const t = useT();
  return (
    <IconBadge icon={UserRound} label={t("Guest")} title={t("Guest")} color="accent">
      <Typography>{t("This player is a guest. An organizer can vote on their behalf.")}</Typography>
    </IconBadge>
  );
}
