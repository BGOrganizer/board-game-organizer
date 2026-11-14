import {
  type PendingAction,
  RECORD_USER_ROLES,
  type RecordUserRole,
} from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
import { IdCard } from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

export function EventRolePopover({
  roles,
  action,
  pending = false,
}: {
  roles: readonly RecordUserRole[];
  action?: PendingAction | null;
  pending?: boolean;
}) {
  const t = useT();
  return (
    <HelpPopover
      label={t("Roles and participation")}
      title={t("Roles and participation")}
      icon={IdCard}
      tone="muted"
      size="compact"
      triggerClassName="bg-default"
      width="content-fit"
    >
      <View style={{ gap: 8 }}>
        {roles.map((role) => (
          <Typography key={role} className="text-foreground">
            {t(RECORD_USER_ROLES[role].message)}
          </Typography>
        ))}
        {!roles.length ? (
          <Typography className="text-foreground">
            {pending ? t("Loading…") : t("You are not registered.")}
          </Typography>
        ) : null}
        {action ? (
          <Typography className="text-foreground">
            {t("Open details to accept or decline your invitation.")}
          </Typography>
        ) : null}
      </View>
    </HelpPopover>
  );
}
